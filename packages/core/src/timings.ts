/**
 * Stage timing collector. Stage names come from the v1 vocabulary in
 * `codes.ts` (spec/14); repeated names are not allowed within one operation.
 */
export class StageTimings {
  private readonly timings = new Map<string, number>();
  private readonly order: string[] = [];

  /** Time `fn` under `stage`. Stage may only be recorded once. */
  async time<T>(stage: string, fn: () => Promise<T> | T): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.record(stage, performance.now() - start);
    }
  }

  record(stage: string, milliseconds: number): void {
    if (this.timings.has(stage)) {
      throw new Error(`stage already recorded: ${stage}`);
    }
    this.timings.set(stage, milliseconds);
    this.order.push(stage);
  }

  toArray(): { stage: string; milliseconds: number }[] {
    return this.order.map((stage) => ({ stage, milliseconds: this.timings.get(stage) ?? 0 }));
  }
}
