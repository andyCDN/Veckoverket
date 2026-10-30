import type { Activity, AppData, WeekPlan } from "./types";
import { addDays, monday } from "./date";
import {
  GOOGLE_CATEGORY,
  GOOGLE_CATEGORY_ID,
  googleEventUrl,
  googleEventKey as eventKey,
  isGoogleEventKey,
} from "./external-calendar";
import { generateWeek, validatePlan } from "./planner";
import { planningBoundary } from "./date";
import { replanAfterBookings } from "./auto-planning";
import {
  googleInstant,
  googleWeekRange,
  isLocalDate,
  timedSegments,
} from "./google-time";
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
const API = "https://www.googleapis.com/calendar/v3";
export type GoogleCalendar = {
  id: string;
  summary: string;
  primary?: boolean;
  timeZone?: string;
};
export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  transparency?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};
export type GoogleSnapshot = {
  week: string;
  calendarIds: string[];
  activities: Activity[];
  importedAt: string;
  deleted?: { calendarId: string; eventId: string }[];
};
export class GoogleAuthorizationError extends Error {
  constructor() {
    super(
      "Google-anslutningen har gått ut. Anslut Google igen för att hämta kalendern.",
    );
    this.name = "GoogleAuthorizationError";
  }
}
async function paged<T>(
  path: string,
  token: string,
  params: Record<string, string>,
  signal: AbortSignal,
) {
  let pageToken = "";
  const seen = new Set<string>(),
    items: T[] = [];
  for (let page = 0; page < 50; page++) {
    const url = new URL(`${API}/${path}`);
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
      cache: "no-store",
    });
    if (response.status === 401) throw new GoogleAuthorizationError();
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "Google tillåter inte läsning av den valda kalendern. Kontrollera kalenderbehörigheten och anslut igen."
          : response.status === 429
            ? "Google har begränsat antalet förfrågningar. Försök igen senare."
            : "Google-kalendern kunde inte hämtas. Befintliga importerade händelser har bevarats.",
      );
    const body = await response.json();
    if (!body || (body.items !== undefined && !Array.isArray(body.items)))
      throw new Error(
        "Google skickade ett ogiltigt kalendersvar. Ingen import har sparats.",
      );
    items.push(...(body.items ?? []));
    if (!body.nextPageToken) return items;
    if (typeof body.nextPageToken !== "string" || seen.has(body.nextPageToken))
      throw new Error(
        "Kalenderhämtningen kunde inte slutföras. Ingen import har sparats.",
      );
    pageToken = body.nextPageToken;
    seen.add(pageToken);
  }
  throw new Error(
    "Kalendern gav för många svarsidor. Ingen ofullständig import har sparats.",
  );
}
export async function listGoogleCalendars(token: string, signal: AbortSignal) {
  const items = await paged<
    GoogleCalendar & { accessRole?: string; deleted?: boolean }
  >(
    "users/me/calendarList",
    token,
    {
      maxResults: "250",
      fields:
        "items(id,summary,primary,timeZone,accessRole,deleted),nextPageToken",
    },
    signal,
  );
  return items.filter(
    (c) =>
      typeof c.id === "string" &&
      typeof c.summary === "string" &&
      !c.deleted &&
      ["owner", "writer", "reader"].includes(c.accessRole ?? "reader"),
  );
}
export type GoogleCategoryChoices = Record<string, string>;

/** Local choices follow the source event, including moves and day segments. */
export function googleCategoryChoices(
  data: AppData,
  overrides: GoogleCategoryChoices = {},
): GoogleCategoryChoices {
  const categories: GoogleCategoryChoices = {
    ...data.googleCalendar?.eventCategories,
  };
  for (const plan of Object.values(data.weeks))
    for (const activity of plan.activities) {
      const key = eventKey(activity);
      if (
        key &&
        activity.categoryId !== GOOGLE_CATEGORY_ID &&
        categories[key] === undefined
      )
        categories[key] = activity.categoryId;
    }
  for (const [key, categoryId] of Object.entries(overrides)) {
    if (!isGoogleEventKey(key)) continue;
    if (categoryId === GOOGLE_CATEGORY_ID) delete categories[key];
    else if (data.categories.some((c) => c.id === categoryId))
      categories[key] = categoryId;
  }
  return categories;
}

