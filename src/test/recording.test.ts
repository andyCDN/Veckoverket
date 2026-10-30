import { describe, it, expect } from "vitest";
import { pcmWav } from "../lib/recording-audio";
import { saveReviewedRecording } from "../lib/recording-workspace";
import {
  checkedSummary,
  combineSummaries,
  wavDuration,
  summaryText,
  type RecordingSession,
} from "../../supabase/functions/_shared/recording-schema";
import { createData } from "../lib/defaults";
import { decodeData } from "../lib/storage";
const session: RecordingSession = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Samtal med Kim",
  context: { applicationId: "a", contactId: "c" },
  state: "complete",
  startedAt: "2026-10-29T23:30:00Z",
  segmentCount: 2,
};
describe("självständiga ljudsegment", () => {
  it("kodar fristående mono WAV-filer med verifierbar längd och klippta amplituder", async () => {
    const samples = new Float32Array(16000);
    samples.set([-2, -1, 0, 1, 2, NaN]);
    for (let i = 0; i < 2; i++) {
      const bytes = new Uint8Array(await pcmWav(samples, 16000).arrayBuffer());
      expect(wavDuration(bytes)).toBe(1000);
      const v = new DataView(bytes.buffer);
      expect(v.getInt16(44, true)).toBe(-32768);
      expect(v.getInt16(50, true)).toBe(32767);
      expect(v.getInt16(54, true)).toBe(0);
    }
  });
  it("avvisar partiella eller felaktiga ljudfiler och för stora segment", async () => {
    const bytes = new Uint8Array(
      await pcmWav(new Float32Array(16000), 16000).arrayBuffer(),
    );
    expect(() => wavDuration(bytes.slice(20))).toThrow();
    const wrong = bytes.slice();
    new DataView(wrong.buffer).setUint32(40, 500, true);
    expect(() => wavDuration(wrong)).toThrow();
    expect(() => wavDuration(new Uint8Array(4 * 1024 * 1024))).toThrow();
  });
});
describe("sammanfattning med belägg", () => {
  it("skiljer belagda överenskommelser från förslag och obelagda påståenden", () => {
    const good = {
      text: "Kim skickar länken",
      owner: "Kim",
      when: "Fredag",
      evidence: "Jag skickar länken på fredag.",
    };
    const unsupported = {
      ...good,
      text: "Du har fått jobbet",
      evidence: "Anställningen är klar.",
    };
    const result = checkedSummary(
      { agreements: [good, unsupported], nextSteps: [], uncertainties: [] },
      "Kim: Jag skickar länken på fredag.",
    );
    expect(result.agreements).toEqual([good]);
    expect(result.uncertainties[0]).toContain("Ej belagt");
    expect(summaryText(result)).toContain("Föreslagna nästa steg");
    expect(combineSummaries([result, result]).agreements).toHaveLength(1);
  });
  it("avvisar felaktiga AI-svar", () => {
    for (const value of [
      null,
      {},
      { agreements: [{ text: "Påhittat" }], nextSteps: [], uncertainties: [] },
    ])
      expect(() => checkedSummary(value, "text")).toThrow();
  });
});
describe("granskade samtalsanteckningar", () => {
  it("sparar en gång i rätt kontakt och ansökan utan att ändra planer eller manuella anteckningar", () => {
    const data = createData();
    data.applications = [
      {
        id: "a",
        organization: "Bolaget",
        role: "Utvecklare",
        status: "sent",
        deadline: "",
        nextAction: "Följ upp",
        followUpDate: "2026-11-02",
        notes: "Egna anteckningar",
      },
    ];
    data.contacts = [
      {
        id: "c",
        name: "Kim",
        organization: "Bolaget",
        nextAction: "Ring",
        followUpDate: "2026-11-02",
        entries: [],
      },
    ];
    const original = structuredClone(data),
      next = saveReviewedRecording(
        data,
        session,
        "Kim skickar länken på fredag.",
      );
    expect(data).toEqual(original);
    expect(next.weeks).toBe(data.weeks);
    expect(next.tasks).toBe(data.tasks);
    expect(next.applications![0]).toMatchObject({
      notes: "Egna anteckningar",
      nextAction: "Följ upp",
      status: "sent",
      contactIds: ["c"],
    });
    expect(next.contacts![0].entries[0]).toMatchObject({
      date: "2026-10-30",
      notes: "Kim skickar länken på fredag.",
    });
    expect(saveReviewedRecording(next, session, "En senare redigering")).toBe(
      next,
    );
    expect(decodeData(JSON.stringify(next)).applications).toEqual(
      next.applications,
    );
  });
  it("avvisar försvunna kopplingar, obehandlade inspelningar och för långa anteckningar", () => {
    const data = createData();
    expect(() => saveReviewedRecording(data, session, "Text")).toThrow(
      /finns inte/,
    );
    expect(() =>
      saveReviewedRecording(data, { ...session, state: "active" }, "Text"),
    ).toThrow(/Sammanfatta/);
    expect(() =>
      saveReviewedRecording(data, session, "x".repeat(4001)),
    ).toThrow(/4000/);
  });
});

it.each([
  { statusCode: "409", message: "Duplicate" },
  { statusCode: "400", message: "The resource already exists" },
])(
  "låter ett återförsök kontrollera den befintliga molnkopian vid Storage-konflikt $statusCode",
  async (error) => {
    const { recordingClient } = await import("../lib/recording-client");
    const client = {
      storage: {
        from: () => ({ upload: async () => ({ data: null, error }) }),
      },
    };
    const api = recordingClient(
      client as unknown as import("@supabase/supabase-js").SupabaseClient,
      "user",
    );
    expect(
      await api.upload("session", 0, pcmWav(new Float32Array(16000), 16000)),
    ).toMatch(/^[a-f0-9]{64}$/);
  },
);
