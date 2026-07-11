/**
 * FSN classification — Fast-, Slow-, and Non-moving items by how frequently they
 * see demand. It surfaces dead stock (N) and high-turnover items (F) that need
 * different replenishment and review policies.
 *
 * This implementation measures **movement frequency** (the fraction of periods
 * with demand) from a demand series alone. Turnover-based FSN (demand ÷ average
 * stock) is an alternative that requires stock data and is a future addition.
 */
import { type DemandSeries, type Explained, explain } from '@logistics-ts/core'

export interface FsnOptions {
  /**
   * Movement-frequency boundary between Slow and Fast (fraction of periods with
   * demand). Default 0.5. Items with no demand at all are Non-moving.
   */
  fastCutoff?: number
}

export interface FsnClassification {
  itemId: string
  class: 'F' | 'S' | 'N'
  /** Fraction of periods with demand (0 = never moved, 1 = every period). */
  movementRatio: number
}

/**
 * Classifies bucketed demand series into Fast / Slow / Non-moving.
 * Feed the dense, zero-filled output of {@link bucketize}.
 */
export function fsn(
  series: readonly DemandSeries[],
  options: FsnOptions = {},
): Explained<FsnClassification[]> {
  const { fastCutoff = 0.5 } = options
  const counts = { F: 0, S: 0, N: 0 }

  const result: FsnClassification[] = series.map((s) => {
    const periods = s.buckets.length
    const moved = s.buckets.filter((b) => b.quantity > 0).length
    const movementRatio = periods === 0 ? 0 : moved / periods

    const cls: FsnClassification['class'] =
      moved === 0 ? 'N' : movementRatio >= fastCutoff ? 'F' : 'S'
    counts[cls]++
    return { itemId: s.itemId, class: cls, movementRatio }
  })

  return explain(result, {
    method: 'fsn-movement-frequency',
    inputs: { items: series.length, fastCutoff },
    reasoning: [
      `N = no demand, F ≥ ${fastCutoff} of periods with demand, S = the rest`,
      `${counts.F} fast, ${counts.S} slow, ${counts.N} non-moving`,
    ],
  })
}
