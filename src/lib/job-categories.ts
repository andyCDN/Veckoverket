import type { AppData, Category } from "./types";

export function splitJobMinutes(total: number) {
  total = Math.round(total);
  const career = Math.round(total * 0.75);
  return { career, networking: total - career };
}
export const NETWORKING_CATEGORY: Category = {
  id: "networking",
  name: "Nätverkande",
  color: "#596b42",
  targetMinutes: 75,
  priority: 4,
  minBlock: 15,
  allowSplit: true,
  movable: true,
};

/** Upgrade only the shared budget. Saved weeks, outcomes, rules and links stay intact.
 * The new category's presence makes the upgrade idempotent for local/cloud imports. */
export function separateJobCategories(data: AppData): AppData {
  const career = data.categories.find((c) => c.id === "career");
  if (!career || data.categories.some((c) => c.id === "networking"))
    return data;
  const split = splitJobMinutes(career.targetMinutes);
  return {
    ...data,
    categories: [
      ...data.categories.map((c) =>
        c.id === "career"
          ? { ...c, name: "Jobbsök", targetMinutes: split.career }
          : c,
      ),
      {
        ...NETWORKING_CATEGORY,
        targetMinutes: split.networking,
        priority: career.priority,
      },
    ],
  };
}

export function changeJobBudget(
  categories: Category[],
  id: string,
  minutes: number,
): Category[] {
  const paired =
    categories.some((c) => c.id === "career") &&
    categories.some((c) => c.id === "networking");
  if (paired && (id === "career" || id === "networking")) {
    const split = splitJobMinutes(
      id === "career" ? minutes / 0.75 : minutes * 4,
    );
    return categories.map((c) =>
      c.id === "career" || c.id === "networking"
        ? { ...c, targetMinutes: split[c.id] }
        : c,
    );
  }
  return categories.map((c) =>
    c.id === id ? { ...c, targetMinutes: minutes } : c,
  );
}
