import ICAL from "ical.js";

export type FeedEvent = {
  id: string;
  summary?: string;
  description?: string;
  transparency?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
};
export type FeedWeek = {
  events: FeedEvent[];
  deleted: string[];
  name: string;
};
const invalid = () =>
  new Error(
    "Kalenderfilen kunde inte läsas fullständigt. Befintliga bokningar har bevarats.",
  );

/** A fixed Google host/path prevents using the function as an arbitrary URL proxy. */
export function privateGoogleFeed(value: unknown) {
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("Ange Googles hemliga adress i iCal-format.");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Ange en giltig privat iCal-länk från Google Kalender.");
  }
  const match = url.pathname.match(
    /^\/calendar\/ical\/([^/]+)\/private-[a-zA-Z0-9_-]{16,128}\/basic\.ics$/,
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "calendar.google.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match
  )
    throw new Error(
      "Använd Hemlig adress i iCal-format från Google Kalender, med adressen https://calendar.google.com/calendar/ical/…/basic.ics.",
    );
  let calendarId: string;
  try {
    calendarId = decodeURIComponent(match[1]);
  } catch {
    throw invalid();
  }
  if (
    !calendarId ||
    calendarId.length > 500 ||
    /[\s/\\\x00-\x1f]/.test(calendarId)
  )
    throw invalid();
  return { url: url.href, calendarId };
}

export function validWeek(week: unknown): week is string {
  if (typeof week !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(week))
    return false;
  const date = new Date(`${week}T12:00:00Z`);
  return (
    Number.isFinite(+date) &&
    date.toISOString().slice(0, 10) === week &&
    date.getUTCDay() === 1 &&
    date.getUTCFullYear() >= 2000 &&
    date.getUTCFullYear() <= 2100
  );
}

