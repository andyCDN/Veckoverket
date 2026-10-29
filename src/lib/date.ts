export const DAY_NAMES = [
  "Måndag",
  "Tisdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lördag",
  "Söndag",
];
export function today() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function monday(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}
export function weekday(date: string) {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}
export function weekNumber(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - weekday(date));
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4, 12));
  return (
    1 +
    Math.round(
      (d.getTime() -
        new Date(
          `${monday(first.toISOString().slice(0, 10))}T12:00:00Z`,
        ).getTime()) /
        604800000,
    )
  );
}
export function weekLabel(week: string) {
  const format = (d: string) =>
    new Intl.DateTimeFormat("sv-SE", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  return `${format(week)} – ${format(addDays(week, 6))}`;
}
export function time(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function parseTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
export function hours(minutes: number) {
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(minutes / 60)} h`;
}
export function uid() {
  return crypto.randomUUID();
}
