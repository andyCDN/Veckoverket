import { linkedInJobUrl } from "./linkedin-job-url.ts";
import { parseJobPage } from "./linkedin-job-details.ts";
export async function boundedText(
  body: ReadableStream<Uint8Array> | null,
  max: number,
) {
  if (!body) return "";
  const reader = body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new Error("Response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export function linkedInJobHandler(options: {
  origin: string;
  authenticate: (token: string) => Promise<string | null>;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const recent = new Map<string, { start: number; count: number }>(),
    request = options.fetch ?? fetch;
  return async (req: Request): Promise<Response> => {
    const headers = {
      "Access-Control-Allow-Origin": options.origin,
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    const reply = (status: number, code: string, message: string) =>
      new Response(JSON.stringify({ code, error: message }), {
        status,
        headers,
      });
    if (
      req.headers.get("origin") &&
      req.headers.get("origin") !== options.origin
    )
      return reply(403, "origin", "Otillåtet ursprung.");
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return reply(405, "method", "Använd POST.");
    let user: string | null = null;
    try {
      user = await options.authenticate(
        req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "",
      );
    } catch {
      /* Invalid session. */
    }
    if (!user)
      return reply(
        401,
        "auth",
        "Logga in i Veckoverket för att läsa annonsen.",
      );
    const now = (options.now ?? Date.now)();
    for (const [id, v] of recent) if (now - v.start >= 60000) recent.delete(id);
    const usage = recent.get(user);
    if (usage && usage.count >= 60)
      return reply(
        429,
        "limit",
        "För många hämtningar. Vänta en minut och försök igen.",
      );
    if (!usage) {
      if (recent.size >= 1000)
        return reply(429, "limit", "Tjänsten är upptagen. Försök senare.");
      recent.set(user, { start: now, count: 1 });
    } else usage.count++;
    let url: string | null;
    try {
      const body = JSON.parse(await boundedText(req.body, 4096));
      url = typeof body.url === "string" ? linkedInJobUrl(body.url) : null;
    } catch {
      return reply(400, "input", "Ange en giltig LinkedIn-länk till ett jobb.");
    }
    if (!url)
      return reply(400, "input", "Ange en giltig LinkedIn-länk till ett jobb.");
    try {
      let target = url;
      const signal = AbortSignal.timeout(12000);
      let response: Response | undefined;
      for (let i = 0; i < 3; i++) {
        response = await request(target, {
          redirect: "manual",
          signal,
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "sv,en;q=0.8",
          },
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!location)
            return reply(422, "blocked", "LinkedIn kunde inte visa annonsen.");
          const next = new URL(location, target);
          if (
            next.protocol !== "https:" ||
            next.hostname !== "www.linkedin.com" ||
            linkedInJobUrl(next.href) !== url
          )
            return reply(
              422,
              "blocked",
              "LinkedIn kräver inloggning eller blockerar läsningen. Klistra in annonstexten i stället.",
            );
          target = next.href;
          continue;
        }
        break;
      }
      if (!response?.ok) {
        await response?.body?.cancel();
        return reply(
          response?.status === 429 ? 429 : 422,
          "blocked",
          "LinkedIn blockerade läsningen eller annonsen finns inte längre. Öppna länken och klistra in annonstexten.",
        );
      }
      const html = await boundedText(response.body, 1500000),
        id = url.match(/\/(\d+)\/$/)![1],
        details = parseJobPage(html, id);
      if (!details.role && !details.organization)
        return reply(
          422,
          "unreadable",
          "Annonsuppgifterna kunde inte läsas. LinkedIn kan kräva inloggning. Klistra in annonstexten i stället.",
        );
      return new Response(JSON.stringify({ url, details }), {
        status: 200,
        headers,
      });
    } catch {
      return reply(
        502,
        "fetch",
        "Annonsen kunde inte hämtas inom tidsgränsen. Försök igen eller klistra in annonstexten.",
      );
    }
  };
}
