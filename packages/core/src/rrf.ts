/**
 * Reciprocal Rank Fusion — spec/05.
 *
 * score(id) = Σ_channels 1 / (k + rank_in_channel), k = 60.
 * No score calibration across heterogeneous channels.
 */

export const RRF_K = 60;

/**
 * Fuse channel rankings. Each channel supplies candidate ids in rank order
 * (index 0 = rank 1). Returns a map id → rrf score.
 */
export function reciprocalRankFusion(channels: Iterable<Iterable<string>>): Map<string, number> {
  const scores = new Map<string, number>();
  for (const channel of channels) {
    let rank = 0;
    for (const id of channel) {
      rank += 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));
    }
  }
  return scores;
}