/** Resolve floating/IANA times through Intl when the feed omits VTIMEZONE. */
const formatters = new Map<string, Intl.DateTimeFormat>();
function localInstant(
  value: string,
  zone: string,
  edge: "start" | "end" = "start",
) {
  const naive = Date.parse(`${value}Z`);
  if (!Number.isFinite(naive)) throw invalid();
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    if (formatters.size >= 32) formatters.clear();
    formatters.set(zone, formatter);
  }
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const epoch = naive + delta;
    const parts = Object.fromEntries(
      formatter.formatToParts(epoch).map((p) => [p.type, p.value]),
    );
    offsets.add(
      Date.parse(
        `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
      ) - epoch,
    );
  }
  const matches = [...offsets]
    .map((offset) => naive - offset)
    .filter((epoch) => {
      const p = Object.fromEntries(
        formatter.formatToParts(epoch).map((p) => [p.type, p.value]),
      );
      return (
        `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` ===
        value
      );
    });
  if (!matches.length) throw invalid();
  return edge === "end" ? Math.max(...matches) : Math.min(...matches);
}
type IcalTime = InstanceType<typeof ICAL.Time>;
function instant(
  time: IcalTime,
  zone: string,
  edge: "start" | "end" = "start",
) {
  if (time.isDate)
    return localInstant(`${time.toString()}T00:00:00`, "Europe/Stockholm");
  if (time.zone.tzid !== "floating") return time.toUnixTime() * 1000;
  return localInstant(time.toString(), zone, edge);
}
function sourceId(
  uid: string,
  recurrence?: IcalTime,
  zone = "Europe/Stockholm",
) {
  // Google's normal iCal UID contains its API event ID. Keep this identity when
  // changing connection method, including an occurrence's original start.
  const base = /^[a-v0-9]+@google\.com$/.test(uid)
    ? uid.slice(0, -11)
    : `ical:${uid}`;
  if (!recurrence) return base;
  const suffix = recurrence.isDate
    ? recurrence.toString().replaceAll("-", "")
    : new Date(instant(recurrence, zone))
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(".000", "");
  return `${base}_${suffix}`;
}

/** Expand a complete feed into one Stockholm week; never return a partial parse. */
export function parseFeedWeek(text: string, week: string): FeedWeek {
  if (!validWeek(week)) throw new Error("Välj en giltig veckostart.");
  try {
    const trimmed = text.replace(/^\uFEFF/, "").trim();
    if (
      !trimmed.startsWith("BEGIN:VCALENDAR") ||
      !trimmed.endsWith("END:VCALENDAR")
    )
      throw invalid();
    const root = new ICAL.Component(ICAL.parse(trimmed));
    if (
      root.name !== "vcalendar" ||
      root.getFirstPropertyValue("version") !== "2.0"
    )
      throw invalid();
    const zone = String(
      root.getFirstPropertyValue("x-wr-timezone") || "Europe/Stockholm",
    );
    const from = localInstant(`${week}T00:00:00`, "Europe/Stockholm");
    const endDate = new Date(`${week}T12:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 7);
    const to = localInstant(
      `${endDate.toISOString().slice(0, 10)}T00:00:00`,
      "Europe/Stockholm",
    );
    const components = root.getAllSubcomponents("vevent");
    if (components.length > 20000) throw invalid();
    const exceptions = new Set<string>(),
      seen = new Set<string>(),
      events: FeedEvent[] = [],
      deleted: string[] = [];
    let iterations = 0;
    function eventZone(
      component: InstanceType<typeof ICAL.Component>,
      property = "dtstart",
    ) {
      return String(
        component.getFirstProperty(property)?.getParameter("tzid") ||
          (property === "dtend" &&
            component.getFirstProperty("dtstart")?.getParameter("tzid")) ||
          zone,
      );
    }
    for (const component of components) {
      if (
        component.getFirstProperty("recurrence-id")?.getParameter("range") ||
        component
          .getAllProperties("rdate")
          .some((property) => property.type === "period")
      )
        throw invalid();
      const uid = component.getFirstPropertyValue("uid");
      if (typeof uid !== "string" || !uid || uid.length > 1000) throw invalid();
      const recurrence = component.getFirstPropertyValue(
        "recurrence-id",
      ) as IcalTime | null;
      const id = sourceId(
        uid,
        recurrence ?? undefined,
        eventZone(component, "recurrence-id"),
      );
      if (seen.has(id)) throw invalid();
      seen.add(id);
      if (recurrence) exceptions.add(id);
    }
    function push(
      event: InstanceType<typeof ICAL.Event>,
      start: IcalTime,
      end: IcalTime,
      id: string,
    ) {
      const startEpoch = instant(start, eventZone(event.component));
      const endEpoch = instant(end, eventZone(event.component, "dtend"), "end");
      if (endEpoch <= startEpoch || start.isDate !== end.isDate)
        throw invalid();
      if (startEpoch >= to || endEpoch <= from) return;
      if (events.length >= 5000) throw invalid();
      events.push({
        id,
        summary: (event.summary || "Upptagen").slice(0, 100),
        description: (event.description || "").slice(0, 2000),
        transparency:
          event.component.getFirstPropertyValue("transp") === "TRANSPARENT"
            ? "transparent"
            : "opaque",
        start: start.isDate
          ? { date: start.toString() }
          : { dateTime: new Date(startEpoch).toISOString() },
        end: end.isDate
          ? { date: end.toString() }
          : { dateTime: new Date(endEpoch).toISOString() },
      });
    }
    for (const component of components) {
      const uid = String(component.getFirstPropertyValue("uid"));
      const recurrence = component.getFirstPropertyValue(
        "recurrence-id",
      ) as IcalTime | null;
      const id = sourceId(
        uid,
        recurrence ?? undefined,
        eventZone(component, "recurrence-id"),
      );
      if (component.getFirstPropertyValue("status") === "CANCELLED") {
        deleted.push(id);
        continue;
      }
      if (!component.hasProperty("dtstart")) throw invalid();
      const event = new ICAL.Event(component, { exceptions: [] });
      if (!event.isRecurring() || recurrence) {
        push(event, event.startDate, event.endDate, id);
        continue;
      }
      for (const rule of component.getAllProperties("rrule")) {
        const frequency = (rule.getFirstValue() as { freq?: string }).freq;
        if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(frequency ?? ""))
          throw invalid();
      }
      const iterator = event.iterator();
      let occurrence: IcalTime | undefined;
      while ((occurrence = iterator.next())) {
        if (++iterations > 100000) throw invalid();
        if (instant(occurrence, eventZone(component)) >= to) break;
        const occurrenceId = sourceId(uid, occurrence, eventZone(component));
        if (exceptions.has(occurrenceId)) continue;
        const details = event.getOccurrenceDetails(occurrence);
        push(event, details.startDate, details.endDate, occurrenceId);
      }
    }
    if (new Set(events.map((e) => e.id)).size !== events.length)
      throw invalid();
    return {
      events,
      deleted,
      name: String(
        root.getFirstPropertyValue("x-wr-calname") || "Google Kalender",
      ).slice(0, 100),
    };
  } catch {
    throw invalid();
  }
}

export async function readFeed(
  url: string,
  week: string,
  fetcher: typeof fetch = fetch,
): Promise<FeedWeek> {
  privateGoogleFeed(url);
  const signal = AbortSignal.timeout(15000);
  const response = await fetcher(url, {
    signal,
    redirect: "manual",
    cache: "no-store",
    headers: { Accept: "text/calendar" },
  });
  if (!response.ok || response.status >= 300)
    throw new Error(
      "iCal-länken kunde inte hämtas. Kontrollera att den hemliga adressen fortfarande gäller. Befintliga bokningar har bevarats.",
    );
  if (
    !response.body ||
    Number(response.headers.get("content-length")) > 5 * 1024 * 1024
  )
    throw invalid();
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 5 * 1024 * 1024) throw invalid();
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  return parseFeedWeek(text, week);
}
