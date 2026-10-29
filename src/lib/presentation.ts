import type { CSSProperties } from "react";
import type { Category } from "./types";

const palette: Record<string, { ink: string; fill: string; label: string }> = {
  career: { ink: "#234B8C", fill: "#DBE5ED", label: "Jobbsök" },
  learning: { ink: "#E85B45", fill: "#F6D9CE", label: "Lärande" },
  music: { ink: "#E85B45", fill: "#F4A995", label: "Musik" },
  health: { ink: "#234B8C", fill: "#C9D5E8", label: "Träning" },
  family: { ink: "#24231F", fill: "#EEE7D8", label: "Familj" },
  rest: { ink: "#24231F", fill: "#FAF6EB", label: "Övrigt" },
};
export function categoryInk(category?: Category) {
  return category ? (palette[category.id]?.ink ?? category.color) : "#24231F";
}
export function categoryLabel(category?: Category) {
  return category
    ? (palette[category.id]?.label ?? category.name)
    : "Okategoriserad";
}
export function categoryStyle(category?: Category): CSSProperties {
  return {
    "--category": categoryInk(category),
    "--category-fill": category
      ? (palette[category.id]?.fill ??
        `color-mix(in srgb, ${category.color} 20%, #FAF6EB)`)
      : "#FAF6EB",
  } as CSSProperties;
}
