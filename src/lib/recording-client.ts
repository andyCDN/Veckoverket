import type { SupabaseClient } from "@supabase/supabase-js";
import { appPath } from "./app-path";
import { RECORDING_BUCKET } from "../../supabase/functions/_shared/recording-schema";
import type { RecordingSegment } from "../../supabase/functions/_shared/recording-schema";
export function recordingClient(client: SupabaseClient, userId: string) {
  return {
    async segments(sessionId: string): Promise<RecordingSegment[]> {
      const output: RecordingSegment[] = [];
      for (let offset = 0; offset < 100000; offset += 500) {
        const { data, error } = await client
          .from("recording_segments")
          .select("*")
          .eq("user_id", userId)
          .eq("session_id", sessionId)
          .eq("state", "ready")
          .order("segment_index")
          .range(offset, offset + 499)
          .abortSignal(AbortSignal.timeout(15000));
        if (error)
          throw new Error("Citatens ljuddelar kunde inte hämtas. Försök igen.");
        output.push(
          ...(data ?? []).map((r) => ({
            index: r.segment_index,
            transcript: r.transcript,
            durationMs: r.duration_ms,
            originalTranscript: r.original_transcript ?? r.transcript,
            revision: r.transcript_revision ?? 0,
          })),
        );
        if (!data || data.length < 500) return output;
      }
      return output;
    },
    async summaryVersions(sessionId: string) {
      const { data, error } = await client
        .from("recording_summary_versions")
        .select("revision,summary,created_at")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .order("revision", { ascending: false })
        .limit(20)
        .abortSignal(AbortSignal.timeout(15000));
      if (error)
        throw new Error("Tidigare sammanfattningar kunde inte hämtas.");
      return data as {
        revision: number;
        summary: import("../../supabase/functions/_shared/recording-schema").RecordingSummary;
        created_at: string;
      }[];
    },
    async audio(sessionId: string, index: number) {
      const { data, error } = await client.storage
        .from(RECORDING_BUCKET)
        .download(`${userId}/${sessionId}/${index}.wav`);
      if (error || !data)
        throw new Error(
          "Ljuddelen kunde inte hämtas. Kontrollera att inspelningen finns kvar.",
        );
      return data;
    },
    async call<T>(body: Record<string, unknown>): Promise<T> {
      const { data, error } = await client.functions.invoke("recording", {
        body,
        timeout:
          body.action === "check-ai"
            ? 55000
            : body.action === "transcribe" || body.action === "summarize"
              ? 110000
              : 30000,
      });
      if (error) {
        let message =
          "Inspelningstjänsten är inte tillgänglig. Serverfunktionen behöver vara installerad i Supabase.";
        if (error.context instanceof Response) {
          if (error.context.status === 401)
            message =
              "Inloggningen kunde inte verifieras. Logga ut och in igen. Om felet kvarstår behöver inspelningens serverinstallation kontrolleras.";
          else if (error.context.status !== 404)
            message =
              "Serveranropet misslyckades. Det sparade ljudet finns kvar för ett nytt försök.";
          try {
            const info = await error.context.clone().json();
            if (typeof info.error === "string") message = info.error;
          } catch {
            /* Keep safe fallback. */
          }
        } else if (error.name === "FunctionsFetchError")
          message =
            "Anropet kunde inte slutföras. Kontrollera nätanslutningen och försök igen. Sparat ljud behålls.";
        throw new Error(message);
      }
      if (data?.error) throw new Error(String(data.error));
      return data as T;
    },
    async upload(sessionId: string, index: number, blob: Blob) {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        await blob.arrayBuffer(),
      );
      const sha256 = Array.from(new Uint8Array(hash), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      // Storage upload has no AbortSignal option in this SDK. A late request is
      // safe: uploads are immutable, retries use the same path and verify SHA.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        client.storage
          .from(RECORDING_BUCKET)
          .upload(`${userId}/${sessionId}/${index}.wav`, blob, {
            contentType: "audio/wav",
            upsert: false,
          }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Uppladdningen tog för lång tid. Den lokala kopian finns kvar.",
                ),
              ),
            60000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      const { error } = result;
      const code = error as {
        statusCode?: string;
        message?: string;
        code?: string;
      } | null;
      const duplicate =
        code &&
        (String(code.statusCode) === "409" ||
          (String(code.statusCode) === "400" &&
            (code.code === "Duplicate" ||
              code.message === "The resource already exists")));
      // Older Storage versions return 400 for duplicates. The following server
      // acknowledgement still has to verify the exact local SHA-256.
      if (error && !duplicate)
        throw new Error(
          "Ljudsegmentet kunde inte laddas upp. Den lokala kopian finns kvar.",
        );
      return sha256;
    },
  };
}

export function recordingHref(
  context: {
    applicationId?: string;
    contactId?: string;
    interviewId?: string;
    recordingId?: string;
    segment?: number;
  } = {},
) {
  const params = new URLSearchParams(
    Object.entries(context)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return appPath("/inspelning/") + (params.size ? `?${params.toString()}` : "");
}
