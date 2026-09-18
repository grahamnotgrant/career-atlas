/** UI-only delivery state. Persist opaque IDs, never application content. */
export interface ArrivalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
interface ArrivalRecord {
  id: string;
  status: string;
}
interface Persisted {
  version: 1;
  known: string[];
  pending: string[];
}
export const ARRIVAL_DURATION = 3600;
export class ArrivalQueue {
  private known = new Set<string>();
  private initialized = false;
  private pending: string[] = [];
  private active: string[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private eligible = new Set<string>();
  private key: string;
  constructor(
    workspaceId: string,
    private storage: ArrivalStorage | undefined,
    private changed: () => void,
  ) {
    this.key = `career-atlas.arrivals.v1.${workspaceId}`;
    try {
      const raw = storage?.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        if (
          parsed.version === 1 &&
          [parsed.known, parsed.pending].every(
            (a) => Array.isArray(a) && a.every((id) => typeof id === "string"),
          )
        ) {
          this.known = new Set(parsed.known);
          this.pending = [...new Set(parsed.pending)];
          this.initialized = true;
        }
      }
    } catch {
      /* Storage may be blocked or damaged; keep this session usable. */
    }
  }
  get state() {
    return {
      pendingArrivalIds: [...this.pending],
      newIds: [...this.active],
    };
  }
  private save() {
    try {
      this.storage?.setItem(
        this.key,
        JSON.stringify({
          version: 1,
          known: [...this.known],
          pending: this.pending,
        } satisfies Persisted),
      );
    } catch {
      /* In-memory queue remains authoritative for this session. */
    }
  }
  observe(records: ArrivalRecord[]) {
    this.eligible = new Set(
      records.filter((a) => a.status === "pending").map((a) => a.id),
    );
    if (this.initialized) {
      for (const record of records)
        if (!this.known.has(record.id) && this.eligible.has(record.id))
          this.pending.push(record.id);
    }
    this.initialized = true;
    for (const record of records) this.known.add(record.id);
    this.pending = [...new Set(this.pending)].filter((id) =>
      this.eligible.has(id),
    );
    if (this.active.some((id) => !this.eligible.has(id))) this.pause(false);
    this.save();
    this.changed();
  }
  play(eligibleIds: string[]) {
    if (this.active.length) return;
    const visible = new Set(eligibleIds);
    this.active = this.pending
      .filter((id) => visible.has(id) && this.eligible.has(id))
      .slice(0, 3);
    if (!this.active.length) return;
    this.timer = setTimeout(() => {
      const delivered = new Set(this.active);
      this.pending = this.pending.filter((id) => !delivered.has(id));
      this.active = [];
      this.timer = undefined;
      this.save();
      this.changed();
    }, ARRIVAL_DURATION);
    this.changed();
  }
  pause(notify = true) {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.active.length) return;
    this.active = [];
    if (notify) this.changed();
  }
}
