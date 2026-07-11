/**
 * ABC classification — a Pareto split of items by their contribution to total
 * consumption value (or volume). A-items are the vital few that dominate the
 * total and warrant the tightest inventory control; C-items are the trivial
 * many.
 *
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and Production
 *   Management in Supply Chains, 4th ed.
 */
import { type Explained, explain } from '@logistics-ts/core'

/** An item to be ranked, with its annual volume and (optionally) unit value. */
export interface AbcItem {
  itemId: string
  /** Annual consumption volume (units). */
  volume: number
  /** Unit value/cost. Required when classifying `by: 'value'`. */
  unitValue?: number
}

export interface AbcOptions {
  /** Rank by consumption value (`volume × unitValue`) or by raw volume. Default `'value'`. */
  by?: 'value' | 'volume'
  /**
   * Cumulative-share cutoffs `[aMax, bMax]` separating A|B and B|C. Defaults to
   * the conventional `[0.8, 0.95]`. Cutoffs are convention, not theory.
   */
  cutoffs?: [number, number]
}

export interface AbcClassification {
  itemId: string
  class: 'A' | 'B' | 'C'
  /** The ranked metric for this item (value or volume). */
  metric: number
  /** This item's share of the total metric. */
  share: number
  /** Cumulative share up to and including this item, in ranked order. */
  cumulativeShare: number
}

/**
 * Classifies items into A/B/C by cumulative share of the ranked metric.
 *
 * @example
 * ```ts
 * abc([
 *   { itemId: 'A', volume: 100, unitValue: 50 },
 *   { itemId: 'B', volume: 500, unitValue: 1 },
 * ]).value
 * ```
 */
export function abc(
  items: readonly AbcItem[],
  options: AbcOptions = {},
): Explained<AbcClassification[]> {
  const { by = 'value', cutoffs = [0.8, 0.95] } = options
  const [aMax, bMax] = cutoffs

  const metricOf = (item: AbcItem): number => {
    if (by === 'value' && item.unitValue === undefined) {
      throw new Error(`abc by 'value' requires unitValue; item "${item.itemId}" has none`)
    }
    const metric = by === 'volume' ? item.volume : item.volume * (item.unitValue as number)
    if (!Number.isFinite(metric) || metric < 0) {
      throw new Error(`abc: item "${item.itemId}" has an invalid ${by} metric (${metric})`)
    }
    return metric
  }

  const ranked = items
    .map((item) => ({ itemId: item.itemId, metric: metricOf(item) }))
    .sort((a, b) => b.metric - a.metric)

  const total = ranked.reduce((sum, r) => sum + r.metric, 0)

  const result: AbcClassification[] = []
  let cumulative = 0
  const counts = { A: 0, B: 0, C: 0 }
  for (const { itemId, metric } of ranked) {
    // With no consumption at all, nothing is a "vital few" — everything is C.
    // Otherwise classify by the cumulative share *before* this item, so the
    // item that straddles a cutoff falls in the higher (more important) class.
    let cls: AbcClassification['class']
    if (total === 0) {
      cls = 'C'
    } else {
      const cumulativeBefore = cumulative / total
      cls = cumulativeBefore < aMax ? 'A' : cumulativeBefore < bMax ? 'B' : 'C'
    }
    cumulative += metric
    const share = total === 0 ? 0 : metric / total
    counts[cls]++
    result.push({
      itemId,
      class: cls,
      metric,
      share,
      cumulativeShare: total === 0 ? 0 : cumulative / total,
    })
  }

  const warnings = total === 0 ? ['no consumption across any item; all classified C'] : undefined

  return explain(result, {
    method: `abc-by-${by}`,
    inputs: { items: items.length, aMax, bMax, total },
    reasoning: [
      `ranked ${items.length} items by ${by === 'value' ? 'consumption value' : 'volume'}`,
      `A until cumulative share reaches ${aMax * 100}%, then B until ${bMax * 100}%, then C; the item that crosses a cutoff is promoted to the higher class`,
      `${counts.A} A-items, ${counts.B} B-items, ${counts.C} C-items`,
    ],
    citations: ['Silver, Pyke & Thomas (2017), Inventory and Production Management'],
    ...(warnings ? { warnings } : {}),
  })
}
