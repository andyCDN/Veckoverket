import { addDays } from "./date";
const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(epoch: number, zone = "Europe/Stockholm") {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    });
    formatters.set(zone, formatter);
  }
  const p = Object.fromEntries(
    formatter
      .formatToParts(new Date(epoch))
      .map((part) => [part.type, part.value]),
  );
  const match = p.timeZoneName.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offset = match
    ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
    : 0;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minute: Number(p.hour) * 60 + Number(p.minute),
    second: Number(p.second),
    offset,
  };
}
export function isLocalDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function googleInstant(
  value: string,
  zone = "Europe/Stockholm",
  edge: "start" | "end" = "start",
) {
  if (/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    const epoch = Date.parse(value);
    if (Number.isFinite(epoch)) return epoch;
  } else {
    const match = value.match(
      /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/,
    );
    if (match && isLocalDate(match[1])) {
      const naive = Date.parse(`${value}Z`),
        minute = Number(match[2]) * 60 + Number(match[3]),
        second = Number(match[4]);
      const offsets = new Set(
        [-86400000, 0, 86400000].map(
          (delta) => parts(naive + delta, zone).offset,
        ),
      );
      const matches = [...offsets]
        .map((offset) => naive - offset * 60000)
        .filter((epoch) => {
          const local = parts(epoch, zone);
          return (
            local.date === match[1] &&
            local.minute === minute &&
            local.second === second
          );
        })
        .sort((a, b) => a - b);
      if (matches.length)
        return edge === "start" ? matches[0] : matches[matches.length - 1];
    }
  }
  throw new Error(
    "En Google-händelse har ett datum eller en tidszon som inte kan läsas. Ingen import har sparats.",
  );
}
export function stockholmMidnight(date: string) {
  return googleInstant(`${date}T00:00:00`);
}
export function googleWeekRange(week: string) {
  return {
    timeMin: new Date(stockholmMidnight(week)).toISOString(),
    timeMax: new Date(stockholmMidnight(addDays(week, 7))).toISOString(),
  };
}
export function timedSegments(start: number, end: number, week: string) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    throw new Error(
      "En Google-händelse har en ogiltig tidslängd. Ingen import har sparats.",
    );
  const segments: { date: string; start: number; end: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(week, i),
      from = Math.max(start, stockholmMidnight(date)),
      to = Math.min(end, stockholmMidnight(addDays(date, 1)));
    if (to <= from) continue;
    const first = parts(from),
      last = parts(to - 1);
    let startMinute = first.minute,
      endMinute = last.minute + 1;
    if (first.offset > last.offset) {
      // A repeated autumn hour cannot be represented twice by the minute-based
      // planner. Reserve its entire wall-clock interval to avoid double booking.
      let low = from,
        high = to - 1;
      while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (parts(mid).offset === first.offset) low = mid;
        else high = mid;
      }
      const before = parts(low),
        after = parts(high);
      startMinute = Math.min(startMinute, after.minute);
      endMinute = Math.max(endMinute, before.minute + 1);
    }
    if (endMinute <= startMinute)
      throw new Error(
        "Händelsens tid kunde inte omvandlas till svensk kalendertid.",
      );
    segments.push({ date, start: startMinute, end: endMinute });
  }
  return segments;
}
