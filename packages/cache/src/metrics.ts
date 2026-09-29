/**
 * Minimal cache metrics sink (spec/16 metrics list). The observability package
 * or a host may bridge these to real metrics; labels must never include raw
 * cache keys or input hashes.
 */
export type CacheMetricEvent =
  | { type: "hit" | "miss" | "error"; kind: string }
  | { type: "latency"; operation: "get" | "set" | "delete" | "lease"; milliseconds: number }
  | { type: "value_size"; kind: string; bytes: number }
  | { type: "lease"; outcome: "acquired" | "contention" | "timeout" }
  | { type: "bypass"; reason: "oversize" | "diagnostics" }
  | { type: "compute"; kind: string; milliseconds: number }
  | { type: "embedding_avoided" };

export interface CacheMetrics {
  record(event: CacheMetricEvent): void;
}

export class NoopCacheMetrics implements CacheMetrics {
  record(): void {}
}

/** In-memory sink for tests. */
export class CollectingCacheMetrics implements CacheMetrics {
  readonly events: CacheMetricEvent[] = [];
  record(event: CacheMetricEvent): void {
    this.events.push(event);
  }
}
