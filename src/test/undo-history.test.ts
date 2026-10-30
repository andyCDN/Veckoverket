import { describe, expect, it } from "vitest";
import { UndoHistory } from "../lib/undo-history";
import { createData } from "../lib/defaults";
import { resetPlanning } from "../lib/reset-planning";

describe("ångra i den öppna sessionen", () => {
  it("återställer flera ändringar, inklusive nollställning, och ignorerar oförändrade uppdateringar", () => {
    const history = new UndoHistory(),
      initial = createData(),
      renamed = { ...initial, profile: { name: "Ändrat" } },
      reset = resetPlanning(renamed, "2026-10-26");
    history.reset(initial);
    history.record(initial, renamed, "namn");
    history.record(renamed, reset, "nollställning");
    history.record(reset, structuredClone(reset), false);
    expect(history.label).toBe("nollställning");
    expect(history.undo(reset)).toEqual(renamed);
    expect(history.label).toBe("namn");
    expect(history.undo(renamed)).toEqual(initial);
    expect(history.label).toBe("");
    expect(history.undo(initial)).toBeNull();
  });
  it("raderar historiken vid externa förändringar, kontobyte och systemuppdateringar", () => {
    const history = new UndoHistory(),
      initial = createData(),
      changed = { ...initial, profile: { name: "Lokalt" } };
    history.record(initial, changed);
    history.observe(structuredClone(changed));
    expect(history.label).not.toBe("");
    const remote = { ...changed, profile: { name: "Annan enhet" } };
    expect(history.undo(remote)).toBeNull();
    history.record(initial, changed);
    history.record(changed, remote, false);
    expect(history.undo(remote)).toBeNull();
    history.record(initial, changed);
    history.reset(null);
    expect(history.undo(changed)).toBeNull();
  });
  it("lagrar fristående ögonblicksbilder och begränsar minnesanvändningen", () => {
    const history = new UndoHistory(2),
      initial = createData(),
      one = { ...initial, profile: { name: "Ett" } },
      two = { ...initial, profile: { name: "Två" } },
      three = { ...initial, profile: { name: "Tre" } };
    history.record(initial, one);
    history.record(one, two);
    history.record(two, three);
    two.profile.name = "Muterat i efterhand";
    const restored = history.undo(three)!;
    expect(restored.profile.name).toBe("Två");
    expect(history.undo(restored)).toEqual(one);
    expect(history.undo(one)).toBeNull();
    const limited = new UndoHistory(20, 10);
    limited.record(initial, one);
    expect(limited.label).toBe("");
  });
});
