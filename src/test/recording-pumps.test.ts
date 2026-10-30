import { it, expect } from "vitest";
import { recordingPumps } from "../lib/recording-pumps";
import type { QueuedAudio } from "../lib/recording-queue";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture() {
  const queue: QueuedAudio[] = [],
    cloud = new Set<number>();
  let failUpload = false,
    badHash = false;
  const aiGate = deferred(),
    aiEntered = deferred();
  const pumps = recordingPumps({
    list: async () => queue.slice(),
    upload: async (q) => {
      if (failUpload) throw new Error("offline");
      cloud.add(q.index);
      return "verified";
    },
    acknowledge: async () => (badHash ? "mismatch" : "verified"),
    markUploaded: async (key, sha256) => {
      Object.assign(
        queue.find((q) => q.key === key)!,
        { uploaded: true, blob: undefined, sha256 },
      );
    },
    transcribe: async () => {
      aiEntered.resolve();
      await aiGate.promise;
    },
    remove: async (key) => {
      queue.splice(
        queue.findIndex((q) => q.key === key),
        1,
      );
    },
    alive: () => true,
  });
  const add = (index: number, sessionId = "a") =>
    queue.push({
      key: `${sessionId}/${index}`,
      userId: "u",
      sessionId,
      index,
      blob: new Blob(["audio"]),
      durationMs: 20000,
      createdAt: index,
    });
  return {
    pumps,
    queue,
    cloud,
    aiGate,
    aiEntered,
    add,
    set offline(v: boolean) {
      failUpload = v;
    },
    set badHash(v: boolean) {
      badHash = v;
    },
  };
}
it("låter fler än sex ljuddelar laddas upp medan transkriberingen står still", async () => {
  const f = fixture();
  f.add(0);
  await f.pumps.uploads();
  const ai = f.pumps.ai();
  await f.aiEntered.promise;
  for (let i = 1; i < 12; i++) f.add(i);
  await f.pumps.uploads();
  expect(f.cloud.size).toBe(12);
  expect(f.queue).toHaveLength(12);
  expect(f.queue.every((q) => q.uploaded && !q.blob)).toBe(true);
  f.aiGate.resolve();
  await ai;
  expect(f.queue).toEqual([]);
});
it("behåller lokalt ljud vid nätfel och felaktig kontrollsumma och försöker igen utan dubbla filer", async () => {
  const f = fixture();
  f.add(0);
  f.offline = true;
  await expect(f.pumps.uploads()).rejects.toThrow("offline");
  expect(f.queue[0].blob).toBeInstanceOf(Blob);
  f.offline = false;
  f.badHash = true;
  await expect(f.pumps.uploads()).rejects.toThrow("kontrollsumma");
  expect(f.queue[0].blob).toBeInstanceOf(Blob);
  f.badHash = false;
  await Promise.all([f.pumps.uploads(), f.pumps.uploads()]);
  expect(f.cloud.size).toBe(1);
  expect(f.queue[0]).toMatchObject({
    uploaded: true,
    sha256: "verified",
    blob: undefined,
  });
});
it("väntar inte på andra samtals AI när det valda samtalet redan är klart", async () => {
  const f = fixture();
  f.add(0, "new");
  await f.pumps.uploads();
  const ai = f.pumps.ai();
  await f.aiEntered.promise;
  await f.pumps.ai("previous");
  await f.pumps.uploads("previous");
  f.aiGate.resolve();
  await ai;
});
