import { it, expect } from "vitest";
import { createData } from "../lib/defaults";
import { mondayGoalDrafts, addMondayGoals } from "../lib/monday-goals";
it("creates editable weekly goals and linked tasks without duplicating a repeated check", () => {
  const d = createData();
  const drafts = mondayGoalDrafts(
    "- Två ansökningar | Anpassa CV; Skicka ansökningar\nTvå ansökningar\nMusik klar",
    "career",
  );
  expect(drafts).toHaveLength(2);
  drafts[1].selected = false;
  const next = addMondayGoals(d, "2026-11-09", drafts);
  const goal = next.goals.at(-1)!;
  expect(goal).toMatchObject({
    title: "Två ansökningar",
    week: "2026-11-09",
    horizon: "week",
  });
  expect(
    next.tasks.filter((t) => t.goalId === goal.id).map((t) => t.title),
  ).toEqual(["Anpassa CV", "Skicka ansökningar"]);
  expect(addMondayGoals(next, "2026-11-09", drafts)).toBe(next);
  expect(addMondayGoals(next, "2026-11-16", drafts).goals).toHaveLength(
    next.goals.length + 1,
  );
  expect(d.goals).toHaveLength(next.goals.length - 1);
});
it("ignores incomplete and invalid proposals", () => {
  const d = createData();
  const draft = {
    title: "Test",
    selected: true,
    tasks: "",
    categoryId: "career",
  };
  expect(addMondayGoals(d, "2026-11-09", [draft])).toBe(d);
  expect(
    addMondayGoals(d, "2026-11-09", [
      { ...draft, tasks: "Gör", categoryId: "missing" },
    ]),
  ).toBe(d);
});
