import type { CSSProperties } from "react";
import type { Category } from "./types";

const palette: Record<string, { ink: string; fill: string; label: string }> = {
  "weekly-planning": {
    ink: "#F04B31",
    fill: "#FFF1BD",
    label: "Veckoplanering",
  },
  career: { ink: "#243D9B", fill: "#E3E9F7", label: "Jobbsök" },
  networking: { ink: "#40552E", fill: "#E6EAD9", label: "Nätverkande" },
  learning: { ink: "#F9C845", fill: "#FFF1BD", label: "Lärande" },
  music: { ink: "#F04B31", fill: "#FBD9CE", label: "Musik" },
  health: { ink: "#243D9B", fill: "#F1F4F8", label: "Träning" },
  family: { ink: "#191918", fill: "#FFF9E9", label: "Familj" },
  "google-calendar": {
    ink: "#243D9B",
    fill: "#E3E9F7",
    label: "Okategoriserat",
  },
  rest: { ink: "#191918", fill: "#FFF9E9", label: "Övrigt" },
};
export function categoryInk(category?: Category) {
  return category ? (palette[category.id]?.ink ?? category.color) : "#191918";
}
export function categoryLabel(category?: Category) {
  return category
    ? (palette[category.id]?.label ?? category.name)
    : "Okategoriserat";
}
export function categoryStyle(category?: Category): CSSProperties {
  return {
    "--category": categoryInk(category),
    "--category-fill": category
      ? (palette[category.id]?.fill ??
        `color-mix(in srgb, ${category.color} 20%, #FFF9E9)`)
      : "#FFF9E9",
  } as CSSProperties;
}

const CATEGORY_MENU_ORDER = [
  "career",
  "learning",
  "networking",
  "music",
  "health",
  "family",
  "weekly-planning",
  "google-calendar",
  "rest",
];
/** Presentation only: never reorder saved categories or change planning priority. */
export function orderedCategories(categories: Category[]): Category[] {
  const rank = (id: string) => {
    const index = CATEGORY_MENU_ORDER.indexOf(id);
    return index < 0 ? CATEGORY_MENU_ORDER.length : index;
  };
  return [...categories].sort((a, b) => rank(a.id) - rank(b.id));
}
