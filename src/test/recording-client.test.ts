import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordingClient } from "../lib/recording-client";
function fixture(error: unknown) {
  const invoke = vi.fn().mockResolvedValue({ data: null, error });
  const client = { functions: { invoke } } as unknown as SupabaseClient;
  return { invoke, call: recordingClient(client, "user").call };
}
it("keeps the server's safe AI reason and gives the two-model diagnostic enough time", async () => {
  const f = fixture({
    context: Response.json(
      {
        error: "OpenAI-projektets API-kredit eller budget är slut.",
        code: "ai_credit_exhausted",
      },
      { status: 503 },
    ),
  });
  await expect(f.call({ action: "check-ai" })).rejects.toThrow("API-kredit");
  expect(f.invoke).toHaveBeenCalledWith("recording", {
    body: { action: "check-ai" },
    timeout: 55000,
  });
});
it("distinguishes a network failure, expired login and missing installation", async () => {
  await expect(
    fixture({
      name: "FunctionsFetchError",
      context: new TypeError("Failed to fetch"),
    }).call({ action: "transcribe" }),
  ).rejects.toThrow("nätanslutningen");
  await expect(
    fixture({ context: new Response("Unauthorized", { status: 401 }) }).call({
      action: "status",
    }),
  ).rejects.toThrow("Inloggningen kunde inte verifieras");
  await expect(
    fixture({
      context: Response.json({ code: "NOT_FOUND" }, { status: 404 }),
    }).call({ action: "status" }),
  ).rejects.toThrow("installerad");
  await expect(
    fixture({ context: new Response("Gateway error", { status: 502 }) }).call({
      action: "transcribe",
    }),
  ).rejects.toThrow("Det sparade ljudet finns kvar");
});
