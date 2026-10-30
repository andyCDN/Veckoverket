export type QueuedAudio = {
  key: string;
  userId: string;
  sessionId: string;
  index: number;
  blob?: Blob;
  uploaded?: boolean;
  sha256?: string;
  durationMs: number;
  createdAt: number;
};
let opening: Promise<IDBDatabase> | undefined;
function database() {
  if (!opening)
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("veckoverket-recording-audio", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("segments", {
          keyPath: "key",
        });
        store.createIndex("userId", "userId");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Ljudkön är låst i en annan flik."));
    }).catch((error) => {
      opening = undefined;
      throw error;
    });
  return opening;
}
export async function listQueuedAudio(userId: string): Promise<QueuedAudio[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("segments", "readonly"),
      request = tx.objectStore("segments").index("userId").getAll(userId);
    request.onsuccess = () =>
      resolve(
        (request.result as QueuedAudio[]).sort(
          (a, b) => a.createdAt - b.createdAt || a.index - b.index,
        ),
      );
    request.onerror = () => reject(request.error);
  });
}
export async function putQueuedAudio(segment: QueuedAudio) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("segments", "readwrite", {
      durability: "strict",
    });
    tx.objectStore("segments").add(segment);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function removeQueuedAudio(key: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("segments", "readwrite", {
      durability: "strict",
    });
    tx.objectStore("segments").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function markAudioUploaded(key: string, sha256: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("segments", "readwrite", {
        durability: "strict",
      }),
      store = tx.objectStore("segments"),
      request = store.get(key);
    request.onsuccess = () => {
      if (!request.result) {
        tx.abort();
        return;
      }
      store.put({ ...request.result, blob: undefined, uploaded: true, sha256 });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Ljudkön kunde inte uppdateras."));
  });
}
