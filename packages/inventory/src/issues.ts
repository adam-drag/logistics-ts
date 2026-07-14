/**
 * Issue analyser — the composite health check every other inventory function
 * feeds into. Per item, flags whether stock has fallen below its reorder
 * point or safety stock, is at risk of stocking out within the replenishment
 * lead time, is overstocked, or is dead stock (no demand at all, with stock
 * on hand).
 *
 * Composes {@link safetyStock}, {@link reorderPoint}, {@link coverage}, and
 * `@logistics-ts/classification`'s `fsn` rather than re-deriving their maths.
 *
 * @see King, P.L. (2011). Crack the Code: Understanding Safety Stock and
 *   Mastering Its Equations. APICS Magazine, July/August 2011.
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and
 *   Production Management in Supply Chains, 4th ed.
 */
import { fsn } from '@logistics-ts/classification'
import {
  type DemandRecord,
  type Explained,
  type Granularity,
  type LeadTimeRecord,
  type StockRecord,
  explain,
} from '@logistics-ts/core'
import { autoForecast } from '@logistics-ts/forecasting'
import { DAYS_PER_PERIOD, aggregateItems } from './aggregate'
import { coverage } from './coverage'
import { reorderPoint } from './reorder-point'
import { round } from './round'
import { type SafetyStockMethod, safetyStock } from './safety-stock'

/** A condition flagged for an item by {@link issues}. */
export type IssueFlag =
  | 'below-rop'
  | 'below-safety-stock'
  | 'stockout-risk-within-leadtime'
  | 'overstocked'
  | 'dead-stock'

export interface Issue {
  itemId: string
  flags: IssueFlag[]
  /** Every number used to decide the flags, for inspection. */
  details: Record<string, number>
}

export interface IssuesOptions {
  /** Target cycle service level for the safety-stock/ROP checks, e.g. `0.95`. */
  serviceLevel: number
  /** Safety-stock method to use per item. Default `'auto'`. */
  safetyStockMethod?: SafetyStockMethod
  /** Coverage-days threshold above which an item is flagged `overstocked`. Default 90. */
  overstockedCoverageDaysThreshold?: number
  /** Demand bucketing granularity. Default `'day'`. */
  granularity?: Granularity
}

/**
 * Flags inventory issues per item from raw stock, demand, and lead-time
 * records.
 *
 * Flags:
 * - `below-rop`: stock on hand is below the item's reorder point.
 * - `below-safety-stock`: stock on hand is below the item's safety stock.
 * - `stockout-risk-within-leadtime`: stock on hand is below expected demand
 *   over the lead time — more urgent than `below-rop` since it has no buffer
 *   at all. Uses an `autoForecast` projection over the lead-time horizon when
 *   there's enough history to forecast, else the flat historical mean.
 * - `overstocked`: coverage (days of inventory) exceeds
 *   `overstockedCoverageDaysThreshold`.
 * - `dead-stock`: the item's FSN class is `N` (no demand at all) and it has
 *   stock on hand.
 *
 * Items with no lead-time records get no `below-rop`/`below-safety-stock`/
 * `stockout-risk-within-leadtime` flags (there is nothing to compute them
 * from) and a warning explains the gap; `overstocked`/`dead-stock` are still
 * evaluated since they don't need lead-time data.
 *
 * @example
 * ```ts
 * issues(stock, demand, leadTimes, { serviceLevel: 0.95 }).value
 * // [{ itemId: 'A', flags: ['below-rop'], details: { stockOnHand: 40, reorderPoint: 62, ... } }, ...]
 * ```
 */
