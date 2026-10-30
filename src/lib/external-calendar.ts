import type { Activity, Category } from "./types";
export const GOOGLE_CATEGORY_ID = "google-calendar";
export const GOOGLE_CATEGORY: Category = {
  id: GOOGLE_CATEGORY_ID,
  name: "Okategoriserat",
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
export function countsCategoryTime(a: Activity) {
  return !a.external || (a.external.busy && !a.external.allDay);
}
export function googleEventKey(a: Activity) {
  return a.external
    ? JSON.stringify([a.external.calendarId, a.external.eventId])
    : "";
}
export function isGoogleEventKey(key: string) {
  try {
    const parts: unknown = JSON.parse(key);
    return (
      Array.isArray(parts) &&
      parts.length === 2 &&
      parts.every((part) => typeof part === "string" && part.length > 0) &&
      JSON.stringify(parts) === key
    );
  } catch {
    return false;
  }
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
