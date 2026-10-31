import { it, expect } from "vitest";
import {
  processRecordingJob,
  recordingJobFailure,
  workerAuthorized,
} from "../../supabase/functions/_shared/recording-worker";
const job = {
  id: "job",
  session_id: "session",
  user_id: "owner",
  lease_token: "lease",
  attempts: 0,
};
it("kräver en separat serverhemlighet och accepterar inte en användartoken", async () => {
  expect(await workerAuthorized("user-token", "x".repeat(64))).toBe(false);
  expect(await workerAuthorized("x".repeat(64), "x".repeat(64))).toBe(true);
  expect(await workerAuthorized("", "")).toBe(false);
});
it("gör tidsbegränsade återförsök men stoppar vid kredit-, behörighets- och nyckelfel", () => {
  expect(recordingJobFailure(0, "ai_timeout")).toMatchObject({
    state: "queued",
    delay: 30,
  });
  expect(recordingJobFailure(4, "ai_rate_limited")).toMatchObject({
    state: "queued",
    delay: 480,
  });
  for (const code of [
    "ai_credit_exhausted",
    "ai_key_invalid",
    "ai_permission_denied",
    "ai_model_unavailable",
  ])
    expect(recordingJobFailure(0, code).state).toBe("blocked");
  expect(recordingJobFailure(7, "ai_timeout").state).toBe("blocked");
});
it("bearbetar en avgränsad batch och återköar kvarvarande ljud utan att behöva webbläsaren", async () => {
  const calls: Record<string, unknown>[] = [];
  const result = await processRecordingJob(job, async (body) => {
    calls.push(body);
    return Response.json(
      body.action === "get"
        ? { session: { state: "stopped" }, pendingIndices: [0, 1, 2, 3, 4, 5] }
        : { ready: true },
    );
  });
  expect(
    calls.filter((c) => c.action === "transcribe").map((c) => c.index),
  ).toEqual([0, 1, 2, 3]);
  expect(result).toEqual({ state: "queued", error: "", delay: 0 });
});
it("sparar delresultat, avslutar sammanfattningen och respekterar ett redan bearbetat segment", async () => {
  for (const done of [false, true])
    expect(
      (
        await processRecordingJob(job, async (body) =>
          Response.json(
            body.action === "get"
              ? { session: { state: "stopped" }, pendingIndices: [] }
              : { done },
          ),
        )
      ).state,
    ).toBe(done ? "complete" : "queued");
  expect(
    (
      await processRecordingJob(job, async (body) =>
        body.action === "get"
          ? Response.json({
              session: { state: "stopped" },
              pendingIndices: [0],
            })
          : Response.json({ error: "Bearbetas" }, { status: 409 }),
      )
    ).delay,
  ).toBe(15);
});
it("raderade inspelningar avslutar jobbet utan att återskapas", async () => {
  expect(
    await processRecordingJob(
      job,
      async () => new Response(null, { status: 404 }),
    ),
  ).toEqual({ state: "complete", error: "", delay: 0 });
});
