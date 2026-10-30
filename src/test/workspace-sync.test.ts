import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createData } from "../lib/defaults";
import { generateWeek } from "../lib/planner";
import { STORAGE_KEY, type StorageLike } from "../lib/storage";
import {
  cacheKey,
  LEGACY_OWNER_KEY,
  WorkspaceSync,
  type CloudDocument,
  type CloudTransport,
} from "../lib/workspace-sync";
const week = "2026-10-26";
function plan(name: string) {
  const data = createData();
  data.profile.name = name;
  data.weeks[week] = generateWeek(week, data).plan;
  return data;
}
function storage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function conflict() {
  return Object.assign(new Error("Changed"), { name: "CloudConflict" });
}
function fixture(
  initial: CloudDocument | null = {
    data: plan("Molnet"),
    revision: 1,
    updatedAt: "2026-10-29T10:00:00Z",
  },
) {
  const cache = storage();
  let remote = initial;
  const transport: CloudTransport = {
    load: vi.fn(async () => structuredClone(remote)),
    save: vi.fn(async (data, revision) => {
      if (revision !== (remote?.revision ?? 0)) throw conflict();
      remote = {
        data: structuredClone(data),
        revision: revision + 1,
        updatedAt: "2026-10-29T10:01:00Z",
      };
      return structuredClone(remote);
    }),
  };
  const changed = vi.fn();
  const store = new WorkspaceSync("user-a", transport, cache, changed, () =>
    plan("Ny plan"),
  );
  return {
    cache,
    transport,
    changed,
    store,
    get remote() {
      return remote;
    },
    set remote(value: CloudDocument | null) {
      remote = value;
    },
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("automatisk molnlagring", () => {
  it("hämtar kontots dokument före första skrivningen och bevarar den gamla lokala planen", async () => {
    const f = fixture();
    const local = plan("Lokal plan");
    f.cache.setItem(STORAGE_KEY, JSON.stringify(local));
    const read = deferred<CloudDocument | null>();
    f.transport.load = vi.fn(() => read.promise);
    const sync = new WorkspaceSync(
      "user-a",
      f.transport,
      f.cache,
      f.changed,
      () => plan("Ny"),
      local,
    );
    const starting = sync.start();
    expect(f.transport.save).not.toHaveBeenCalled();
    expect(sync.snapshot().phase).toBe("loading");
    read.resolve(f.remote);
    await starting;
    expect(sync.snapshot().data?.profile.name).toBe("Molnet");
    expect(f.transport.save).not.toHaveBeenCalled();
    expect(f.cache.getItem(STORAGE_KEY)).toBe(JSON.stringify(local));
  });
  it("kräver ett uttryckligt val innan lokal data flyttas till ett nytt konto", async () => {
    const f = fixture(null),
      local = plan("Min tidigare plan");
    f.cache.setItem(STORAGE_KEY, JSON.stringify(local));
    const sync = new WorkspaceSync(
      "user-a",
      f.transport,
      f.cache,
      f.changed,
      () => plan("Ny"),
      local,
    );
    await sync.start();
    expect(sync.snapshot().phase).toBe("migration");
    expect(f.transport.save).not.toHaveBeenCalled();
    sync.chooseInitial(true);
    await sync.flush();
    expect(f.remote?.data).toEqual(local);
    expect(sync.snapshot().phase).toBe("synced");
    expect(f.cache.getItem(STORAGE_KEY)).toBe(JSON.stringify(local));
    expect(f.cache.getItem(LEGACY_OWNER_KEY)).toBe("user-a");
    const other = fixture(null);
    const second = new WorkspaceSync(
      "user-b",
      other.transport,
      f.cache,
      vi.fn(),
      () => plan("Kontots nya plan"),
      local,
    );
    await second.start();
    await second.flush();
    expect(other.remote?.data.profile.name).toBe("Kontots nya plan");
    expect(JSON.parse(f.cache.getItem(cacheKey("user-a"))!).data).toEqual(
      local,
    );
  });
  it("samlar täta ändringar och bekräftar sparning först när servern svarat", async () => {
    const f = fixture();
    await f.store.start();
    f.store.update((d) => ({ ...d!, profile: { name: "Ett" } }));
    f.store.update((d) => ({ ...d!, profile: { name: "Två" } }));
    expect(f.store.snapshot().phase).toBe("pending");
    expect(f.transport.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(750);
    expect(f.transport.save).toHaveBeenCalledTimes(1);
    expect(f.remote?.data.profile.name).toBe("Två");
    expect(f.store.snapshot().phase).toBe("synced");
  });
  it("tappar inte ändringar som görs medan en tidigare version sparas", async () => {
    const f = fixture();
    await f.store.start();
    const write = deferred<CloudDocument>();
    const original = f.transport.save;
    f.transport.save = vi
      .fn()
      .mockImplementationOnce(() => write.promise)
      .mockImplementation(original);
    f.store.update((d) => ({ ...d!, profile: { name: "Första" } }));
    const first = f.store.flush();
    f.store.update((d) => ({ ...d!, profile: { name: "Andra" } }));
    expect(f.store.snapshot().pending).toBe(true);
    f.remote = { data: plan("Första"), revision: 2, updatedAt: "now" };
    write.resolve(f.remote);
    await first;
    expect(f.store.snapshot().phase).toBe("pending");
    expect(f.store.snapshot().data?.profile.name).toBe("Andra");
    await f.store.flush();
    expect(f.remote?.data.profile.name).toBe("Andra");
    const saved = JSON.parse(f.cache.getItem(cacheKey("user-a"))!);
    expect(saved.revision).toBe(3);
    expect(saved.dirty).toBe(false);
  });
  it("återställer offlineändringar från rätt kontos kö efter omladdning", async () => {
    const f = fixture();
    await f.store.start();
    const save = f.transport.save;
    f.transport.save = vi.fn(async () => {
      throw new Error("Offline");
    });
    f.store.update((d) => ({ ...d!, profile: { name: "Offlineändring" } }));
    await f.store.flush();
    expect(f.store.snapshot().phase).toBe("error");
    expect(f.store.snapshot().pending).toBe(true);
    f.store.dispose();
    f.transport.save = save;
    const restored = new WorkspaceSync(
      "user-a",
      f.transport,
      f.cache,
      f.changed,
      () => plan("Ny"),
    );
    await restored.start();
    await restored.flush();
    expect(f.remote?.data.profile.name).toBe("Offlineändring");
    expect(restored.snapshot().pending).toBe(false);
  });
  it("hanterar ett förlorat serversvar utan att skriva över eller dubbelspara", async () => {
    const f = fixture();
    await f.store.start();
    const save = f.transport.save;
    f.transport.save = vi.fn(async (data, revision) => {
      await save(data, revision);
      throw new Error("Svaret försvann");
    });
    f.store.update((d) => ({
      ...d!,
      profile: { name: "Sparades på servern" },
    }));
    await f.store.flush();
    f.store.dispose();
    const restored = new WorkspaceSync(
      "user-a",
      f.transport,
      f.cache,
      f.changed,
      () => plan("Ny"),
    );
    await restored.start();
    expect(restored.snapshot().phase).toBe("synced");
    expect(restored.snapshot().pending).toBe(false);
    expect(f.remote?.revision).toBe(2);
    expect(f.transport.save).toHaveBeenCalledTimes(1);
  });
  it("skriver inte över en annan enhets ändringar utan versionsval", async () => {
    const f = fixture();
    await f.store.start();
    f.store.update((d) => ({ ...d!, profile: { name: "Enhet A" } }));
    f.remote = { data: plan("Enhet B"), revision: 2, updatedAt: "now" };
    await f.store.flush();
    expect(f.store.snapshot().phase).toBe("conflict");
    expect(f.store.snapshot().data?.profile.name).toBe("Enhet A");
    expect(f.remote.data.profile.name).toBe("Enhet B");
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.transport.save).toHaveBeenCalledTimes(1);
    await f.store.resolveConflict("device");
    expect(f.remote.data.profile.name).toBe("Enhet A");
    expect(f.remote.revision).toBe(3);
  });
  it("kontrollerar även nya ändringar efter att en konflikt visats", async () => {
    const f = fixture();
    await f.store.start();
    f.store.update((d) => ({ ...d!, profile: { name: "A" } }));
    f.remote = { data: plan("B"), revision: 2, updatedAt: "now" };
    await f.store.flush();
    f.remote = { data: plan("B, ännu nyare"), revision: 3, updatedAt: "now" };
    await f.store.resolveConflict("device");
    expect(f.store.snapshot().phase).toBe("conflict");
    expect(f.remote.data.profile.name).toBe("B, ännu nyare");
    await f.store.resolveConflict("cloud");
    expect(f.store.snapshot().data?.profile.name).toBe("B, ännu nyare");
    expect(f.store.snapshot().pending).toBe(false);
  });
  it("skyddar redigering som börjar medan en bakgrundshämtning pågår", async () => {
    const f = fixture();
    await f.store.start();
    const read = deferred<CloudDocument | null>();
    f.transport.load = vi.fn(() => read.promise);
    const refresh = f.store.refresh();
    f.store.update((d) => ({
      ...d!,
      profile: { name: "Pågående redigering" },
    }));
    read.resolve({ data: plan("Annan enhet"), revision: 2, updatedAt: "now" });
    await refresh;
    expect(f.store.snapshot().phase).toBe("conflict");
    expect(f.store.snapshot().data?.profile.name).toBe("Pågående redigering");
    expect(f.transport.save).not.toHaveBeenCalled();
  });
  it("visar inget annat kontos cache och skriver inget efter en misslyckad första hämtning", async () => {
    const f = fixture();
    await f.store.start();
    f.store.dispose();
    f.transport.load = vi.fn(async () => {
      throw new Error("Offline");
    });
    const second = new WorkspaceSync(
      "user-b",
      f.transport,
      f.cache,
      f.changed,
      () => plan("Ny"),
    );
    await second.start();
    expect(second.snapshot().data).toBeNull();
    expect(second.snapshot().phase).toBe("error");
    expect(f.transport.save).not.toHaveBeenCalled();
  });
  it("håller molnkopian uppdaterad även när webbläsarens lagring är full", async () => {
    const f = fixture();
    const broken: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("Quota");
      },
    };
    const sync = new WorkspaceSync(
      "user-a",
      f.transport,
      broken,
      f.changed,
      () => plan("Ny"),
    );
    await sync.start();
    sync.update((d) => ({ ...d!, profile: { name: "Direkt i molnet" } }));
    await sync.flush();
    expect(f.remote?.data.profile.name).toBe("Direkt i molnet");
    expect(sync.snapshot().phase).toBe("synced");
    expect(sync.snapshot().storageError).not.toBe("");
  });
  it("ignorerar svar från en avslutad inloggning och bevarar korrupt cache", async () => {
    const f = fixture();
    const read = deferred<CloudDocument | null>();
    f.transport.load = vi.fn(() => read.promise);
    const starting = f.store.start();
    f.store.dispose();
    f.changed.mockClear();
    read.resolve(f.remote);
    await starting;
    expect(f.changed).not.toHaveBeenCalled();
    f.cache.setItem(cacheKey("user-a"), "not json");
    f.transport.load = vi.fn(async () => f.remote);
    const sync = new WorkspaceSync(
      "user-a",
      f.transport,
      f.cache,
      f.changed,
      () => plan("Ny"),
    );
    await sync.start();
    expect(f.cache.getItem(cacheKey("user-a"))).toBe("not json");
    expect(sync.snapshot().storageError).not.toBe("");
  });
  it("pausar bakgrundsläsning under formulärredigering men stoppar inte revisionskontrollen", async () => {
    const f = fixture();
    await f.store.start();
    f.store.setEditing(true);
    f.remote = { data: plan("Annan enhet"), revision: 2, updatedAt: "now" };
    await f.store.refresh();
    expect(f.transport.load).toHaveBeenCalledTimes(1);
    f.store.update((d) => ({
      ...d!,
      profile: { name: "Min formulärändring" },
    }));
    await f.store.flush();
    expect(f.store.snapshot().phase).toBe("conflict");
    expect(f.remote.data.profile.name).toBe("Annan enhet");
  });
  it("tillämpar inte en sen bakgrundshämtning när ett formulär precis har öppnats", async () => {
    const f = fixture();
    await f.store.start();
    const read = deferred<CloudDocument | null>();
    f.transport.load = vi.fn(() => read.promise);
    const refreshing = f.store.refresh();
    f.store.setEditing(true);
    read.resolve({
      data: plan("Ny molnversion"),
      revision: 2,
      updatedAt: "now",
    });
    await refreshing;
    expect(f.store.snapshot().data?.profile.name).toBe("Molnet");
    f.store.setEditing(false);
    await f.store.refresh();
    expect(f.store.snapshot().data?.profile.name).toBe("Ny molnversion");
  });
});

