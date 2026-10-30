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
      transcribe: async () => {
        calls++;
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
  };
}
describe("privat inspelningstjänst", () => {
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
