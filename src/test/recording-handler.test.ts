import { describe, it, expect } from "vitest";
import {
  recordingHandler,
  type RecordingStore,
} from "../../supabase/functions/_shared/recording-handler";
import type {
  RecordingSession,
  RecordingSummary,
  RecordingSegment,
} from "../../supabase/functions/_shared/recording-schema";
import { pcmWav } from "../lib/recording-audio";
import { RecordingAIError } from "../../supabase/functions/_shared/recording-ai";
import { RecordingLeaseConflict } from "../../supabase/functions/_shared/recording-schema";
const id = "33333333-3333-4333-8333-333333333333";
function fixture() {
  const records = new Map<
    string,
    { owner: string; session: RecordingSession }
  >();
  const segments = new Map<number, RecordingSegment>(),
    parts = new Map<number, RecordingSummary>();
  const received = new Set<number>();
  const pending = new Set<number>(),
    claimed = new Set<number>();
  let calls = 0,
    fail = false,
    configured = true;
  let aiError: Error | undefined;
  const store: RecordingStore = {
    list: async (user) =>
      [...records.values()]
        .filter((r) => r.owner === user)
        .map((r) => r.session),
    create: async (user, title, context) => {
      const session: RecordingSession = {
        id,
        title,
        context,
        state: "active",
        startedAt: new Date().toISOString(),
        segmentCount: 0,
      };
      records.set(id, { owner: user, session });
      return session;
    },
    load: async (user, key) =>
      records.get(key)?.owner === user ? records.get(key)!.session : null,
    categorize: async (_u, key, title, context) => {
      Object.assign(records.get(key)!.session, { title, context });
    },
    segments: async () =>
      [...segments.values()].sort((a, b) => a.index - b.index),
    pending: async () => [...pending],
    received: async () => [...received].sort((a, b) => a - b),
    acknowledge: async (_u, _id, index) => {
      received.add(index);
      pending.add(index);
    },
    audio: async () =>
      new Uint8Array(
        await pcmWav(new Float32Array(16000), 16000).arrayBuffer(),
      ),
    claim: async (_u, _id, index) => {
      if (segments.has(index)) return "ready";
      if (claimed.has(index)) return "busy";
      received.add(index);
      claimed.add(index);
      return "claimed";
    },
    saveTranscript: async (_u, _id, index, transcript) => {
      segments.set(index, { index, transcript, durationMs: 1000 });
      pending.delete(index);
      claimed.delete(index);
    },
    failSegment: async (_u, _id, index) => {
      claimed.delete(index);
      pending.add(index);
    },
    stop: async (_u, key, count) => {
      Object.assign(records.get(key)!.session, {
        state: "stopped",
        segmentCount: count,
      });
    },
    loadPart: async (_u, _id, index) => parts.get(index) ?? null,
    savePart: async (_u, _id, index, summary) => {
      parts.set(index, summary);
    },
    complete: async (_u, key, summary) => {
      Object.assign(records.get(key)!.session, { state: "complete", summary });
    },
    remove: async (_u, key) => {
      records.delete(key);
    },
  };
  const handler = () =>
    recordingHandler({
      origin: "https://andycdn.github.io",
      configured,
      authenticate: async (token) =>
        ["a", "b"].includes(token) ? token : null,
      store,
      checkAI: async () => {
        if (aiError) throw aiError;
      },
      transcribe: async () => {
        calls++;
        if (aiError) throw aiError;
        if (fail) throw new Error("PRIVATE_API_KEY");
        return "Jag skickar länken på fredag.";
      },
      summarize: async () => ({
        agreements: [
          {
            text: "Länken skickas",
            owner: "Ej fastställt",
            when: "Fredag",
            evidence: "Jag skickar länken på fredag.",
          },
        ],
        nextSteps: [],
        uncertainties: [],
      }),
    });
  const request = async (
    body: unknown,
    user = "a",
    origin = "https://andycdn.github.io",
  ) => {
    const response = await handler()(
      new Request("https://example.test/recording", {
        method: "POST",
        headers: { Authorization: `Bearer ${user}`, Origin: origin },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, data: await response.json() };
  };
  return {
    store,
    request,
    records,
    segments,
    pending,
    parts,
    get calls() {
      return calls;
    },
    set fail(v: boolean) {
      fail = v;
    },
    set configured(v: boolean) {
      configured = v;
    },
    set aiError(v: Error | undefined) {
      aiError = v;
    },
  };
}
describe("privat inspelningstjänst", () => {
  it("låter inte ett gammalt segmentjobb återställa en konkurrerande arbetares status", async () => {
    const f = fixture();
    await f.request({ action: "create", title: "Samtal", context: {} });
    f.store.claim = async () => ({ state: "claimed", token: "old-lease" });
    f.store.saveTranscript = async (_user, _id, _index, _text, token) => {
      expect(token).toBe("old-lease");
      throw new RecordingLeaseConflict();
    };
    let failed = false;
    f.store.failSegment = async () => {
      failed = true;
    };
    const reply = await f.request({ action: "transcribe", id, index: 0 });
    expect(reply.status).toBe(409);
    expect(reply.data.code).toBe("segment_busy");
    expect(failed).toBe(false);
  });
  it("kontrollerar ägarskap, textlängd och revision innan en transkription rättas", async () => {
    const f = fixture();
    await f.request({ action: "create", title: "Samtal", context: {} });
    f.records.get(id)!.session.state = "complete";
    let writes = 0;
    f.store.correctTranscript = async (user, key, index, text, revision) => {
      expect(user).toBe("a");
      expect(key).toBe(id);
      expect(index).toBe(0);
      expect(revision).toBe(0);
      expect(text).toHaveLength(19000);
      writes++;
    };
    expect(
      (
        await f.request(
          {
            action: "correct-transcript",
            id,
            index: 0,
            text: "x".repeat(19000),
            revision: 0,
          },
          "b",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await f.request({
          action: "correct-transcript",
          id,
          index: 0,
          text: "x".repeat(20001),
          revision: 0,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await f.request({
          action: "correct-transcript",
          id,
          index: 0,
          text: "x".repeat(19000),
          revision: 0,
        })
      ).status,
    ).toBe(200);
    expect(writes).toBe(1);
  });
  it("kräver inloggning för AI-kontroll och visar kreditfel även när en nyckel är konfigurerad", async () => {
    const f = fixture();
    expect((await f.request({ action: "check-ai" }, "anonymous")).status).toBe(
      401,
    );
    expect((await f.request({ action: "status" })).data.aiReady).toBe(true);
    f.aiError = new RecordingAIError(
      "ai_credit_exhausted",
      "transcription",
      "req_quota",
    );
    const check = await f.request({ action: "check-ai" });
    expect(check.status).toBe(503);
    expect(check.data).toMatchObject({
      code: "ai_credit_exhausted",
      requestId: "req_quota",
    });
    f.configured = false;
    expect((await f.request({ action: "check-ai" })).data.code).toBe(
      "ai_not_configured",
    );
  });
  it("behåller mottaget ljud och visar orsaken när AI-nyckeln avvisas", async () => {
    const f = fixture();
    await f.request({ action: "create", title: "Samtal", context: {} });
    await f.request({ action: "acknowledge", id, index: 0 });
    f.aiError = new RecordingAIError("ai_key_invalid", "transcription");
    const result = await f.request({ action: "transcribe", id, index: 0 });
    expect(result.status).toBe(502);
    expect(result.data.code).toBe("ai_key_invalid");
    expect(f.pending.has(0)).toBe(true);
    f.aiError = undefined;
    expect(
      (await f.request({ action: "transcribe", id, index: 0 })).status,
    ).toBe(200);
  });
  it("kan spela in okategoriserat och kategorisera i efterhand utan att påverka ljud eller AI-resultat", async () => {
    const f = fixture();
    const created = await f.request({
      action: "create",
      title: "Samtal",
      context: {},
    });
    expect(created.status).toBe(200);
    expect(created.data.session.context).toEqual({});
    await f.request({ action: "acknowledge", id, index: 0 });
    await f.request({ action: "stop", id, count: 1 });
    const updated = await f.request({
      action: "categorize",
      id,
      title: "Intervju med Kim",
      context: { categoryId: "career", applicationId: "a", contactId: "c" },
    });
    expect(updated.status).toBe(200);
    expect(updated.data.session).toMatchObject({
      title: "Intervju med Kim",
      context: { categoryId: "career", applicationId: "a", contactId: "c" },
      state: "stopped",
      segmentCount: 1,
    });
    expect(f.pending.has(0)).toBe(true);
    expect(f.calls).toBe(0);
    expect(
      (
        await f.request(
          { action: "categorize", id, title: "Annan", context: {} },
          "b",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await f.request({
          action: "categorize",
          id,
          title: "Fel",
          context: { interviewId: "i" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await f.request({
          action: "categorize",
          id,
          title: "Fel",
          context: { injected: "x" },
        })
      ).status,
    ).toBe(400);
  });

  it("kräver autentisering och rätt origin samt håller konton åtskilda", async () => {
    const f = fixture();
    expect((await f.request({ action: "list" }, "invalid")).status).toBe(401);
    expect(
      (await f.request({ action: "list" }, "a", "https://evil.test")).status,
    ).toBe(403);
    expect(
      (
        await f.request({
          action: "create",
          title: "Samtal",
          context: { contactId: "c" },
        })
      ).status,
    ).toBe(200);
    expect((await f.request({ action: "get", id }, "b")).status).toBe(404);
    expect((await f.request({ action: "delete", id }, "b")).status).toBe(404);
    expect((await f.request({ action: "list" }, "b")).data.sessions).toEqual(
      [],
    );
  });
  it("spelar in, verifierar och avslutar molnljud även när AI-nyckeln saknas", async () => {
    const f = fixture();
    f.configured = false;
    expect((await f.request({ action: "status" })).data).toEqual({
      ready: true,
      aiReady: false,
      aiDiagnostics: true,
      deferredCategorization: true,
    });
    expect(
      (
        await f.request({
          action: "create",
          title: "Samtal",
          context: { contactId: "c" },
        })
      ).status,
    ).toBe(200);
    const ack = await f.request({ action: "acknowledge", id, index: 0 });
    expect(ack.data).toMatchObject({ received: true, index: 0 });
    expect(ack.data.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect((await f.request({ action: "stop", id, count: 1 })).status).toBe(
      200,
    );
    expect(
      (await f.request({ action: "transcribe", id, index: 0 })).status,
    ).toBe(503);
    expect(f.calls).toBe(0);
    f.configured = true;
    expect(
      (await f.request({ action: "transcribe", id, index: 0 })).status,
    ).toBe(200);
  });
  it("transkriberar segment idempotent och återhämtar efter fel utan att exponera nycklar", async () => {
    const f = fixture();
    await f.request({
      action: "create",
      title: "Samtal",
      context: { contactId: "c" },
    });
    f.pending.add(0);
    f.fail = true;
    const failed = await f.request({ action: "transcribe", id, index: 0 });
    expect(failed.status).toBe(502);
    expect(JSON.stringify(failed.data)).not.toContain("PRIVATE_API_KEY");
    f.fail = false;
    expect(
      (await f.request({ action: "transcribe", id, index: 0 })).status,
    ).toBe(200);
    expect(
      (await f.request({ action: "transcribe", id, index: 0 })).status,
    ).toBe(200);
    expect(f.calls).toBe(2);
  });
  it("avvisar felaktig checksumma före AI-bearbetning", async () => {
    const f = fixture();
    await f.request({
      action: "create",
      title: "Samtal",
      context: { contactId: "c" },
    });
    expect(
      (await f.request({ action: "transcribe", id, index: 0, sha256: "fel" }))
        .status,
    ).toBe(409);
    expect(f.calls).toBe(0);
  });
  it("sammanfattar inte ofullständigt ljud och återanvänder sparade delresultat", async () => {
    const f = fixture();
    await f.request({
      action: "create",
      title: "Samtal",
      context: { applicationId: "a" },
    });
    f.pending.add(0);
    expect((await f.request({ action: "stop", id, count: 0 })).status).toBe(
      409,
    );
    await f.request({ action: "transcribe", id, index: 0 });
    expect((await f.request({ action: "summarize", id })).status).toBe(409);
    expect((await f.request({ action: "stop", id, count: 1 })).status).toBe(
      200,
    );
    const first = await f.request({ action: "summarize", id });
    expect(first.data).toMatchObject({
      done: false,
      completedParts: 1,
      totalParts: 1,
    });
    const final = await f.request({ action: "summarize", id });
    expect(final.data.done).toBe(true);
    expect(final.data.summary.agreements).toHaveLength(1);
    expect((await f.request({ action: "summarize", id })).data).toEqual(
      final.data,
    );
    expect(f.parts.size).toBe(1);
  });
  it("kräver sammanhängande segmentordning och tillåter inte efterhandsuppladdning", async () => {
    const f = fixture();
    await f.request({
      action: "create",
      title: "Samtal",
      context: { contactId: "c" },
    });
    await f.request({ action: "transcribe", id, index: 1 });
    expect((await f.request({ action: "stop", id, count: 1 })).status).toBe(
      409,
    );
    await f.request({ action: "transcribe", id, index: 0 });
    await f.request({ action: "stop", id, count: 2 });
    expect(
      (await f.request({ action: "transcribe", id, index: 2 })).status,
    ).toBe(409);
  });
});
