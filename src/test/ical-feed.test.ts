import { describe, expect, it } from "vitest";
import {
  parseFeedWeek,
  privateGoogleFeed,
  readFeed,
} from "../../supabase/functions/_shared/ical-feed";
import {
  googleEventActivities,
  previewGoogleImport,
  categorizeGoogleEvent,
} from "../lib/google-calendar";
import { createData } from "../lib/defaults";
import { decodeData } from "../lib/storage";
import { resetPlanning } from "../lib/reset-planning";

const week = "2026-10-26";
const url =
  "https://calendar.google.com/calendar/ical/test%40example.test/private-0123456789abcdef0123456789abcdef/basic.ics";
const wrap = (...events: string[]) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Min kalender\r\nX-WR-TIMEZONE:Europe/Stockholm\r\n${events.join("\r\n")}\r\nEND:VCALENDAR\r\n`;
const event = (
  body = "DTSTART:20261026T080000Z\nDTEND:20261026T090000Z",
  uid = "abcdef123@google.com",
) => `BEGIN:VEVENT\nUID:${uid}\nSUMMARY:Bokning\n${body}\nEND:VEVENT`;

describe("Privat Google iCal", () => {
  it("accepterar bara privata Google-länkar och skickar aldrig anrop till andra värdar", async () => {
    expect(privateGoogleFeed(url)).toEqual({
      url,
      calendarId: "test@example.test",
    });
    for (const bad of [
      url.replace("https:", "http:"),
      url.replace("calendar.google.com", "127.0.0.1"),
      url.replace("calendar.google.com", "calendar.google.com.evil.test"),
      url.replace("calendar.google.com", "user:pass@calendar.google.com"),
      url.replace("private-0123456789abcdef0123456789abcdef", "public"),
      `${url}?redirect=http://localhost`,
      `${url}#secret`,
      url.replace("test%40example.test", "%2Fetc"),
      "file:///etc/passwd",
    ]) {
      expect(() => privateGoogleFeed(bad)).toThrow();
    }
    let requested = false;
    await expect(
      readFeed("https://localhost/basic.ics", week, async () => {
        requested = true;
        return new Response();
      }),
    ).rejects.toThrow();
    expect(requested).toBe(false);
  });
  it("läser UTC, radvikning, beskrivning och ledig tid med stabil Google-identitet", () => {
    const result = parseFeedWeek(
      wrap(
        event(
          "DTSTART:20261026T080000Z\nDTEND:20261026T090000Z\nDESCRIPTION:Första raden\\nAndra\\, raden\nTRANSP:TRANSPARENT\nLOCATION:Rum\n Föreläsning",
        ),
      ),
      week,
    );
    expect(result.name).toBe("Min kalender");
    expect(result.events[0]).toMatchObject({
      id: "abcdef123",
      description: "Första raden\nAndra, raden",
      transparency: "transparent",
      start: { dateTime: "2026-10-26T08:00:00.000Z" },
    });
    const activity = googleEventActivities(
      { id: "test@example.test", summary: result.name },
      result.events,
      week,
    )[0];
    expect(activity).toMatchObject({
      start: 540,
      end: 600,
      external: { busy: false },
    });
  });
  it("expanderar återkommande bokningar, undantag, flyttade tillfällen och avbokningar", () => {
    const result = parseFeedWeek(
      wrap(
        event(
          "DTSTART;TZID=Europe/Stockholm:20261019T090000\nDTEND;TZID=Europe/Stockholm:20261019T100000\nRRULE:FREQ=DAILY;COUNT=20\nEXDATE;TZID=Europe/Stockholm:20261027T090000",
        ),
        event(
          "RECURRENCE-ID;TZID=Europe/Stockholm:20261028T090000\nDTSTART;TZID=Europe/Stockholm:20261028T110000\nDTEND;TZID=Europe/Stockholm:20261028T120000",
        ),
        event(
          "RECURRENCE-ID;TZID=Europe/Stockholm:20261029T090000\nSTATUS:CANCELLED",
        ),
      ),
      week,
    );
    expect(result.events).toHaveLength(5);
    expect(
      result.events.some((e) => e.start.dateTime?.startsWith("2026-10-27")),
    ).toBe(false);
    expect(
      result.events.find((e) => e.id === "abcdef123_20261028T080000Z")?.start
        .dateTime,
    ).toBe("2026-10-28T10:00:00.000Z");
    expect(result.deleted).toContain("abcdef123_20261029T080000Z");
  });
  it("bevarar förmiddagens klockslag över sommartidsbytet och läser VTIMEZONE", () => {
    const timezone = `BEGIN:VTIMEZONE\nTZID:Europe/Stockholm\nBEGIN:STANDARD\nDTSTART:19701025T030000\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nEND:STANDARD\nBEGIN:DAYLIGHT\nDTSTART:19700329T020000\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\nTZOFFSETFROM:+0100\nTZOFFSETTO:+0200\nEND:DAYLIGHT\nEND:VTIMEZONE`;
    const result = parseFeedWeek(
      wrap(
        timezone,
        event(
          "DTSTART;TZID=Europe/Stockholm:20261019T090000\nDTEND;TZID=Europe/Stockholm:20261019T100000\nRRULE:FREQ=DAILY;COUNT=20",
        ),
      ),
      "2026-10-19",
    );
    expect(result.events).toHaveLength(7);
    expect(result.events[0].start.dateTime).toBe("2026-10-19T07:00:00.000Z");
    expect(result.events[6].start.dateTime).toBe("2026-10-25T08:00:00.000Z");
  });
  it("läser heldagar, flerdagar, flytande tider och en annan IANA-tidszon", () => {
    const result = parseFeedWeek(
      wrap(
        event(
          "DTSTART;VALUE=DATE:20261025\nDTEND;VALUE=DATE:20261028",
          "all-day",
        ),
        event("DTSTART:20261026T100000\nDTEND:20261026T110000", "floating"),
        event(
          "DTSTART;TZID=America/New_York:20261026T090000\nDURATION:PT1H",
          "new-york",
        ),
      ),
      week,
    );
    const activities = googleEventActivities(
      { id: "test@example.test", summary: result.name },
      result.events,
      week,
    );
    expect(activities.filter((a) => a.external!.allDay)).toHaveLength(2);
    expect(
      activities.find((a) => a.external!.eventId === "ical:floating")?.start,
    ).toBe(600);
    expect(
      activities.find((a) => a.external!.eventId === "ical:new-york")?.start,
    ).toBe(840);
  });
  it("nekar trasiga och ofullständiga filer, dubbletter och orimlig upprepning", () => {
    for (const text of [
      "<html>Unauthorized</html>",
      wrap(event()).replace("END:VCALENDAR", ""),
      wrap(event(), event()),
      wrap(
        event(
          "RECURRENCE-ID;RANGE=THISANDFUTURE:20261026T080000Z\nDTSTART:20261026T090000Z\nDTEND:20261026T100000Z",
        ),
      ),
      wrap(
        event(
          "DTSTART:20261026T080000Z\nDTEND:20261026T090000Z\nRDATE;VALUE=PERIOD:20261027T080000Z/PT2H",
        ),
      ),
      wrap(event("DTSTART:20261026T090000Z\nDTEND:20261026T080000Z")),
      wrap(
        event(
          "DTSTART:20261026T080000Z\nDTEND:20261026T090000Z\nRRULE:FREQ=SECONDLY",
        ),
      ),
      wrap(
        event(
          "DTSTART;TZID=Mars/Base:20261026T090000\nDTEND;TZID=Mars/Base:20261026T100000",
        ),
      ),
    ]) {
      expect(() => parseFeedWeek(text, week)).toThrow();
    }
    expect(() => parseFeedWeek(wrap(), "2026-10-27")).toThrow();
    expect(parseFeedWeek(wrap(), week).events).toEqual([]);
  });
  it("följer inte omdirigeringar och begränsar hämtningens storlek", async () => {
    await expect(
      readFeed(url, week, async (_, init) => {
        expect(init?.redirect).toBe("manual");
        expect(init?.cache).toBe("no-store");
        return new Response(null, {
          status: 302,
          headers: { location: "http://localhost" },
        });
      }),
    ).rejects.toThrow();
    await expect(
      readFeed(
        url,
        week,
        async () =>
          new Response("x", {
            headers: { "content-length": String(6 * 1024 * 1024) },
          }),
      ),
    ).rejects.toThrow();
    expect(
      (await readFeed(url, week, async () => new Response(wrap(event()))))
        .events,
    ).toHaveLength(1);
  });
  it("återimporterar utan dubbletter och behåller kategori, genomförd status och andra kalendrar", () => {
    const snapshot = (text: string) => {
      const feed = parseFeedWeek(text, week);
      return {
        week,
        calendarIds: ["test@example.test"],
        activities: googleEventActivities(
          { id: "test@example.test", summary: feed.name },
          feed.events,
          week,
        ),
        importedAt: "2026-10-30T10:00:00Z",
        transport: "ical" as const,
      };
    };
    let data = previewGoogleImport(
      createData(),
      snapshot(wrap(event())),
      false,
    ).data;
    const booking = data.weeks[week].activities.find((a) => a.external)!;
    booking.status = "done";
    data = categorizeGoogleEvent(data, booking, "learning");
    const other = {
      ...booking,
      id: "other",
      external: { ...booking.external!, calendarId: "other" },
    };
    data.weeks[week].activities.push(other);
    data.icalCalendar = { calendarId: "test@example.test", autoRefresh: true };
    const next = previewGoogleImport(
      data,
      snapshot(wrap(event("DTSTART:20261026T100000Z\nDTEND:20261026T110000Z"))),
      false,
    ).data;
    expect(next.weeks[week].activities.filter((a) => a.external)).toHaveLength(
      2,
    );
    expect(
      next.weeks[week].activities.find((a) => a.id === booking.id),
    ).toMatchObject({ categoryId: "learning", status: "done", start: 660 });
    expect(next.weeks[week].activities).toContainEqual(other);
    expect(decodeData(JSON.stringify(next))).toEqual(next);
    expect(resetPlanning(next, week).icalCalendar).toBeUndefined();
    expect(() =>
      decodeData(
        JSON.stringify({
          ...next,
          icalCalendar: { ...next.icalCalendar, url },
        }),
      ),
    ).toThrow();
  });
});