export function categorizeGoogleEvent(
  data: AppData,
  activity: Activity,
  categoryId: string,
): AppData {
  const key = eventKey(activity);
  if (
    !key ||
    !Object.values(data.weeks).some((plan) =>
      plan.activities.some((a) => eventKey(a) === key),
    ) ||
    (categoryId !== GOOGLE_CATEGORY_ID &&
      !data.categories.some((c) => c.id === categoryId))
  )
    return data;
  const eventCategories = googleCategoryChoices(data, { [key]: categoryId });
  return {
    ...data,
    categories:
      categoryId === GOOGLE_CATEGORY_ID &&
      !data.categories.some((c) => c.id === GOOGLE_CATEGORY_ID)
        ? [...data.categories, { ...GOOGLE_CATEGORY }]
        : data.categories,
    weeks: Object.fromEntries(
      Object.entries(data.weeks).map(([week, plan]) => [
        week,
        plan.activities.some((a) => eventKey(a) === key)
          ? {
              ...plan,
              activities: plan.activities.map((a) =>
                eventKey(a) === key ? { ...a, categoryId } : a,
              ),
            }
          : plan,
      ]),
    ),
    ...(data.googleCalendar
      ? { googleCalendar: { ...data.googleCalendar, eventCategories } }
      : {}),
  };
}
export function googleEventActivities(
  calendar: GoogleCalendar,
  events: GoogleEvent[],
  week: string,
): Activity[] {
  const result: Activity[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (event.status === "cancelled") continue;
    if (!event.id || typeof event.id !== "string" || seen.has(event.id))
      throw new Error(
        "Google skickade en händelse med ogiltigt eller dubblerat ID. Ingen import har sparats.",
      );
    seen.add(event.id);
    let segments: { date: string; start: number; end: number }[] = [];
    const allDay = Boolean(event.start?.date && event.end?.date);
    let originalStart = allDay ? event.start!.date! : event.start?.dateTime;
    let originalEnd = allDay ? event.end!.date! : event.end?.dateTime;
    if (!originalStart || !originalEnd)
      throw new Error(
        "En Google-händelse saknar start eller slut. Ingen import har sparats.",
      );
    if (allDay) {
      if (
        !isLocalDate(originalStart) ||
        !isLocalDate(originalEnd) ||
        originalEnd <= originalStart
      )
        throw new Error(
          "En heldagshändelse har ogiltiga datum. Ingen import har sparats.",
        );
      for (let i = 0; i < 7; i++) {
        const date = addDays(week, i);
        if (date >= originalStart && date < originalEnd)
          segments.push({ date, start: 0, end: 1440 });
      }
    } else {
      const from = googleInstant(
        originalStart,
        event.start?.timeZone ?? calendar.timeZone,
      );
      const to = googleInstant(
        originalEnd,
        event.end?.timeZone ?? calendar.timeZone,
        "end",
      );
      segments = timedSegments(from, to, week);
      originalStart = new Date(from).toISOString();
      originalEnd = new Date(to).toISOString();
    }
    for (const segment of segments)
      result.push({
        id: `gcal:${encodeURIComponent(calendar.id)}:${encodeURIComponent(event.id)}:${segment.date}`,
        title: (event.summary?.trim() || "Upptagen").slice(0, 100),
        description: (event.description ?? "").slice(0, 2000),
        categoryId: GOOGLE_CATEGORY_ID,
        ...segment,
        estimatedMinutes: segment.end - segment.start,
        priority: 5,
        blockType: "locked",
        status: "planned",
        source: "external",
        external: {
          provider: "google-calendar",
          calendarId: calendar.id,
          eventId: event.id,
          allDay,
          busy: event.transparency !== "transparent",
          originalStart,
          originalEnd,
          ...(googleEventUrl(event.htmlLink)
            ? { url: googleEventUrl(event.htmlLink) }
            : {}),
        },
      });
  }
  return result;
}
export async function fetchGoogleWeek(
  token: string,
  calendars: GoogleCalendar[],
  week: string,
  signal: AbortSignal,
): Promise<GoogleSnapshot> {
  if (!calendars.length || calendars.length > 20)
    throw new Error("Välj mellan en och tjugo kalendrar.");
  const range = googleWeekRange(week);
  const results = await Promise.all(
    calendars.map(async (calendar) => {
      const events = await paged<GoogleEvent>(
        `calendars/${encodeURIComponent(calendar.id)}/events`,
        token,
        {
          ...range,
          singleEvents: "true",
          showDeleted: "true",
          orderBy: "startTime",
          maxResults: "2500",
          fields:
            "items(id,status,summary,description,transparency,htmlLink,start,end),nextPageToken",
        },
        signal,
      );
      return {
        activities: googleEventActivities(calendar, events, week),
        deleted: events
          .filter((e) => e.status === "cancelled" && typeof e.id === "string")
          .map((e) => ({ calendarId: calendar.id, eventId: e.id })),
      };
    }),
  );
  return {
    week,
    calendarIds: calendars.map((c) => c.id),
    activities: results.flatMap((result) => result.activities),
    deleted: results.flatMap((result) => result.deleted),
    importedAt: new Date().toISOString(),
  };
}
export function previewGoogleImport(
  data: AppData,
  snapshot: GoogleSnapshot,
  replan = true,
  categoryChoices: GoogleCategoryChoices = {},
) {
  const { week } = snapshot;
  if (monday(week) !== week)
    throw new Error("Importen behöver en giltig veckostart.");
  const previous = Object.values(data.weeks).flatMap((plan) => plan.activities);
  const eventCategories = googleCategoryChoices(data, categoryChoices);
  const statusById = new Map(
    previous.filter((a) => a.external).map((a) => [a.id, a.status]),
  );
  const statusByEvent = new Map<string, Activity["status"]>();
  for (const key of new Set(previous.filter((a) => a.external).map(eventKey))) {
    const entries = previous.filter((a) => eventKey(a) === key);
    statusByEvent.set(
      key,
      entries.every((a) => a.status === "done")
        ? "done"
        : entries.every((a) => a.status === "skipped")
          ? "skipped"
          : "planned",
    );
  }
  const withStatus = (a: Activity): Activity => ({
    ...a,
    categoryId: eventCategories[eventKey(a)] ?? GOOGLE_CATEGORY_ID,
    status: statusById.get(a.id) ?? statusByEvent.get(eventKey(a)) ?? "planned",
  });
  const imported = snapshot.activities.map(withStatus);
  const received = new Map(snapshot.activities.map((a) => [eventKey(a), a]));
  const deleted = new Set(
    (snapshot.deleted ?? []).map((e) =>
      JSON.stringify([e.calendarId, e.eventId]),
    ),
  );
  let removed = 0;
  const weeks: AppData["weeks"] = {};
  for (const [key, plan] of Object.entries(data.weeks)) {
    const refreshKeys = new Set<string>();
    const activities = plan.activities.filter((a) => {
      if (!a.external) return true;
      const sourceKey = eventKey(a);
      const replace =
        deleted.has(sourceKey) ||
        (a.date >= week && a.date < addDays(week, 7)) ||
        (key !== week && received.has(sourceKey));
      if (replace) {
        removed++;
        if (key !== week && !deleted.has(sourceKey) && received.has(sourceKey))
          refreshKeys.add(sourceKey);
      }
      return !replace;
    });
    for (const sourceKey of refreshKeys) {
      const event = received.get(sourceKey)!,
        source = event.external!;
      const converted = googleEventActivities(
        { id: source.calendarId, summary: "Google Kalender" },
        [
          {
            id: source.eventId,
            summary: event.title,
            description: event.description,
            htmlLink: source.url,
            transparency: source.busy ? "opaque" : "transparent",
            start: source.allDay
              ? { date: source.originalStart }
              : { dateTime: source.originalStart },
            end: source.allDay
              ? { date: source.originalEnd }
              : { dateTime: source.originalEnd },
          },
        ],
        key,
      );
      activities.push(...converted.map(withStatus));
    }
    weeks[key] =
      JSON.stringify(activities) === JSON.stringify(plan.activities)
        ? plan
        : { ...plan, activities };
  }
  const base: WeekPlan = weeks[week] ?? generateWeek(week, data).plan;
  const merged = {
    ...base,
    activities: [...base.activities, ...imported].sort(
      (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
    ),
  };
  const categories = data.categories.some((c) => c.id === GOOGLE_CATEGORY_ID)
    ? data.categories
    : [...data.categories, { ...GOOGLE_CATEGORY }];
  const current = { ...data, categories, weeks: { ...weeks, [week]: merged } };
  const candidate = generateWeek(
    week,
    {
      ...current,
      settings: {
        ...(merged.rules ?? data.settings),
        autoPlanning: data.settings.autoPlanning,
      },
    },
    merged,
    data.settings.autoPlanning
      ? { notBefore: planningBoundary(new Date(snapshot.importedAt)) }
      : {},
  );
  const errors = candidate.conflicts.filter((c) => c.severity === "error");
  const appliedReplan =
    (replan || Boolean(data.settings.autoPlanning)) && errors.length === 0;
  const plan = appliedReplan
    ? {
        ...candidate.plan,
        activities: candidate.plan.activities.map((a) =>
          a.goalId || a.external || previous.includes(a)
            ? a
            : {
                ...a,
                goalId: data.goals.find(
                  (g) => g.categoryId === a.categoryId && g.week === week,
                )?.id,
              },
        ),
      }
    : merged;
  const next: AppData = {
    ...current,
    weeks: { ...current.weeks, [week]: plan },
    googleCalendar: {
      calendarIds: snapshot.calendarIds,
      lastImportedAt: snapshot.importedAt,
      ...(Object.keys(eventCategories).length ? { eventCategories } : {}),
      lastImportedWeek: week,
    },
  };
  const affected = Object.keys(weeks).filter(
    (key) => key !== week && weeks[key] !== data.weeks[key],
  );
  return {
    data: replanAfterBookings(
      next,
      affected,
      planningBoundary(new Date(snapshot.importedAt)),
    ),
    count: imported.length,
    removed,
    replanned: appliedReplan,
    conflicts: appliedReplan
      ? candidate.conflicts
      : validatePlan(merged.activities, merged.rules ?? data.settings),
  };
}
export function removeGoogleImports(data: AppData): AppData {
  const { googleCalendar: _link, ...rest } = data;
  return {
    ...rest,
    weeks: Object.fromEntries(
      Object.entries(data.weeks).map(([week, plan]) => [
        week,
        { ...plan, activities: plan.activities.filter((a) => !a.external) },
      ]),
    ),
  };
}
