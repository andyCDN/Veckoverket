import { describe, it, expect } from "vitest";
import {
  classifyApplicationMessage,
  applyApplicationMessage,
  hasApplicationMessage,
} from "../lib/application-message";
import { createData } from "../lib/defaults";
import { decodeData } from "../lib/storage";
import { careerActions } from "../lib/career-actions";
import type { JobApplication } from "../lib/types";
const app: JobApplication = {
  id: "a",
  organization: "Stadshuset",
  role: "Utredare",
  status: "sent",
  nextAction: "Skriv brev",
  nextActionId: "old-task",
  followUpDate: "2026-11-01",
  deadline: "",
  notes: "Behåll",
  contactIds: ["contact"],
};
const date = "2026-11-11";
describe("klassning av rekryteringsbesked", () => {
  it.each([
    ["Stadshuset: Tack för din ansökan", "sent"],
    ["Vi på Stadshuset vill bjuda dig på intervju", "interview"],
    ["Vi har gått vidare med andra kandidater", "rejected"],
    ["Vi vill erbjuda dig tjänsten", "offer"],
    ["We received your application", "sent"],
    ["We invite you to an interview", "interview"],
    ["Unfortunately, we will not proceed with your application", "rejected"],
    ["We offer you the position", "offer"],
  ])("tolkar %s", (text, status) => {
    expect(classifyApplicationMessage(text, [app], date).status).toBe(status);
  });
  it("gissar inte utifrån ett generiskt omnämnande eller motstridiga besked", () => {
    expect(
      classifyApplicationMessage(
        "Vi berättar mer om vår intervjuprocess",
        [app],
        date,
      ).status,
    ).toBeUndefined();
    expect(
      classifyApplicationMessage(
        "Vi vill bjuda dig på intervju. Tidigare besked: Vi har gått vidare med andra kandidater",
        [app],
        date,
      ).status,
    ).toBeUndefined();
    expect(
      classifyApplicationMessage(
        "Tack för din ansökan. Vi har gått vidare med andra kandidater",
        [app],
        date,
      ).status,
    ).toBe("rejected");
  });
  it("tolkar inte negerade inbjudningar och erbjudanden som positiva besked", () => {
    for (const text of [
      "Vi kan inte bjuda dig på intervju",
      "We will not invite you to an interview",
      "Vi kan inte erbjuda dig tjänsten",
    ]) {
      expect(
        classifyApplicationMessage(text, [app], date).status,
      ).toBeUndefined();
    }
  });
  it("kräver entydig matchning och kan skilja två tjänster hos samma arbetsgivare", () => {
    const other = { ...app, id: "b", role: "Chef" };
    expect(
      classifyApplicationMessage(
        "Stadshuset har fått din ansökan",
        [app, other],
        date,
      ).applicationId,
    ).toBe("");
    expect(
      classifyApplicationMessage("Stadshuset: Utredare", [app, other], date)
        .applicationId,
    ).toBe("a");
    expect(
      classifyApplicationMessage("Stadshusets", [app], date).applicationId,
    ).toBe("");
    expect(
      classifyApplicationMessage("Okänt bolag", [app], date).applicationId,
    ).toBe("");
  });
  it("föreslår uppföljning men hittar inte på intervjubokningar", () => {
    expect(
      classifyApplicationMessage("Tack för din ansökan", [app], date),
    ).toMatchObject({ followUpDate: "2026-11-18", nextActionKind: "waiting" });
    expect(
      classifyApplicationMessage("Vi vill bjuda dig på intervju", [app], date),
    ).toMatchObject({ followUpDate: "2026-11-12", nextActionKind: "task" });
  });
  it("sparar godkänd ändring i historik, bevarar övriga fält och kopplar nytt nästa steg", () => {
    const text = "Stadshuset vill bjuda dig på intervju";
    const result = applyApplicationMessage(app, text, {
      status: "interview",
      nextAction: "Bekräfta intervjun",
      followUpDate: date,
      nextActionKind: "task",
    });
    expect(result).toMatchObject({
      status: "interview",
      notes: "Behåll",
      contactIds: ["contact"],
    });
    expect(result.nextActionId).toBeTruthy();
    expect(result.nextActionId).not.toBe("old-task");
    expect(app.status).toBe("sent");
    expect(result.history?.map((e) => e.kind)).toEqual([
      "status",
      "action",
      "note",
    ]);
    expect(hasApplicationMessage(result, text.toUpperCase() + "  ")).toBe(true);
    expect(() => applyApplicationMessage(result, text, { ...result })).toThrow(
      "redan sparat",
    );
    const data = { ...createData(), applications: [result] };
    expect(decodeData(JSON.stringify(data)).applications).toEqual([result]);
    expect(
      careerActions(data).some(
        (action) =>
          action.applicationId === app.id &&
          action.title === "Bekräfta intervjun",
      ),
    ).toBe(true);
  });
  it("avslutar uppföljning vid avslag och sparar avgränsad historik för långa meddelanden", () => {
    const result = applyApplicationMessage(app, "Avslag " + "a".repeat(10000), {
      status: "rejected",
      nextAction: "Felaktigt steg",
      followUpDate: date,
      nextActionKind: "task",
    });
    expect(result).toMatchObject({
      nextAction: "",
      followUpDate: "",
      status: "rejected",
    });
    expect(result.nextActionId).toBeUndefined();
    expect(
      decodeData(JSON.stringify({ ...createData(), applications: [result] }))
        .applications,
    ).toEqual([result]);
    expect(() => applyApplicationMessage(app, " ", { ...app })).toThrow();
  });
});
