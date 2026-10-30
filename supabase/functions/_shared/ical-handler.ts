import {
  privateGoogleFeed,
  readFeed,
  validWeek,
  type FeedWeek,
} from "./ical-feed.ts";

export type SavedFeed = {
  calendar_id: string;
  name: string;
  encrypted_url: string;
};
export type FeedStore = {
  load(userId: string): Promise<SavedFeed | null>;
  save(userId: string, feed: SavedFeed): Promise<void>;
  remove(userId: string): Promise<void>;
  claim(userId: string): Promise<boolean>;
};
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function unbase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function keyFrom(value: string) {
  const bytes = unbase64(value);
  if (bytes.length !== 32) throw new Error("Invalid encryption key");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encryptFeed(url: string, key: string, userId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
    await keyFrom(key),
    new TextEncoder().encode(url),
  );
  return `v1.${base64(iv)}.${base64(new Uint8Array(body))}`;
}
export async function decryptFeed(value: string, key: string, userId: string) {
  const [version, iv, body] = value.split(".");
  if (version !== "v1" || !iv || !body) throw new Error("Invalid ciphertext");
  const result = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: unbase64(iv),
      additionalData: new TextEncoder().encode(userId),
    },
    await keyFrom(key),
    unbase64(body),
  );
  return new TextDecoder().decode(result);
}
/** The adapter authenticates tokens with Supabase Auth; user IDs never come from a request body. */
export function icalHandler(options: {
  origin: string;
  encryptionKey: string;
  authenticate(token: string): Promise<string | null>;
  store: FeedStore;
  read?: (url: string, week: string) => Promise<FeedWeek>;
}) {
  return async (request: Request) => {
    const headers = {
      "Access-Control-Allow-Origin": options.origin,
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      Vary: "Origin",
    };
    const reply = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers });
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== options.origin
    )
      return reply({ error: "Anropet kommer från en annan webbplats." }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return reply({ error: "Metoden stöds inte." }, 405);
    try {
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer (.+)$/i)?.[1];
      const userId = token ? await options.authenticate(token) : null;
      if (!userId)
        return reply(
          { error: "Logga in i Veckoverket för att ansluta kalendern." },
          401,
        );
      const text = await request.text();
      if (text.length > 4096) return reply({ error: "För långt anrop." }, 400);
      let body: { action?: string; url?: unknown; week?: unknown };
      try {
        body = JSON.parse(text);
      } catch {
        return reply({ error: "Ogiltigt anrop." }, 400);
      }
      if (!body || typeof body !== "object")
        return reply({ error: "Ogiltigt anrop." }, 400);
      if (body.action === "status") {
        const feed = await options.store.load(userId);
        return reply({
          feed: feed ? { calendarId: feed.calendar_id, name: feed.name } : null,
        });
      }
      if (body.action === "disconnect") {
        await options.store.remove(userId);
        return reply({ feed: null });
      }
      if (body.action !== "connect" && body.action !== "read")
        return reply({ error: "Okänd kalenderåtgärd." }, 400);
      if (!validWeek(body.week))
        return reply({ error: "Välj en giltig veckostart." }, 400);
      let feed: SavedFeed | null = null,
        parsed: ReturnType<typeof privateGoogleFeed>;
      if (body.action === "connect") {
        try {
          parsed = privateGoogleFeed(body.url);
        } catch (error) {
          return reply({ error: (error as Error).message }, 400);
        }
      } else {
        feed = await options.store.load(userId);
        if (!feed)
          return reply(
            { error: "Ingen iCal-länk är ansluten. Lägg till länken igen." },
            404,
          );
        parsed = privateGoogleFeed(
          await decryptFeed(feed.encrypted_url, options.encryptionKey, userId),
        );
      }
      if (!(await options.store.claim(userId)))
        return reply(
          { error: "Vänta 15 sekunder mellan kalenderhämtningarna." },
          429,
        );
      let result: FeedWeek;
      try {
        result = await (options.read ?? readFeed)(parsed.url, body.week);
      } catch {
        return reply(
          {
            error:
              "Kalendern kunde inte hämtas eller läsas fullständigt. Kontrollera länken och försök igen. Befintliga bokningar har bevarats.",
          },
          502,
        );
      }
      if (body.action === "connect") {
        await options.store.save(userId, {
          calendar_id: parsed.calendarId,
          name: result.name,
          encrypted_url: await encryptFeed(
            parsed.url,
            options.encryptionKey,
            userId,
          ),
        });
      }
      return reply({
        feed: { calendarId: parsed.calendarId, name: result.name },
        ...result,
        week: body.week,
        importedAt: new Date().toISOString(),
      });
    } catch {
      // Do not return/log exception text: upstream errors can contain the secret URL.
      return reply(
        {
          error:
            "Kalenderanslutningen kunde inte användas. Kontrollera serverinstallationen och försök igen. Befintliga bokningar har bevarats.",
        },
        503,
      );
    }
  };
}
