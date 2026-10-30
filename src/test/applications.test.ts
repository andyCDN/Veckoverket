import { describe, expect, it } from "vitest";
import {
  matchesActionPeriod,
  saveApplication,
  completeApplicationAction,
} from "../lib/applications";
import { createData } from "../lib/defaults";
import { decodeData } from "../lib/storage";
import type { JobApplication } from "../lib/types";
const now = new Date("2026-10-29T23:30:00Z"); // 30 October in Stockholm
const app = (): JobApplication => ({
  id: "a",
  role: "Utvecklare",
  organization: "Bolag",
  status: "sent",
  deadline: "",
  nextAction: "Ring Kim",
  followUpDate: "2026-10-30",
  notes: "Befintliga anteckningar",
});
describe("nästa steg i ansökningar", () => {
  it("filtrerar idag, nästa sju dagar, passerat och utan datum med avslutade ärenden undantagna", () => {
    const a = app();
    expect(matchesActionPeriod(a, "today", "2026-10-30")).toBe(true);
    expect(matchesActionPeriod(a, "week", "2026-10-30")).toBe(false);
    expect(
      matchesActionPeriod(
        { ...a, followUpDate: "2026-11-06" },
        "week",
        "2026-10-30",
      ),
    ).toBe(true);
    expect(
      matchesActionPeriod(
        { ...a, followUpDate: "2026-11-07" },
        "week",
        "2026-10-30",
      ),
    ).toBe(false);
    expect(matchesActionPeriod(a, "overdue", "2026-10-31")).toBe(true);
    expect(
      matchesActionPeriod({ ...a, followUpDate: "" }, "overdue", "2026-10-31"),
    ).toBe(false);
    expect(matchesActionPeriod({ ...a, followUpDate: "" }, "undated")).toBe(
      true,
    );
    for (const status of ["closed", "rejected"] as const)
      expect(matchesActionPeriod({ ...a, status }, "today", "2026-10-30")).toBe(
        false,
      );
    expect(
      matchesActionPeriod({ ...a, nextAction: " " }, "today", "2026-10-30"),
    ).toBe(false);
  });
  it("registrerar bara verkliga ändringar och hittar inte på äldre historik", () => {
    const old = app();
    expect(saveApplication(old, { ...old }, now).history).toEqual([]);
    const changed = saveApplication(
      old,
      {
        ...old,
        status: "interview",
        nextAction: "Förbered intervju",
        followUpDate: "2026-11-02",
      },
      now,
    );
    expect(changed.history?.map((e) => e.kind)).toEqual(["status", "action"]);
    expect(changed.history?.[0]).toMatchObject({
      date: "2026-10-30",
      status: "interview",
      notes: "Skickad → Intervju",
    });
    expect(saveApplication(changed, { ...changed }, now).history).toEqual(
      changed.history,
    );
    expect(old.history).toBeUndefined();
    expect(saveApplication(undefined, app(), now).history?.[0]).toMatchObject({
      kind: "created",
      status: "sent",
    });
  });
  it("avslutar nästa steg utan att röra status, anteckningar eller kontakter och dubbelregistrerar inte", () => {
    const a = { ...app(), contactIds: ["c"] };
    const completed = completeApplicationAction(a, now);
    expect(completed).toMatchObject({
      nextAction: "",
      followUpDate: "",
      status: "sent",
      notes: a.notes,
      contactIds: ["c"],
    });
    expect(completed.history?.[0].notes).toContain("Genomfört: Ring Kim");
    expect(completeApplicationAction(completed, now)).toBe(completed);
    expect(a.nextAction).toBe("Ring Kim");
  });
});
describe("lagring av historik och kontakter", () => {
  it("kan återläsa automatiska historiktexter även för ett nästa steg med maximal längd", () => {
    const d = createData();
    const a = { ...app(), nextAction: "a".repeat(4000) };
    d.applications = [completeApplicationAction(a, now)];
    expect(decodeData(JSON.stringify(d)).applications).toEqual(d.applications);
  });
  it("bevarar äldre ansökningar och rundreser nya data, även borttagna kontaktreferenser", () => {
    const d = createData();
    d.applications = [app()];
    expect(
      decodeData(JSON.stringify(d)).applications?.[0].history,
    ).toBeUndefined();
    const tracked = saveApplication(
      undefined,
      { ...app(), contactIds: ["deleted-contact"] },
      now,
    );
    tracked.history!.push({
      id: "n",
      kind: "contact",
      contactId: "deleted-contact",
      notes: "Samtal",
      date: "2026-10-30",
      recordedAt: now.toISOString(),
    });
    d.applications = [tracked];
    expect(decodeData(JSON.stringify(d)).applications).toEqual(d.applications);
  });
  it("avvisar trasiga historikhändelser och dubbla kontaktkopplingar", () => {
    const d = createData(),
      a = saveApplication(undefined, app(), now);
    for (const extra of [
      { contactIds: ["c", "c"] },
      { contactIds: [42] },
      { history: null },
      { history: [{ ...a.history![0], date: "2026-02-30" }] },
      { history: [{ ...a.history![0], kind: "unknown" }] },
      { history: [{ ...a.history![0], recordedAt: "fel" }] },
    ]) {
      expect(() =>
        decodeData(
          JSON.stringify({ ...d, applications: [{ ...a, ...extra }] }),
        ),
      ).toThrow();
    }
  });
});
