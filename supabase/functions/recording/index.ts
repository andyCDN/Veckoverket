import { recordingAI } from "../_shared/recording-ai.ts";
import { createClient } from "@supabase/supabase-js";
import { recordingHandler } from "../_shared/recording-handler.ts";
import { createRecordingStore } from "../_shared/recording-store.ts";
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
const store = createRecordingStore(
  client,
  (Deno.env.get("RECORDING_WORKER_TOKEN") ?? "").length >= 32,
);
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
