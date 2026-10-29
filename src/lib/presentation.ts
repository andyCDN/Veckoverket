import type { CSSProperties } from "react";
import type { Category } from "./types";

const palette: Record<string, { ink: string; fill: string; label: string }> = {
  career: { ink: "#243D9B", fill: "#E3E9F7", label: "Jobbsök" },
  learning: { ink: "#F9C845", fill: "#FFF1BD", label: "Lärande" },
  music: { ink: "#F04B31", fill: "#FBD9CE", label: "Musik" },
  health: { ink: "#243D9B", fill: "#F1F4F8", label: "Träning" },
  family: { ink: "#191918", fill: "#FFF9E9", label: "Familj" },
  rest: { ink: "#191918", fill: "#FFF9E9", label: "Övrigt" },
};
export function categoryInk(category?: Category) {
  return category ? (palette[category.id]?.ink ?? category.color) : "#191918";
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
        `color-mix(in srgb, ${category.color} 20%, #FFF9E9)`)
      : "#FFF9E9",
  } as CSSProperties;
}
