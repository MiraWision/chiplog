import type { StageRecord } from "./types";

/**
 * Bounded stage accumulator: keeps the first N and the last M stages and counts
 * what fell out in between.
 *
 * A retry loop calling `stage()` a hundred thousand times is the failure mode
 * this pattern has to survive — most log backends drop a line past a size limit,
 * which would lose the entire flow rather than one noisy step. Bounding here,
 * while accumulating, also keeps memory flat.
 */
export class StageBuffer {
  private readonly head: StageRecord[] = [];
  private readonly tail: (StageRecord | undefined)[];
  private tailNext = 0;
  private tailFilled = 0;
  private droppedCount = 0;
  private total = 0;
  private lastStageName: string | undefined;

  constructor(
    private readonly keepFirst: number,
    private readonly keepLast: number,
  ) {
    this.tail = new Array<StageRecord | undefined>(Math.max(0, keepLast));
  }

  push(record: StageRecord): void {
    this.total += 1;
    this.lastStageName = record.name;

    if (this.head.length < this.keepFirst) {
      this.head.push(record);
      return;
    }
    if (this.keepLast === 0) {
      this.droppedCount += 1;
      return;
    }
    if (this.tailFilled === this.keepLast) {
      this.droppedCount += 1;
    } else {
      this.tailFilled += 1;
    }
    this.tail[this.tailNext] = record;
    this.tailNext = (this.tailNext + 1) % this.keepLast;
  }

  /** Total stages recorded, including the ones dropped by the cap. */
  get count(): number {
    return this.total;
  }

  get dropped(): number {
    return this.droppedCount;
  }

  /** Name of the most recent stage — used to attribute an uncaught failure. */
  get last(): string | undefined {
    return this.lastStageName;
  }

  toArray(): StageRecord[] {
    if (this.tailFilled === 0) return [...this.head];
    const ordered: StageRecord[] = [...this.head];
    const start = (this.tailNext - this.tailFilled + this.keepLast) % this.keepLast;
    for (let i = 0; i < this.tailFilled; i += 1) {
      ordered.push(this.tail[(start + i) % this.keepLast]!);
    }
    return ordered;
  }
}