it("synkar ansökningar, kontaktlogg och deadlines med kalender och bevarade utfall", async () => {
  const f = fixture();
  await f.store.start();
  const original = f.store.snapshot().data!;
  const next = structuredClone(original);
  next.applications = [
    {
      id: "a",
      organization: "Bolag",
      role: "Roll",
      status: "sent",
      deadline: "2026-11-02",
      followUpDate: "2026-10-30",
      nextAction: "Följ upp",
      notes: "",
    },
  ];
  next.contacts = [
    {
      id: "c",
      name: "Kim",
      organization: "Bolag",
      followUpDate: "2026-10-30",
      nextAction: "Ring",
      entries: [
        {
          id: "log",
          date: "2026-10-29",
          channel: "E-post",
          notes: "Kontaktad",
        },
      ],
    },
  ];
  next.deadlines = [
    {
      id: "d",
      title: "Ansökan",
      date: "2026-11-02",
      minute: 900,
      categoryId: "career",
      applicationId: "a",
      steps: [{ id: "s", title: "CV", minutes: 60 }],
    },
  ];
  f.store.update(next);
  await f.store.flush();
  expect(f.remote?.data).toEqual(next);
  const second = new WorkspaceSync(
    "user-a",
    f.transport,
    storage(),
    vi.fn(),
    () => plan("Ny"),
  );
  await second.start();
  expect(second.snapshot().data).toEqual(next);
  expect(second.snapshot().data?.weeks).toEqual(original.weeks);
  second.dispose();
  f.store.dispose();
});
