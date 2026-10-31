import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordingStore } from "./recording-handler.ts";
import {
  RECORDING_BUCKET,
  RecordingRevisionConflict,
  RecordingLeaseConflict,
  type RecordingSession,
} from "./recording-schema.ts";
export function createRecordingStore(
  client: SupabaseClient,
  workerConfigured = false,
): RecordingStore {
  let capabilityCache:
      | Promise<{ transcriptEditing: boolean; durableQueue: boolean }>
      | undefined,
    capabilityUntil = 0;
  async function features() {
    if (!capabilityCache || Date.now() > capabilityUntil) {
      capabilityUntil = Date.now() + 30000;
      capabilityCache = (async () => {
        const { data, error } = await client.rpc("recording_capabilities");
        return error
          ? { transcriptEditing: false, durableQueue: false }
          : {
              transcriptEditing: data?.transcriptEditing === true,
              durableQueue: workerConfigured && data?.durableQueue === true,
            };
      })();
    }
    return capabilityCache;
  }
  async function enqueue(user: string, id: string, reset = false) {
    if (!(await features()).transcriptEditing) return;
    const { error } = await client.rpc("enqueue_recording_job", {
      p_user: user,
      p_session: id,
      p_reset: reset,
    });
    if (error) throw error;
  }
  const job = (r: Record<string, any>) => ({
    state: r.state,
    attempts: r.attempts,
    nextAttemptAt: r.available_at,
    ...(r.last_error ? { error: r.last_error } : {}),
  });
  async function processing(user: string, id: string) {
    if (!(await features()).transcriptEditing) return undefined;
    const { data, error } = await client
      .from("recording_jobs")
      .select("state,attempts,available_at,last_error")
      .eq("user_id", user)
      .eq("session_id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? job(data) : undefined;
  }
  const session = (r: Record<string, any>): RecordingSession => ({
    id: r.id,
    title: r.title,
    context: r.context,
    state: r.state,
    startedAt: r.started_at,
    segmentCount: r.segment_count,
    ...(r.summary ? { summary: r.summary } : {}),
    transcriptRevision: r.transcript_revision ?? 0,
    summaryRevision: r.summary_revision ?? 0,
    summaryStale: (r.summary_revision ?? 0) < (r.transcript_revision ?? 0),
  });
  async function rows(user: string, id: string) {
    const all: Record<string, any>[] = [];
    for (let offset = 0; offset < 100000; offset += 500) {
      const { data, error } = await client
        .from("recording_segments")
        .select("*")
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
    features,
    async retryProcessing(user, id) {
      await enqueue(user, id, true);
    },
    async correctTranscript(user, id, index, text, revision) {
      const { error } = await client.rpc("correct_recording_transcript", {
        p_user: user,
        p_session: id,
        p_index: index,
        p_text: text,
        p_expected_revision: revision,
      });
      if (error?.code === "40001") throw new RecordingRevisionConflict();
      if (error) throw error;
    },
    async list(user) {
      const enhanced = (await features()).transcriptEditing;
      const { data, error } = await client
        .from("recording_sessions")
        .select(
          `id,title,context,state,started_at,segment_count${enhanced ? ",transcript_revision,summary_revision" : ""}`,
        )
        .eq("user_id", user)
        .order("started_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const sessions = (data ?? []) as unknown as Record<string, any>[];
      if (!enhanced || !sessions.length) return sessions.map(session);
      const jobs = await client
        .from("recording_jobs")
        .select("session_id,state,attempts,available_at,last_error")
        .eq("user_id", user)
        .in(
          "session_id",
          sessions.map((s) => s.id),
        );
      if (jobs.error) throw jobs.error;
      return sessions.map((r) => ({
        ...session(r),
        job: jobs.data.find((j) => j.session_id === r.id)
          ? job(jobs.data.find((j) => j.session_id === r.id)!)
          : undefined,
      }));
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
      return data
        ? { ...session(data), job: await processing(user, id) }
        : null;
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
          originalTranscript: r.original_transcript ?? r.transcript,
          revision: r.transcript_revision ?? 0,
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
      await enqueue(user, id);
    },
    async claim(user, id, index, hash, duration) {
      if ((await queueAudio(user, id, index, hash, duration)) === "ready")
        return "ready";
      const now = new Date().toISOString();
      const enhanced = (await features()).transcriptEditing,
        leaseToken = crypto.randomUUID();
      const claimed = await client
        .from("recording_segments")
        .update({
          state: "processing",
          lease_until: new Date(Date.now() + 120000).toISOString(),
          ...(enhanced ? { lease_token: leaseToken } : {}),
        })
        .eq("user_id", user)
        .eq("session_id", id)
        .eq("segment_index", index)
        .neq("state", "ready")
        .or(`state.neq.processing,lease_until.lt.${now}`)
        .select("segment_index");
      if (claimed.error) throw claimed.error;
      return claimed.data.length
        ? enhanced
          ? { state: "claimed", token: leaseToken }
          : "claimed"
        : "busy";
    },
    async saveTranscript(user, id, index, transcript, leaseToken) {
      const enhanced = (await features()).transcriptEditing;
      let request = client
        .from("recording_segments")
        .update({
          state: "ready",
          transcript,
          lease_until: null,
          ...(enhanced
            ? { original_transcript: transcript, lease_token: null }
            : {}),
        })
        .eq("user_id", user)
        .eq("session_id", id)
        .eq("segment_index", index)
        .eq("state", "processing");
      if (leaseToken) request = request.eq("lease_token", leaseToken);
      const { data, error } = await request.select("segment_index");
      if (error) throw error;
      if (!data?.length) throw new RecordingLeaseConflict();
    },
    async failSegment(user, id, index, leaseToken) {
      let request = client
        .from("recording_segments")
        .update({
          state: "error",
          lease_until: null,
          ...(leaseToken ? { lease_token: null } : {}),
        })
        .eq("user_id", user)
        .eq("session_id", id)
        .eq("segment_index", index)
        .eq("state", "processing");
      if (leaseToken) request = request.eq("lease_token", leaseToken);
      const { error } = await request;
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
      await enqueue(user, id);
    },
    async loadPart(user, id, index, revision = 0) {
      const { data, error } = await client
        .from("recording_summary_parts")
        .select("*")
        .eq("user_id", user)
        .eq("session_id", id)
        .eq("part_index", index)
        .maybeSingle();
      if (error) throw error;
      return data && (data.transcript_revision ?? 0) === revision
        ? data.summary
        : null;
    },
    async savePart(user, id, index, summary, revision = 0) {
      if ((await features()).transcriptEditing) {
        const { data, error } = await client.rpc(
          "save_recording_summary_part",
          {
            p_user: user,
            p_session: id,
            p_index: index,
            p_revision: revision,
            p_summary: summary,
          },
        );
        if (error) throw error;
        if (!data) throw new RecordingRevisionConflict();
        return;
      }
      const { error } = await client
        .from("recording_summary_parts")
        .upsert({ session_id: id, user_id: user, part_index: index, summary });
      if (error) throw error;
    },
    async complete(user, id, summary, revision = 0) {
      if ((await features()).transcriptEditing) {
        const { data, error } = await client.rpc("complete_recording_summary", {
          p_user: user,
          p_session: id,
          p_revision: revision,
          p_summary: summary,
        });
        if (error) throw error;
        if (!data) throw new RecordingRevisionConflict();
        return;
      }
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
  return store;
}
