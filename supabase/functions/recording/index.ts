import { recordingAI } from "../_shared/recording-ai.ts";
import { createClient } from "@supabase/supabase-js";
import {
  recordingHandler,
  type RecordingStore,
} from "../_shared/recording-handler.ts";
import {
  RECORDING_BUCKET,
  type RecordingSession,
} from "../_shared/recording-schema.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const key = (
  Deno.env.get("RECORDING_AI_KEY") ||
  Deno.env.get("OPENAI_API_KEY") ||
  ""
).trim();
const ai = recordingAI({
  key,
  transcriptionModel:
    Deno.env.get("RECORDING_TRANSCRIPTION_MODEL") || "gpt-4o-mini-transcribe",
  summaryModel: Deno.env.get("RECORDING_SUMMARY_MODEL") || "gpt-4.1-mini",
});
const session = (r: Record<string, any>): RecordingSession => ({
  id: r.id,
  title: r.title,
  context: r.context,
  state: r.state,
  startedAt: r.started_at,
  segmentCount: r.segment_count,
  ...(r.summary ? { summary: r.summary } : {}),
});
async function rows(user: string, id: string) {
  const all: Record<string, any>[] = [];
  for (let offset = 0; offset < 100000; offset += 500) {
    const { data, error } = await client
      .from("recording_segments")
      .select("segment_index,transcript,duration_ms,state,sha256,lease_until")
      .eq("user_id", user)
      .eq("session_id", id)
      .order("segment_index")
      .range(offset, offset + 499);
    if (error) throw error;
    all.push(...data);
    if (data.length < 500) break;
  }
  return all;
}
async function audioObjects(user: string, id: string) {
  const paths: string[] = [];
  for (let offset = 0; offset < 100000; offset += 500) {
    const { data, error } = await client.storage
      .from(RECORDING_BUCKET)
      .list(`${user}/${id}`, {
        limit: 500,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
    if (error) throw error;
    paths.push(
      ...data
        .filter((f) => /^\d{1,5}\.wav$/.test(f.name))
        .map((f) => `${user}/${id}/${f.name}`),
    );
    if (data.length < 500) break;
  }
  return paths;
}
async function queueAudio(
  user: string,
  id: string,
  index: number,
  hash: string,
  duration: number,
) {
  const inserted = await client.from("recording_segments").upsert(
    {
      session_id: id,
      user_id: user,
      segment_index: index,
      sha256: hash,
      duration_ms: duration,
      state: "pending",
    },
    { onConflict: "session_id,segment_index", ignoreDuplicates: true },
  );
  if (inserted.error) throw inserted.error;
  const read = await client
    .from("recording_segments")
    .select("state,sha256")
    .eq("user_id", user)
    .eq("session_id", id)
    .eq("segment_index", index)
    .single();
  if (read.error) throw read.error;
  if (read.data.sha256 !== hash) throw new Error("Audio hash mismatch");
  return String(read.data.state);
}
const store: RecordingStore = {
  async list(user) {
    const { data, error } = await client
      .from("recording_sessions")
      .select("id,title,context,state,started_at,segment_count")
      .eq("user_id", user)
      .order("started_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return data.map(session);
  },
  async create(user, title, context) {
    const { data, error } = await client
      .from("recording_sessions")
      .insert({ user_id: user, title, context })
      .select()
      .single();
    if (error) throw error;
    return session(data);
  },
  async load(user, id) {
    const { data, error } = await client
      .from("recording_sessions")
      .select()
      .eq("user_id", user)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? session(data) : null;
  },
  async categorize(user, id, title, context) {
    const { error } = await client
      .from("recording_sessions")
      .update({ title, context })
      .eq("user_id", user)
      .eq("id", id);
    if (error) throw error;
  },
  async segments(user, id) {
    return (await rows(user, id))
      .filter((r) => r.state === "ready")
      .map((r) => ({
        index: r.segment_index,
        transcript: r.transcript,
        durationMs: r.duration_ms,
      }));
  },
  async pending(user, id) {
    const ready = new Set(
      (await rows(user, id))
        .filter((r) => r.state === "ready")
        .map((r) => r.segment_index),
    );
    return (await audioObjects(user, id))
      .map((p) => Number(p.split("/").at(-1)!.slice(0, -4)))
      .filter((index) => !ready.has(index))
      .sort((a, b) => a - b);
  },
  async audio(user, id, index) {
    const { data, error } = await client.storage
      .from(RECORDING_BUCKET)
      .download(`${user}/${id}/${index}.wav`);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  },
  async received(user, id) {
    return (await rows(user, id)).map((r) => Number(r.segment_index));
  },
  async acknowledge(user, id, index, hash, duration) {
    await queueAudio(user, id, index, hash, duration);
  },
  async claim(user, id, index, hash, duration) {
    if ((await queueAudio(user, id, index, hash, duration)) === "ready")
      return "ready";
    const now = new Date().toISOString();
    const claimed = await client
      .from("recording_segments")
      .update({
        state: "processing",
        lease_until: new Date(Date.now() + 120000).toISOString(),
      })
      .eq("user_id", user)
      .eq("session_id", id)
      .eq("segment_index", index)
      .neq("state", "ready")
      .or(`state.neq.processing,lease_until.lt.${now}`)
      .select("segment_index");
    if (claimed.error) throw claimed.error;
    return claimed.data.length ? "claimed" : "busy";
  },
  async saveTranscript(user, id, index, transcript) {
    const { error } = await client
      .from("recording_segments")
      .update({ state: "ready", transcript, lease_until: null })
      .eq("user_id", user)
      .eq("session_id", id)
      .eq("segment_index", index);
    if (error) throw error;
  },
  async failSegment(user, id, index) {
    const { error } = await client
      .from("recording_segments")
      .update({ state: "error", lease_until: null })
      .eq("user_id", user)
      .eq("session_id", id)
      .eq("segment_index", index);
    if (error) throw error;
  },
  async stop(user, id, count) {
    const { error } = await client
      .from("recording_sessions")
      .update({
        state: "stopped",
        segment_count: count,
        stopped_at: new Date().toISOString(),
      })
      .eq("user_id", user)
      .eq("id", id)
      .eq("state", "active");
    if (error) throw error;
  },
  async loadPart(user, id, index) {
    const { data, error } = await client
      .from("recording_summary_parts")
      .select("summary")
      .eq("user_id", user)
      .eq("session_id", id)
      .eq("part_index", index)
      .maybeSingle();
    if (error) throw error;
    return data?.summary ?? null;
  },
  async savePart(user, id, index, summary) {
    const { error } = await client
      .from("recording_summary_parts")
      .upsert({ session_id: id, user_id: user, part_index: index, summary });
    if (error) throw error;
  },
  async complete(user, id, summary) {
    const { error } = await client
      .from("recording_sessions")
      .update({ state: "complete", summary })
      .eq("user_id", user)
      .eq("id", id)
      .eq("state", "stopped");
    if (error) throw error;
  },
  async remove(user, id) {
    const paths = await audioObjects(user, id);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await client.storage
        .from(RECORDING_BUCKET)
        .remove(paths.slice(i, i + 100));
      if (error) throw error;
    }
    const { error } = await client
      .from("recording_sessions")
      .delete()
      .eq("user_id", user)
      .eq("id", id);
    if (error) throw error;
  },
};
Deno.serve(
  recordingHandler({
    origin: Deno.env.get("APP_ORIGIN") || "https://andycdn.github.io",
    configured: !!key,
    store,
    async authenticate(token) {
      const { data, error } = await client.auth.getUser(token);
      return !error && data.user && !data.user.is_anonymous
        ? data.user.id
        : null;
    },
    transcribe: ai.transcribe,
    summarize: ai.summarize,
    checkAI: ai.check,
  }),
);
