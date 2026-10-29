import { decodeData, STORAGE_KEY, type StorageLike } from "./storage";
import type { AppData } from "./types";

export type CloudDocument = {
  data: AppData;
  revision: number;
  updatedAt: string;
};
export interface CloudTransport {
  load(): Promise<CloudDocument | null>;
  save(data: AppData, expectedRevision: number): Promise<CloudDocument>;
}
export type SyncPhase =
  | "loading"
  | "migration"
  | "pending"
  | "saving"
  | "synced"
  | "error"
  | "conflict";
export type SyncSnapshot = {
  data: AppData | null;
  phase: SyncPhase;
  pending: boolean;
  error: string;
  storageError: string;
  updatedAt: string;
};
type Cache = {
  userId: string;
  revision: number;
  data: AppData;
  dirty: boolean;
};
export const cacheKey = (userId: string) => `${STORAGE_KEY}.cloud.${userId}`;
export const LEGACY_OWNER_KEY = `${STORAGE_KEY}.migrated-user`;
const serialize = (data: AppData | null) => JSON.stringify(data);

// One instance belongs to one authenticated user. No unscoped browser data is
// uploaded automatically, and reads must finish before the first cloud write.
export class WorkspaceSync {
  private state: SyncSnapshot = {
    data: null,
    phase: "loading",
    pending: false,
    error: "",
    storageError: "",
    updatedAt: "",
  };
  private revision = 0;
  private ready = false;
  private editing = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> | null = null;
  private reading: Promise<void> | null = null;
  private conflictRemote: CloudDocument | null | undefined;
  private retryDelay = 2000;
  private cache: Cache | null = null;
  private corruptCache = false;
  constructor(
    private userId: string,
    private transport: CloudTransport,
    private storage: StorageLike | undefined,
    private onChange: (state: SyncSnapshot) => void,
    private createNew: () => AppData,
    private legacy: AppData | null = null,
  ) {
    try {
      const raw = storage?.getItem(cacheKey(userId));
      if (raw) {
        const value = JSON.parse(raw);
        if (
          value.userId !== userId ||
          !Number.isSafeInteger(value.revision) ||
          value.revision < 0 ||
          typeof value.dirty !== "boolean"
        )
          throw new Error("Invalid cache");
        this.cache = { ...value, data: decodeData(JSON.stringify(value.data)) };
        this.state.data = this.cache!.data;
      }
      const owner = storage?.getItem(LEGACY_OWNER_KEY);
      if (owner && owner !== userId) this.legacy = null;
    } catch {
      this.corruptCache = true;
      this.state.storageError =
        "Enhetens molnkopia kunde inte läsas. Originalet har bevarats; den skrivs inte över automatiskt.";
    }
  }
  snapshot() {
    return this.state;
  }
  setEditing(editing: boolean) {
    this.editing = editing;
  }
  private emit(patch: Partial<SyncSnapshot> = {}) {
    if (this.stopped) return;
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }
  private persist() {
    if (this.corruptCache) return;
    if (!this.state.data) return;
    try {
      if (!this.storage) throw new Error("Storage unavailable");
      const cache: Cache = {
        userId: this.userId,
        revision: this.revision,
        data: this.state.data,
        dirty: this.state.pending,
      };
      this.storage.setItem(cacheKey(this.userId), JSON.stringify(cache));
      this.cache = cache;
      this.state = { ...this.state, storageError: "" };
    } catch {
      this.state = {
        ...this.state,
        storageError:
          "Enhetens säkerhetskopia kunde inte sparas. Exportera väntande ändringar innan du stänger sidan.",
      };
    }
  }
  async start() {
    this.emit({ phase: "loading", error: "" });
    try {
      const remote = await this.transport.load();
      if (this.stopped) return;
      this.ready = true;
      if (this.cache?.dirty) {
        this.revision = this.cache.revision;
        if (serialize(remote?.data ?? null) === serialize(this.cache.data)) {
          this.adopt(remote!);
          return;
        }
        if ((remote?.revision ?? 0) !== this.cache.revision) {
          this.conflictRemote = remote;
          this.emit({
            data: this.cache.data,
            pending: true,
            phase: "conflict",
            error: "Molnplanen och enhetens väntande ändringar skiljer sig åt.",
          });
          return;
        }
        this.emit({
          data: this.cache.data,
          pending: true,
          phase: "pending",
          error: "",
          updatedAt: remote?.updatedAt ?? "",
        });
        this.schedule(0);
        return;
      }
      if (remote) {
        this.adopt(remote);
        return;
      }
      if (this.cache) {
        // A deleted remote document is a conflict, not permission to recreate it.
        this.revision = this.cache.revision;
        this.conflictRemote = null;
        this.emit({
          data: this.cache.data,
          pending: true,
          phase: "conflict",
          error: "Molnplanen saknas. Enhetens tidigare kopia har bevarats.",
        });
        return;
      }
      this.revision = 0;
      if (this.legacy) {
        this.emit({ data: this.legacy, phase: "migration" });
        return;
      }
      this.update(this.createNew());
    } catch (error) {
      if (this.stopped) return;
      if (this.cache) {
        this.revision = this.cache.revision;
        this.emit({
          data: this.cache.data,
          pending: this.cache.dirty,
          phase: "error",
          error: this.message(error),
        });
      } else this.emit({ phase: "error", error: this.message(error) });
    }
  }
  private adopt(remote: CloudDocument) {
    this.revision = remote.revision;
    this.conflictRemote = undefined;
    this.state = {
      ...this.state,
      data: remote.data,
      pending: false,
      phase: "synced",
      error: "",
      updatedAt: remote.updatedAt,
    };
    this.persist();
    this.emit();
  }
  chooseInitial(useLocal: boolean) {
    if (this.state.phase !== "migration") return;
    const data = useLocal && this.legacy ? this.legacy : this.createNew();
    // The legacy plan is retained; the owner marker prevents offering it to a
    // second account on the same device. The account cache remains separate.
    try {
      this.storage?.setItem(LEGACY_OWNER_KEY, this.userId);
    } catch {
      /* The cloud copy still saves independently. */
    }
    this.state = {
      ...this.state,
      data,
      pending: true,
      phase: "pending",
      error: "",
    };
    this.persist();
    this.emit();
    this.schedule(0);
  }
  update(
    value: AppData | null | ((current: AppData | null) => AppData | null),
  ) {
    if (this.stopped || this.state.phase === "migration") return;
    const next = typeof value === "function" ? value(this.state.data) : value;
    if (!next || serialize(next) === serialize(this.state.data)) return;
    this.state = {
      ...this.state,
      data: next,
      pending: true,
      phase: this.state.phase === "conflict" ? "conflict" : "pending",
      error: "",
    };
    this.persist();
    this.emit();
    if (this.ready && this.state.phase !== "conflict") this.schedule(750);
  }
  private schedule(delay: number) {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => void this.flush(), delay);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (
      this.stopped ||
      this.state.phase === "migration" ||
      this.state.phase === "conflict"
    )
      return;
    if (!this.ready) {
      await this.start();
      return;
    }
    if (this.saving) return this.saving;
    if (!this.state.pending || !this.state.data) return;
    const data = this.state.data,
      payload = serialize(data),
      expected = this.revision;
    this.emit({ phase: "saving", error: "" });
    this.saving = (async () => {
      try {
        const remote = await this.transport.save(data, expected);
        if (this.stopped) return;
        this.revision = remote.revision;
        this.retryDelay = 2000;
        const pending = serialize(this.state.data) !== payload;
        this.state = {
          ...this.state,
          pending,
          phase: pending ? "pending" : "synced",
          error: "",
          updatedAt: remote.updatedAt,
        };
        this.persist();
        this.emit();
        if (pending) this.schedule(0);
      } catch (error) {
        if (this.stopped) return;
        if (error instanceof Error && error.name === "CloudConflict") {
          try {
            this.conflictRemote = await this.transport.load();
          } catch {
            this.conflictRemote = undefined;
          }
          this.emit({
            phase: "conflict",
            error:
              "En annan enhet har sparat en ny version. Välj vilken version som ska användas.",
          });
        } else {
          this.emit({ phase: "error", error: this.message(error) });
          this.schedule(this.retryDelay);
          this.retryDelay = Math.min(30000, this.retryDelay * 2);
        }
      } finally {
        this.saving = null;
      }
    })();
    return this.saving;
  }
  async refresh() {
    if (
      this.stopped ||
      this.editing ||
      this.reading ||
      this.state.phase === "migration" ||
      this.state.phase === "conflict"
    )
      return;
    if (!this.ready) return this.start();
    if (this.state.pending) return this.flush();
    if (this.saving) return this.saving;
    const revision = this.revision;
    this.reading = (async () => {
      try {
        const remote = await this.transport.load();
        if (this.stopped || this.editing || this.revision !== revision) return;
        if (this.state.pending) {
          if (
            (remote?.revision ?? 0) !== this.revision &&
            serialize(remote?.data ?? null) !== serialize(this.state.data)
          ) {
            clearTimeout(this.timer);
            this.conflictRemote = remote;
            this.emit({
              phase: "conflict",
              error:
                "Molnplanen ändrades medan du redigerade på den här enheten.",
            });
          }
          return;
        }
        if (remote) {
          this.adopt(remote);
          return;
        }
        this.conflictRemote = null;
        this.emit({
          phase: "conflict",
          error: "Molnplanen har tagits bort. Enhetens kopia har bevarats.",
        });
      } catch (error) {
        this.emit({ phase: "error", error: this.message(error) });
      } finally {
        this.reading = null;
      }
    })();
    return this.reading;
  }
  async resolveConflict(choice: "cloud" | "device") {
    if (this.stopped || this.state.phase !== "conflict") return;
    try {
      if (this.conflictRemote === undefined)
        this.conflictRemote = await this.transport.load();
      if (this.stopped) return;
      const remote = this.conflictRemote;
      if (choice === "cloud" && remote) {
        this.adopt(remote);
        return;
      }
      this.revision = remote?.revision ?? 0;
      const data = choice === "cloud" ? this.createNew() : this.state.data;
      this.conflictRemote = undefined;
      this.state = {
        ...this.state,
        data,
        pending: true,
        phase: "pending",
        error: "",
      };
      this.persist();
      this.emit();
      await this.flush();
    } catch (error) {
      this.emit({ error: this.message(error) });
    }
  }
  private message(error: unknown) {
    return error instanceof Error
      ? error.message
      : "Molnlagringen kunde inte nås. Ändringarna har inte bekräftats av servern.";
  }
  dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
