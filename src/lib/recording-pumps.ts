import type { QueuedAudio } from "./recording-queue";

/** Separate workers: AI latency can never hold the upload worker or microphone. */
export function recordingPumps(deps: {
  list(): Promise<QueuedAudio[]>;
  upload(item: QueuedAudio): Promise<string>;
  acknowledge(item: QueuedAudio, hash: string): Promise<string>;
  markUploaded(key: string, hash: string): Promise<void>;
  transcribe(item: QueuedAudio): Promise<void>;
  remove(key: string): Promise<void>;
  alive(): boolean;
}) {
  let uploading: Promise<void> | undefined,
    transcribing: Promise<void> | undefined;
  async function uploads(sessionId?: string): Promise<void> {
    while (deps.alive()) {
      const item = (await deps.list()).find(
        (q) => !q.uploaded && (!sessionId || q.sessionId === sessionId),
      );
      if (!item) return;
      if (uploading) {
        await uploading.catch(() => undefined);
        continue;
      }
      const task = (async () => {
        if (!item.blob) throw new Error("Den lokala ljudkopian saknas.");
        const hash = await deps.upload(item);
        const verified = await deps.acknowledge(item, hash);
        if (verified !== hash)
          throw new Error(
            "Molnkopians kontrollsumma stämmer inte. Den lokala kopian finns kvar.",
          );
        // Releasing the local blob requires verified, durable cloud storage.
        await deps.markUploaded(item.key, hash);
      })();
      uploading = task;
      try {
        await task;
      } finally {
        if (uploading === task) uploading = undefined;
      }
    }
  }
  async function ai(sessionId?: string): Promise<void> {
    while (deps.alive()) {
      const item = (await deps.list()).find(
        (q) => q.uploaded && (!sessionId || q.sessionId === sessionId),
      );
      if (!item) return;
      if (transcribing) {
        await transcribing.catch(() => undefined);
        continue;
      }
      const task = (async () => {
        await deps.transcribe(item);
        await deps.remove(item.key);
      })();
      transcribing = task;
      try {
        await task;
      } finally {
        if (transcribing === task) transcribing = undefined;
      }
    }
  }
  return { uploads, ai };
}
