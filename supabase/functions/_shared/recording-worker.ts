export type WorkerJob = {
  id: string;
  user_id: string;
  session_id: string;
  lease_token: string;
  attempts: number;
};
export type JobOutcome = {
  state: "queued" | "blocked" | "complete";
  error: string;
  delay: number;
};
const permanent = new Set([
  "ai_key_invalid",
  "ai_permission_denied",
  "ai_credit_exhausted",
  "ai_model_unavailable",
  "ai_audio_rejected",
  "ai_request_rejected",
  "ai_not_configured",
]);
/** Shared retry policy; raw errors never enter the persisted job or response. */
export function recordingJobFailure(
  attempts: number,
  code?: string,
  message?: string,
): JobOutcome {
  const blocked = permanent.has(code ?? "") || attempts >= 7;
  return {
    state: blocked ? "blocked" : "queued",
    delay: blocked ? 0 : Math.min(1800, 30 * 2 ** Math.min(attempts, 6)),
    error:
      message?.slice(0, 1000) ||
      "Bearbetningen kunde inte slutföras. Det sparade ljudet finns kvar.",
  };
}
export async function processRecordingJob(
  job: WorkerJob,
  request: (body: Record<string, unknown>) => Promise<Response>,
): Promise<JobOutcome> {
  try {
    const get = await request({ action: "get", id: job.session_id });
    if (get.status === 404) return { state: "complete", error: "", delay: 0 };
    if (!get.ok) return recordingJobFailure(job.attempts);
    const info = await get.json();
    if (info.session.state === "complete" && !info.session.summaryStale)
      return { state: "complete", error: "", delay: 0 };
    const pending: number[] = info.pendingIndices ?? [];
    // One lease handles a bounded batch; further batches are durable database jobs.
    const replies = await Promise.all(
      pending
        .slice(0, 4)
        .map((index) =>
          request({ action: "transcribe", id: job.session_id, index }),
        ),
    );
    for (const response of replies) {
      if (response.status === 409)
        return { state: "queued", error: "", delay: 15 };
      if (!response.ok) {
        const safe = await response.json().catch(() => ({}));
        return recordingJobFailure(job.attempts, safe.code, safe.error);
      }
    }
    if (pending.length) return { state: "queued", error: "", delay: 0 };
    if (info.session.state === "active")
      return { state: "complete", error: "", delay: 0 };
    const response = await request({ action: "summarize", id: job.session_id });
    if (response.status === 409)
      return { state: "queued", error: "", delay: 5 };
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      return recordingJobFailure(job.attempts, result.code, result.error);
    return { state: result.done ? "complete" : "queued", error: "", delay: 0 };
  } catch {
    return recordingJobFailure(job.attempts);
  }
}
export async function workerAuthorized(actual: string, expected: string) {
  if (!expected || expected.length < 32 || !actual) return false;
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
