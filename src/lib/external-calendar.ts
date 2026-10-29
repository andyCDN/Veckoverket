import type { Activity, Category } from "./types";
export const GOOGLE_CATEGORY_ID = "google-calendar";
export const GOOGLE_CATEGORY: Category = {
  id: GOOGLE_CATEGORY_ID,
  name: "Google Kalender",
  color: "#243d9b",
  targetMinutes: 0,
  priority: 5,
  minBlock: 5,
  allowSplit: false,
  movable: false,
};
export function blocksTime(a: Activity) {
  return !a.external || a.external.busy;
}
export function googleEventUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === "calendar.google.com" ||
        (url.hostname === "www.google.com" &&
          url.pathname.startsWith("/calendar/")))
    )
      return url.href;
  } catch {
    /* Imported links remain optional. */
  }
}
