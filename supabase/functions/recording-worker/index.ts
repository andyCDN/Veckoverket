import { createClient } from "@supabase/supabase-js";
import { createRecordingStore } from "../_shared/recording-store.ts";
import { recordingHandler } from "../_shared/recording-handler.ts";
import { recordingAI } from "../_shared/recording-ai.ts";
import {
  processRecordingJob,
  workerAuthorized,
  type WorkerJob,
} from "../_shared/recording-worker.ts";
const token = Deno.env.get("RECORDING_WORKER_TOKEN") ?? "";
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
const store = createRecordingStore(client, true);
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (
    !(await workerAuthorized(
      request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "",
      token,
    ))
  )
    return new Response(null, { status: 401 });
  const claimed = await client.rpc("claim_recording_job");
  if (claimed.error)
    return Response.json(
      { error: "Serverkön kunde inte läsas." },
      { status: 503 },
    );
  const job = claimed.data?.[0] as WorkerJob | undefined;
  if (!job) return Response.json({ processed: 0 });
  const handler = recordingHandler({
    origin: "https://andycdn.github.io",
    configured: !!key,
    store,
    authenticate: async (value) =>
      value === "internal-job" ? job.user_id : null,
    transcribe: (audio) => ai.transcribe(audio, 45000),
    summarize: (text) => ai.summarize(text, 45000),
  });
  const outcome = await processRecordingJob(job, (body) =>
    handler(
      new Request("https://internal.invalid/recording", {
        method: "POST",
        headers: { authorization: "Bearer internal-job" },
        body: JSON.stringify(body),
      }),
    ),
  );
  const finished = await client.rpc("finish_recording_job", {
    p_id: job.id,
    p_lease: job.lease_token,
    p_state: outcome.state,
    p_error: outcome.error,
    p_delay: outcome.delay,
  });
  if (finished.error)
    return Response.json(
      { error: "Köns återförsök bevaras av servern." },
      { status: 503 },
    );
  return Response.json({ processed: 1, state: outcome.state });
});
