import type { AppData } from "./types";

/** Session-only snapshots. External changes establish a new boundary, never an undo target. */
export class UndoHistory {
  private current = "null";
  private entries: { before: string; label: string }[] = [];
  private bytes = 0;
  constructor(
    private limit = 20,
    private budget = 8 * 1024 * 1024,
  ) {}
  get label() {
    return this.entries.at(-1)?.label ?? "";
  }
  reset(data: AppData | null) {
    this.entries = [];
    this.bytes = 0;
    this.current = JSON.stringify(data);
  }
  observe(data: AppData | null) {
    if (JSON.stringify(data) !== this.current) this.reset(data);
  }
  record(
    before: AppData | null,
    after: AppData | null,
    label: string | false = "senaste ändringen",
  ) {
    this.observe(before);
    const next = JSON.stringify(after);
    if (next === this.current) return;
    if (!before || !after || label === false) {
      this.reset(after);
      return;
    }
    const previous = this.current;
    this.current = next;
    if (previous.length * 2 > this.budget) {
      this.entries = [];
      this.bytes = 0;
      return;
    }
    this.entries.push({ before: previous, label });
    this.bytes += previous.length * 2;
    while (this.entries.length > this.limit || this.bytes > this.budget)
      this.bytes -= this.entries.shift()!.before.length * 2;
  }
  undo(data: AppData | null): AppData | null {
    this.observe(data);
    const entry = this.entries.pop();
    if (!entry) return null;
    this.bytes -= entry.before.length * 2;
    this.current = entry.before;
    return JSON.parse(entry.before) as AppData;
  }
}
