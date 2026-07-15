/**
 * Internal per-item aggregation shared by {@link coverage}, {@link turnover},
 * and {@link issues}: joins stock, demand, and lead-time records into one row
 * of summary statistics per item, so those functions don't each re-derive the
 * same bucketize + mean/stddev logic. Not re-exported from the package index —
 * callers use the public bulk-analysis functions instead.
 */
import {
  bucketize,
  type DemandRecord,
  type DemandSeries,
  type Granularity,
  type LeadTimeRecord,
  mean,
  type StockRecord,
  standardDeviation,
} from '@logistics-ts/core'

export interface ItemAggregate {
  itemId: string
  /** Dense, zero-filled demand series for the item (empty buckets if it never sold). */
  series: DemandSeries
  /** Mean demand per period. 0 for an item with no demand history (not NaN). */
  meanDemandPerPeriod: number
  /** Sample standard deviation of demand per period. 0 with fewer than two periods. */
  demandStdDevPerPeriod: number
  /** Sum of on-hand quantity across all locations. */
  stockOnHand: number
  /** Mean observed lead time in days. `NaN` if the item has no lead-time records. */
  meanLeadTimeDays: number
  /** Sample standard deviation of lead time in days. `NaN` with fewer than two observations. */
  leadTimeStdDevDays: number
}

export interface AggregateOptions {
  /** Demand bucketing granularity. Default `'day'`. */
  granularity?: Granularity
}

/**
 * Approximate length of one demand-bucketing period, in days. `LeadTimeRecord`
 * is always recorded in days, but `meanDemandPerPeriod` is in whatever
 * granularity the caller bucketed demand at — callers that combine the two
 * (e.g. `meanDemand · meanLeadTime` for a reorder point) must convert lead
 * time into the same period unit first via this table. `month` uses the
 * 365-day-year average (365/12), consistent with `turnover.ts`'s annualisation.
 */
export const DAYS_PER_PERIOD: Record<Granularity, number> = { day: 1, week: 7, month: 365 / 12 }

/**
 * Joins stock, demand, and lead-time records into one {@link ItemAggregate} per
 * item, over the union of item IDs seen across all three inputs — an item with
 * stock but no demand history still gets a row (empty series, zero demand
 * stats), which is what lets {@link issues}'s dead-stock check see it.
 */
export function aggregateItems(
  stock: readonly StockRecord[],
  demand: readonly DemandRecord[],
  leadTimes: readonly LeadTimeRecord[] = [],
  options: AggregateOptions = {},
): ItemAggregate[] {
  const granularity = options.granularity ?? 'day'

  const itemIds = new Set<string>()
  for (const r of stock) itemIds.add(r.itemId)
  for (const r of demand) itemIds.add(r.itemId)
  for (const r of leadTimes) itemIds.add(r.itemId)

  const seriesByItem = new Map(bucketize(demand, granularity).map((s) => [s.itemId, s]))

  const stockByItem = new Map<string, number>()
  for (const r of stock) stockByItem.set(r.itemId, (stockByItem.get(r.itemId) ?? 0) + r.quantity)

  const leadTimesByItem = new Map<string, number[]>()
  for (const r of leadTimes) {
    const list = leadTimesByItem.get(r.itemId)
    if (list) list.push(r.leadTimeDays)
    else leadTimesByItem.set(r.itemId, [r.leadTimeDays])
  }

  return [...itemIds].sort().map((itemId) => {
    const series = seriesByItem.get(itemId) ?? { itemId, granularity, buckets: [] }
    const quantities = series.buckets.map((b) => b.quantity)
    const leadTimeValues = leadTimesByItem.get(itemId) ?? []

    return {
      itemId,
      series,
      meanDemandPerPeriod: quantities.length === 0 ? 0 : mean(quantities),
      demandStdDevPerPeriod: quantities.length < 2 ? 0 : standardDeviation(quantities),
      stockOnHand: stockByItem.get(itemId) ?? 0,
      meanLeadTimeDays: mean(leadTimeValues),
      leadTimeStdDevDays: standardDeviation(leadTimeValues),
    }
  })
}