export function issues(
  stock: readonly StockRecord[],
  demand: readonly DemandRecord[],
  leadTimes: readonly LeadTimeRecord[],
  options: IssuesOptions,
): Explained<Issue[]> {
  const {
    serviceLevel,
    safetyStockMethod = 'auto',
    overstockedCoverageDaysThreshold = 90,
    granularity = 'day',
  } = options
  // Validated up front: safetyStock() (which normally validates this) is only
  // called per-item when that item has lead-time records, so a dataset with
  // no lead-time records at all would otherwise let an invalid serviceLevel
  // through silently.
  if (!(serviceLevel > 0 && serviceLevel < 1)) {
    throw new Error(`issues: serviceLevel must be in (0, 1) (got ${serviceLevel})`)
  }

  const aggregates = aggregateItems(stock, demand, leadTimes, { granularity })
  const coverageByItem = new Map(
    coverage(stock, demand, { granularity }).value.map((r) => [r.itemId, r]),
  )
  const fsnByItem = new Map(fsn(aggregates.map((a) => a.series)).value.map((r) => [r.itemId, r]))

  const citations = new Set<string>([
    'Silver, Pyke & Thomas (2017), Inventory and Production Management',
  ])
  const warnings: string[] = []
  const reasoning: string[] = []

  const result: Issue[] = aggregates.map((agg) => {
    const flags: IssueFlag[] = []
    const details: Record<string, number> = {
      stockOnHand: agg.stockOnHand,
      meanDemandPerPeriod: round(agg.meanDemandPerPeriod),
    }

    if (Number.isFinite(agg.meanLeadTimeDays)) {
      // Lead time is always recorded in days, but meanDemandPerPeriod is in
      // whatever granularity demand was bucketed at — convert lead time into
      // that same period unit before combining the two (e.g. D̄·L̄ for ROP).
      const periodLengthDays = DAYS_PER_PERIOD[granularity]
      const meanLeadTime = agg.meanLeadTimeDays / periodLengthDays
      const leadTimeStdDev = Number.isFinite(agg.leadTimeStdDevDays)
        ? agg.leadTimeStdDevDays / periodLengthDays
        : undefined
      const quantities = agg.series.buckets.map((b) => b.quantity)

      const ss = safetyStock(
        {
          meanDemand: agg.meanDemandPerPeriod,
          meanLeadTime,
          demandStdDev: agg.demandStdDevPerPeriod,
          series: quantities,
          ...(leadTimeStdDev !== undefined ? { leadTimeStdDev } : {}),
        },
        { method: safetyStockMethod, serviceLevel },
      )
      for (const c of ss.citations ?? []) citations.add(c)

      const rop = reorderPoint({
        meanDemand: agg.meanDemandPerPeriod,
        meanLeadTime,
        safetyStock: ss.value,
      })
      for (const c of rop.citations ?? []) citations.add(c)

      details.safetyStock = round(ss.value)
      details.reorderPoint = round(rop.value)

      if (agg.stockOnHand < rop.value) flags.push('below-rop')
      if (agg.stockOnHand < ss.value) flags.push('below-safety-stock')

      let leadTimeDemand = agg.meanDemandPerPeriod * meanLeadTime
      if (quantities.length >= 2) {
        const horizon = Math.max(1, Math.round(meanLeadTime))
        try {
          const forecast = autoForecast(quantities, { horizon }).value.forecast
          leadTimeDemand = forecast.reduce((sum, v) => sum + v, 0)
        } catch {
          warnings.push(
            `item "${agg.itemId}": lead-time demand forecast failed; used the flat historical mean instead`,
          )
        }
      }
      details.leadTimeDemand = round(leadTimeDemand)
      if (agg.stockOnHand < leadTimeDemand) flags.push('stockout-risk-within-leadtime')
    } else {
      warnings.push(
        `item "${agg.itemId}" has no lead-time records; below-rop/below-safety-stock/stockout-risk-within-leadtime flags skipped`,
      )
    }

    const coverageRow = coverageByItem.get(agg.itemId)
    if (coverageRow !== undefined) {
      details.daysOfInventory = coverageRow.daysOfInventory
      if (coverageRow.daysOfInventory > overstockedCoverageDaysThreshold) flags.push('overstocked')
    }

    const fsnRow = fsnByItem.get(agg.itemId)
    if (fsnRow?.class === 'N' && agg.stockOnHand > 0) flags.push('dead-stock')

    if (flags.length > 0) reasoning.push(`item "${agg.itemId}": ${flags.join(', ')}`)

    return { itemId: agg.itemId, flags, details }
  })

  return explain(result, {
    method: 'issue-analysis',
    inputs: { items: result.length, serviceLevel, overstockedCoverageDaysThreshold },
    reasoning: reasoning.length > 0 ? reasoning : ['no items flagged'],
    citations: [...citations],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}
