import type { Activity, Settings } from "./types";

/** A shared time axis with enough room to read even the shortest bookings. */
export function weekTimeline(activities: Activity[], settings: Settings) {
  const start = Math.min(settings.start, ...activities.map((a) => a.start));
  const end = Math.max(settings.end, ...activities.map((a) => a.end));
  const hours: number[] = [];
  for (let minute = Math.ceil(start / 60) * 60; minute <= end; minute += 60)
    hours.push(minute);
  const points = [
    ...new Set([
      start,
      end,
      ...hours,
      ...activities.flatMap((a) => [a.start, a.end]),
    ]),
  ].sort((a, b) => a - b);
  const sizes = points
    .slice(1)
    .map((point, i) => Math.max(12, point - points[i]));
  const lanes = new Map<string, { lane: number; count: number }>();
  for (const date of new Set(activities.map((a) => a.date))) {
    const entries = activities
      .filter((a) => a.date === date)
      .sort(
        (a, b) =>
          a.start - b.start || a.end - b.end || a.id.localeCompare(b.id),
      );
    let group: Activity[] = [],
      groupEnd = -1;
    const assign = () => {
      const ends: number[] = [];
      for (const a of group) {
        let lane = ends.findIndex((end) => end <= a.start);
        if (lane < 0) lane = ends.length;
        ends[lane] = a.end;
        lanes.set(a.id, { lane, count: 0 });
      }
      for (const a of group) lanes.get(a.id)!.count = ends.length;
    };
    for (const a of entries) {
      if (a.start >= groupEnd) {
        assign();
        group = [];
      }
      group.push(a);
      groupEnd = Math.max(a.end, group.length === 1 ? -1 : groupEnd);
    }
    assign();
  }
  for (const a of activities) {
    const from = points.indexOf(a.start),
      to = points.indexOf(a.end);
    if (to <= from) continue;
    const current = sizes.slice(from, to).reduce((sum, size) => sum + size, 0);
    const minimum =
      (lanes.get(a.id)?.count ?? 1) > 1 ? 180 : a.deadlineId ? 150 : 130;
    if (current < minimum) {
      for (let i = from; i < to; i++)
        sizes[i] +=
          ((minimum - current) * (points[i + 1] - points[i])) /
          (a.end - a.start);
    }
  }
  const offsets = [0];
  for (const size of sizes) offsets.push(offsets.at(-1)! + size);
  const position = (minute: number) => offsets[points.indexOf(minute)];
  return {
    height: offsets.at(-1)! + 8,
    ticks: [...new Set([start, ...hours, end])].map((minute) => ({
      minute,
      top: position(minute),
    })),
    entries: new Map(
      activities.map((a) => [
        a.id,
        {
          top: position(a.start),
          height: position(a.end) - position(a.start) - 6,
          ...lanes.get(a.id)!,
        },
      ]),
    ),
  };
}
