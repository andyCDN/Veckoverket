import type { SupabaseClient } from "@supabase/supabase-js";
import { appPath } from "./app-path";
import { RECORDING_BUCKET } from "../../supabase/functions/_shared/recording-schema";
export function recordingClient(client: SupabaseClient, userId: string) {
  return {
    async call<T>(body: Record<string, unknown>): Promise<T> {
      const { data, error } = await client.functions.invoke("recording", {
        body,
        timeout:
          body.action === "transcribe" || body.action === "summarize"
            ? 110000
            : 30000,
      });
      if (error) {
        let message =
          "Inspelningstjänsten är inte tillgänglig. Serverfunktionen behöver vara installerad i Supabase.";
        if (error.context instanceof Response)
          try {
            const info = await error.context.clone().json();
            if (typeof info.error === "string") message = info.error;
          } catch {
            /* Keep safe fallback. */
          }
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
  } = {},
) {
  const params = new URLSearchParams(
    Object.entries(context).filter(
      (entry): entry is [string, string] => !!entry[1],
    ),
  );
  return appPath("/inspelning/") + (params.size ? `?${params.toString()}` : "");
}
