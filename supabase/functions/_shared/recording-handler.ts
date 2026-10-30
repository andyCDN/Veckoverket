import {
  checkedSummary,
  combineSummaries,
  SUMMARY_BATCH_SIZE,
  wavDuration,
  type RecordingContext,
  type RecordingSegment,
  type RecordingSession,
  type RecordingSummary,
} from "./recording-schema.ts";
import { recordingAIError } from "./recording-ai.ts";
export type RecordingStore = {
  list(user: string): Promise<RecordingSession[]>;
  create(
    user: string,
    title: string,
    context: RecordingContext,
  ): Promise<RecordingSession>;
  load(user: string, id: string): Promise<RecordingSession | null>;
  categorize(
    user: string,
    id: string,
    title: string,
    context: RecordingContext,
  ): Promise<void>;
  segments(user: string, id: string): Promise<RecordingSegment[]>;
  pending(user: string, id: string): Promise<number[]>;
  received(user: string, id: string): Promise<number[]>;
  acknowledge(
    user: string,
    id: string,
    index: number,
    hash: string,
    duration: number,
  ): Promise<void>;
  audio(user: string, id: string, index: number): Promise<Uint8Array>;
  claim(
    user: string,
    id: string,
    index: number,
    hash: string,
    duration: number,
  ): Promise<"claimed" | "ready" | "busy">;
  saveTranscript(
    user: string,
    id: string,
    index: number,
    transcript: string,
  ): Promise<void>;
  failSegment(user: string, id: string, index: number): Promise<void>;
  stop(user: string, id: string, count: number): Promise<void>;
  loadPart(
    user: string,
    id: string,
    index: number,
  ): Promise<RecordingSummary | null>;
  savePart(
    user: string,
    id: string,
    index: number,
    summary: RecordingSummary,
  ): Promise<void>;
  complete(user: string, id: string, summary: RecordingSummary): Promise<void>;
  remove(user: string, id: string): Promise<void>;
};
export function recordingHandler(deps: {
  origin: string;
  configured: boolean;
  authenticate: (token: string) => Promise<string | null>;
  store: RecordingStore;
  transcribe: (audio: Uint8Array) => Promise<string>;
  summarize: (transcript: string) => Promise<unknown>;
  checkAI?: () => Promise<void>;
}) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin"),
      headers = {
        "Access-Control-Allow-Origin": deps.origin,
        "Access-Control-Allow-Headers":
          "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
        "Cache-Control": "no-store",
      };
    const reply = (body: unknown, status = 200) =>
      Response.json(body, { status, headers });
    if (origin && origin !== deps.origin)
      return reply({ error: "Otillåten origin." }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return reply({ error: "Metoden stöds inte." }, 405);
    try {
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer (.+)$/i)?.[1];
      const user = token ? await deps.authenticate(token) : null;
      if (!user)
        return reply({ error: "Logga in för att hantera inspelningar." }, 401);
      const text = await request.text();
      if (text.length > 16000)
        return reply({ error: "Begäran är för stor." }, 413);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(text);
      } catch {
        return reply({ error: "Ogiltig begäran." }, 400);
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return reply({ error: "Ogiltig begäran." }, 400);
      const action = body.action;
      if (action === "status") {
        await deps.store.list(user);
        return reply({
          ready: true,
          aiReady: deps.configured,
          deferredCategorization: true,
          aiDiagnostics: Boolean(deps.checkAI),
        });
      }
      if (action === "check-ai") {
        if (!deps.configured)
          return reply(
            {
              error:
                "AI-nyckeln saknas. Lägg till RECORDING_AI_KEY i Supabase → Edge Functions → Secrets.",
              code: "ai_not_configured",
            },
            503,
          );
        if (!deps.checkAI)
          return reply(
            {
              error:
                "Uppdatera inspelningens serverfunktion för att kontrollera AI-anslutningen.",
              code: "ai_diagnostics_unavailable",
            },
            503,
          );
        await deps.checkAI();
        return reply({ aiReady: true, transcription: true, summary: true });
      }
      if (action === "list")
        return reply({ sessions: await deps.store.list(user) });
      if (action === "create" || action === "categorize") {
        const title = body.title,
          context = body.context as RecordingContext;
        if (
          typeof title !== "string" ||
          !title.trim() ||
          title.length > 200 ||
          !context ||
          typeof context !== "object" ||
          Array.isArray(context) ||
          Object.entries(context).some(
            ([k, v]) =>
              ![
                "categoryId",
                "applicationId",
                "contactId",
                "interviewId",
              ].includes(k) ||
              typeof v !== "string" ||
              !v.trim() ||
              v.length > 200,
          ) ||
          (context.interviewId && !context.applicationId)
        )
          return reply(
            { error: "Ange en rubrik och giltiga kategoriseringsuppgifter." },
            400,
          );
        if (action === "create")
          return reply({
            session: await deps.store.create(user, title.trim(), context),
          });
      }
      const id = body.id;
      if (
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        return reply({ error: "Ogiltig inspelning." }, 400);
      const session = await deps.store.load(user, id);
      if (!session)
        return reply(
          { error: "Inspelningen finns inte eller tillhör ett annat konto." },
          404,
        );
      if (action === "categorize") {
        await deps.store.categorize(
          user,
          id,
          (body.title as string).trim(),
          body.context as RecordingContext,
        );
        return reply({ session: await deps.store.load(user, id) });
      }
      if (action === "get") {
        const segments = await deps.store.segments(user, id),
          pendingIndices = await deps.store.pending(user, id),
          indices = [...segments.map((s) => s.index), ...pendingIndices];
        return reply({
          session,
          nextIndex: indices.length ? Math.max(...indices) + 1 : 0,
          readyCount: segments.length,
          pendingIndices,
        });
      }
      if (action === "delete") {
        await deps.store.remove(user, id);
        return reply({ removed: true });
      }
      if (action === "transcribe" || action === "acknowledge") {
        if (action === "transcribe" && session.state === "complete") {
          const ready = await deps.store.segments(user, id);
          return ready.some((s) => s.index === body.index)
            ? reply({ ready: true, index: body.index })
            : reply({ error: "Inspelningen är avslutad." }, 409);
        }
        if (action === "transcribe" && !deps.configured)
          return reply({ error: "AI-bearbetningen är inte aktiverad." }, 503);
        const index = body.index;
        if (
          !Number.isInteger(index) ||
          Number(index) < 0 ||
          Number(index) > 99999
        )
          return reply({ error: "Ogiltigt ljudsegment." }, 400);
        if (session.state !== "active" && Number(index) >= session.segmentCount)
          return reply({ error: "Inspelningen är avslutad." }, 409);
        const audio = await deps.store.audio(user, id, Number(index));
        let duration: number;
        try {
          duration = wavDuration(audio);
        } catch {
          return reply({ error: "Ljudsegmentet är ogiltigt." }, 400);
        }
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new Uint8Array(audio),
        );
        const hash = Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        if (body.sha256 !== undefined && body.sha256 !== hash)
          return reply(
            {
              error:
                "Ljudsegmentet matchar inte den lokala kopian. Kopian behålls.",
            },
            409,
          );
        if (action === "acknowledge") {
          await deps.store.acknowledge(user, id, Number(index), hash, duration);
          return reply({ received: true, index, sha256: hash });
        }
        const claim = await deps.store.claim(
          user,
          id,
          Number(index),
          hash,
          duration,
        );
        if (claim === "ready") return reply({ ready: true, index });
        if (claim === "busy")
          return reply(
            { error: "Segmentet bearbetas redan. Försök igen om en stund." },
            409,
          );
        try {
          const transcript = await deps.transcribe(audio);
          if (typeof transcript !== "string" || transcript.length > 20000)
            throw new Error("Invalid transcript");
          await deps.store.saveTranscript(user, id, Number(index), transcript);
        } catch (error) {
          await deps.store.failSegment(user, id, Number(index));
          return reply(
            recordingAIError(error) ?? {
              error:
                "Ljudsegmentet kunde inte transkriberas. Det sparade ljudet finns kvar för ett nytt försök.",
            },
            502,
          );
        }
        return reply({ ready: true, index });
      }
      if (action === "stop") {
        const received = await deps.store.received(user, id),
          count = body.count;
        const unverified = (await deps.store.pending(user, id)).some(
          (index) => !received.includes(index),
        );
        if (
          !Number.isInteger(count) ||
          Number(count) < 0 ||
          Number(count) > 100000 ||
          received.length !== count ||
          received.some((index, i) => index !== i) ||
          unverified
        )
          return reply(
            {
              error:
                "Ljudsegment saknas eller är inte verifierade i molnet. Ljudet som finns lokalt behålls.",
            },
            409,
          );
        if (session.state === "active")
          await deps.store.stop(user, id, Number(count));
        return reply({ stopped: true, count });
      }
      if (action === "summarize") {
        if (session.state === "active")
          return reply(
            { error: "Stoppa inspelningen och slutför uppladdningen först." },
            409,
          );
        if (session.state === "complete" && session.summary)
          return reply({ done: true, summary: session.summary });
        if (!deps.configured)
          return reply({ error: "AI-bearbetningen är inte aktiverad." }, 503);
        const segments = await deps.store.segments(user, id);
        if (
          segments.length !== session.segmentCount ||
          segments.some((s, i) => s.index !== i)
        )
          return reply({ error: "Ljudsegment saknas." }, 409);
        const total = Math.ceil(segments.length / SUMMARY_BATCH_SIZE),
          parts: RecordingSummary[] = [];
        for (let i = 0; i < total; i++) {
          const saved = await deps.store.loadPart(user, id, i);
          if (saved) {
            parts.push(saved);
            continue;
          }
          const transcript = segments
            .slice(i * SUMMARY_BATCH_SIZE, (i + 1) * SUMMARY_BATCH_SIZE)
            .map((s) => s.transcript)
            .join("\n");
          const summary = transcript.trim()
            ? checkedSummary(await deps.summarize(transcript), transcript)
            : {
                agreements: [],
                nextSteps: [],
                uncertainties: ["Ingen taltext identifierad i ljudavsnittet."],
              };
          await deps.store.savePart(user, id, i, summary);
          return reply({
            done: false,
            completedParts: i + 1,
            totalParts: total,
          });
        }
        const summary = combineSummaries(parts);
        await deps.store.complete(user, id, summary);
        return reply({ done: true, summary });
      }
      return reply({ error: "Okänd åtgärd." }, 400);
    } catch (error) {
      return reply(
        recordingAIError(error) ?? {
          error:
            "Inspelningstjänsten är inte tillgänglig. Kontrollera serverinstallationen eller försök igen.",
        },
        503,
      );
    }
  };
}
