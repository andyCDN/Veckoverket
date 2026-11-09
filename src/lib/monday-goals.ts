import type { AppData } from "./types";
import { uid } from "./date";
export type MondayGoalDraft = {
  title: string;
  categoryId: string;
  tasks: string;
  selected: boolean;
};
const key = (text: string) =>
  text.trim().replace(/\s+/g, " ").toLocaleLowerCase("sv");
export function mondayGoalDrafts(
  text: string,
  categoryId: string,
): MondayGoalDraft[] {
  const seen = new Set<string>();
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [title, ...parts] = line.split("|");
      const clean = title.trim().slice(0, 120);
      if (!clean || seen.has(key(clean))) return [];
      seen.add(key(clean));
      return [
        {
          title: clean,
          categoryId,
          tasks: parts.length
            ? parts
                .join("|")
                .split(";")
                .map((t) => t.trim())
                .filter(Boolean)
                .join("\n")
            : clean,
          selected: true,
        },
      ];
    });
}
export function addMondayGoals(
  data: AppData,
  week: string,
  drafts: MondayGoalDraft[],
): AppData {
  const seen = new Set(
    data.goals
      .filter((g) => g.week === week && g.horizon === "week")
      .map((g) => key(g.title)),
  );
  const goals = [...data.goals],
    tasks = [...data.tasks];
  for (const draft of drafts) {
    const title = draft.title.trim().slice(0, 120);
    const taskTitles = [
      ...new Set(
        draft.tasks
          .split("\n")
          .map((t) => t.trim().slice(0, 200))
          .filter(Boolean),
      ),
    ];
    if (
      !draft.selected ||
      !title ||
      !taskTitles.length ||
      seen.has(key(title)) ||
      !data.categories.some((c) => c.id === draft.categoryId)
    )
      continue;
    seen.add(key(title));
    const id = uid();
    goals.push({
      id,
      title,
      categoryId: draft.categoryId,
      horizon: "week",
      week,
      description: "",
    });
    tasks.push(
      ...taskTitles.map((title) => ({
        id: uid(),
        title,
        goalId: id,
        done: false,
      })),
    );
  }
  return goals.length === data.goals.length ? data : { ...data, goals, tasks };
}
