import { expect, it, vi } from "vitest";
import {
  recordingAI,
  recordingAIError,
} from "../../supabase/functions/_shared/recording-ai";
import { wavDuration } from "../../supabase/functions/_shared/recording-schema";
import { checkedSummary } from "../../supabase/functions/_shared/recording-schema";
const options = {
  key: " PRIVATE_KEY ",
  transcriptionModel: "gpt-4o-mini-transcribe",
  summaryModel: "gpt-4.1-mini",
};
it("leaves evidence filtering to the handler so unsupported claims are not filtered twice", async () => {
  const raw = {
    agreements: Array.from({ length: 20 }, () => ({
      text: "Obelagt",
      owner: "",
      when: "",
      evidence: "Det här citatet saknas",
    })),
    nextSteps: [],
    uncertainties: ["Befintlig osäkerhet"],
  };
  const ai = recordingAI({
    ...options,
    fetch: async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(raw) } }],
      }),
  });
  const result = await ai.summarize("En annan transkription.");
  expect(result).toEqual(raw);
  expect(
    checkedSummary(result, "En annan transkription.").uncertainties,
  ).toHaveLength(21);
});
it.each([
  [401, "invalid_api_key", "ai_key_invalid"],
  [403, "permission_denied", "ai_permission_denied"],
  [429, "insufficient_quota", "ai_credit_exhausted"],
  [429, "rate_limit_exceeded", "ai_rate_limited"],
  [404, "model_not_found", "ai_model_unavailable"],
  [400, "invalid_value", "ai_audio_rejected"],
  [503, "server_error", "ai_unavailable"],
])(
  "reports a safe reason for provider status %s and code %s",
  async (status, code, expected) => {
    const ai = recordingAI({
      ...options,
      fetch: async () =>
        Response.json(
          { error: { code, message: "PRIVATE_KEY PRIVATE_TRANSCRIPT" } },
          { status, headers: { "x-request-id": "req_test-1" } },
        ),
    });
    const error = await ai.transcribe(new Uint8Array()).catch((e) => e);
    const safe = recordingAIError(error)!;
    expect(safe).toMatchObject({
      code: expected,
      stage: "transcription",
      requestId: "req_test-1",
    });
    expect(JSON.stringify(safe)).not.toContain("PRIVATE");
  },
);
it("tests both real model request shapes with a valid one-second WAV and no private material", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url, init) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer PRIVATE_KEY",
      );
      if (String(url).endsWith("audio/transcriptions")) {
        const form = init!.body as FormData;
        expect(form.get("model")).toBe(options.transcriptionModel);
        expect(form.get("language")).toBe("sv");
        expect(
          wavDuration(
            new Uint8Array(await (form.get("file") as Blob).arrayBuffer()),
          ),
        ).toBe(1000);
        return Response.json({ text: "" });
      }
      const body = JSON.parse(String(init!.body));
      expect(body.model).toBe(options.summaryModel);
      expect(body.messages[1].content).toContain("anslutningstest");
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                agreements: [],
                nextSteps: [],
                uncertainties: [],
              }),
            },
          },
        ],
      });
    });
  await recordingAI({ ...options, fetch: fetcher }).check();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("distinguishes an invalid summary from a missing installation and masks transport details", async () => {
  const ai = recordingAI({
    ...options,
    fetch: async () =>
      Response.json({
        choices: [{ message: { content: '{"agreements":null}' } }],
      }),
  });
  expect(
    recordingAIError(await ai.summarize("PRIVATE_TRANSCRIPT").catch((e) => e)),
  ).toMatchObject({ code: "ai_response_invalid", stage: "summary" });
  const offline = recordingAI({
    ...options,
    fetch: async () => {
      throw new TypeError("PRIVATE_KEY");
    },
  });
  expect(
    recordingAIError(
      await offline.transcribe(new Uint8Array()).catch((e) => e),
    ),
  ).toMatchObject({ code: "ai_unavailable" });
  const timeout = recordingAI({
    ...options,
    fetch: async () => {
      throw new DOMException("PRIVATE_KEY", "TimeoutError");
    },
  });
  expect(
    recordingAIError(
      await timeout.transcribe(new Uint8Array()).catch((e) => e),
    ),
  ).toMatchObject({ code: "ai_timeout" });
  expect(recordingAIError(new Error("PRIVATE_KEY"))).toBeUndefined();
});
