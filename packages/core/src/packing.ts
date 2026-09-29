/**
 * Deterministic packing — spec/05.
 *
 * Token counting in v1 uses the configured deterministic approximation
 * (4 chars/token); callers emitting `TOKEN_COUNT_APPROXIMATE` when no exact
 * tokenizer produced the counts.
 */

/** v1 deterministic approximation: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil([...text].length / 4);
}

export type PackingBudget = {
  maxChunks: number;
  maxTokens: number;
  maxChunksPerItem: number;
};

export type PackableItem<T> = {
  item: T;
  /** Owning knowledge-item id for the per-item diversity cap. */
  itemId: string;
  tokenCount: number;
};

export type PackingResult<T> = {
  packed: PackableItem<T>[];
  skippedForBudget: PackableItem<T>[];
  skippedForItemCap: PackableItem<T>[];
  totalTokens: number;
};

/**
 * Pack candidates in the given order. Oversized candidates are skipped, not
 * fatal — packing continues to fill the budget (spec/05).
 */
export function pack<T>(candidates: PackableItem<T>[], budget: PackingBudget): PackingResult<T> {
  const packed: PackableItem<T>[] = [];
  const skippedForBudget: PackableItem<T>[] = [];
  const skippedForItemCap: PackableItem<T>[] = [];
  const perItem = new Map<string, number>();
  let tokens = 0;
  for (const c of candidates) {
    if (packed.length >= budget.maxChunks) {
      skippedForBudget.push(c);
      continue;
    }
    const seen = perItem.get(c.itemId) ?? 0;
    if (seen >= budget.maxChunksPerItem) {
      skippedForItemCap.push(c);
      continue;
    }
    if (tokens + c.tokenCount > budget.maxTokens) {
      skippedForBudget.push(c);
      continue;
    }
    packed.push(c);
    perItem.set(c.itemId, seen + 1);
    tokens += c.tokenCount;
  }
  return { packed, skippedForBudget, skippedForItemCap, totalTokens: tokens };
}
