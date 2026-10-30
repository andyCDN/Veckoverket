import { describe, expect, it } from "vitest";
import {
  decryptFeed,
  encryptFeed,
  icalHandler,
  type SavedFeed,
} from "../../supabase/functions/_shared/ical-handler";

const key = btoa("12345678901234567890123456789012"),
  userA = "user-a",
  userB = "user-b";
const url =
  "https://calendar.google.com/calendar/ical/test%40example.test/private-0123456789abcdef0123456789abcdef/basic.ics";
function setup() {
  const feeds = new Map<string, SavedFeed>(),
    calls: string[] = [];
  let allowed = true,
    fail = false;
  const handler = icalHandler({
    origin: "https://andycdn.github.io",
    encryptionKey: key,
    authenticate: async (token) =>
      token === userA || token === userB ? token : null,
    store: {
      load: async (user) => feeds.get(user) ?? null,
      save: async (user, feed) => {
        feeds.set(user, feed);
      },
      remove: async (user) => {
        feeds.delete(user);
      },
      claim: async () => allowed,
    },
    read: async (value, week) => {
      calls.push(value);
      if (fail) throw new Error(`Network error: ${url}`);
      return { name: "Kalender", events: [], deleted: [] };
    },
  });
  async function request(
    body: unknown,
    user = userA,
    origin = "https://andycdn.github.io",
  ) {
    const response = await handler(
      new Request("https://project.supabase.co/functions/v1/calendar-ical", {
        method: "POST",
        headers: { Authorization: `Bearer ${user}`, Origin: origin },
        body: JSON.stringify(body),
      }),
    );
    return {
      status: response.status,
      data: await response.json(),
      headers: response.headers,
    };
  }
  return {
    request,
    feeds,
    calls,
    set allowed(value: boolean) {
      allowed = value;
    },
    set fail(value: boolean) {
      fail = value;
    },
  };
}
describe("iCal Edge Function", () => {
  it("krypterar med slumpad IV och binder dekryptering till rätt konto", async () => {
    const first = await encryptFeed(url, key, userA),
      second = await encryptFeed(url, key, userA);
    expect(first).not.toBe(second);
    expect(first).not.toContain("private-");
    expect(await decryptFeed(first, key, userA)).toBe(url);
    await expect(decryptFeed(first, key, userB)).rejects.toThrow();
    await expect(
      decryptFeed(first.slice(0, -4) + "AAAA", key, userA),
    ).rejects.toThrow();
  });
  it("kräver verifierad inloggning och rätt ursprung före lagring eller Google-anrop", async () => {
    const api = setup();
    expect(
      (
        await api.request(
          { action: "connect", url, week: "2026-10-26" },
          "invalid",
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await api.request(
          { action: "connect", url, week: "2026-10-26" },
          userA,
          "https://evil.test",
        )
      ).status,
    ).toBe(403);
    expect(api.feeds.size).toBe(0);
    expect(api.calls).toEqual([]);
  });
  it("sparar endast krypterad länk, returnerar ingen länk och skiljer konton åt", async () => {
    const api = setup();
    const connected = await api.request({
      action: "connect",
      url,
      week: "2026-10-26",
      userId: userB,
    });
    expect(connected.status).toBe(200);
    expect(connected.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(connected.data)).not.toContain("private-");
    expect(api.feeds.has(userA)).toBe(true);
    expect(api.feeds.has(userB)).toBe(false);
    expect(
      await decryptFeed(api.feeds.get(userA)!.encrypted_url, key, userA),
    ).toBe(url);
    expect((await api.request({ action: "status" })).data.feed.calendarId).toBe(
      "test@example.test",
    );
    expect((await api.request({ action: "status" }, userB)).data.feed).toBe(
      null,
    );
    expect(
      (await api.request({ action: "read", week: "2026-10-26" }, userB)).status,
    ).toBe(404);
    expect(
      (await api.request({ action: "read", week: "2026-10-26" })).status,
    ).toBe(200);
    await api.request({ action: "disconnect" }, userB);
    expect(api.feeds.has(userA)).toBe(true);
    await api.request({ action: "disconnect" });
    expect(api.feeds.size).toBe(0);
  });
  it("validerar veckor/länkar, begränsar anrop och behåller anslutningen vid fel utan att exponera länken", async () => {
    const api = setup();
    expect(
      (
        await api.request({
          action: "connect",
          url: "https://localhost",
          week: "2026-10-26",
        })
      ).status,
    ).toBe(400);
    expect(
      (await api.request({ action: "connect", url, week: "2026-10-27" }))
        .status,
    ).toBe(400);
    await api.request({ action: "connect", url, week: "2026-10-26" });
    const before = api.feeds.get(userA);
    api.allowed = false;
    expect(
      (await api.request({ action: "read", week: "2026-10-26" })).status,
    ).toBe(429);
    api.allowed = true;
    api.fail = true;
    const failed = await api.request({
      action: "connect",
      url: url.replace(
        "0123456789abcdef0123456789abcdef",
        "abcdef0123456789abcdef0123456789",
      ),
      week: "2026-10-26",
    });
    expect(failed.status).toBe(502);
    expect(JSON.stringify(failed.data)).not.toContain("private-");
    expect(api.feeds.get(userA)).toEqual(before);
  });
});
