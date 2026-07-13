/**
 * Inventory turnover — how many times a year stock is sold through, and its
 * reciprocal, days inventory outstanding (DIO). Unit-based (not value-based),
 * so it works without `unitCost`/`unitPrice` data.
 *
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and
 *   Production Management in Supply Chains, 4th ed.
 */
import {
  type DemandRecord,
  type Explained,
  type Granularity,
  type StockRecord,
  explain,
} from '@logistics-ts/core'
import { aggregateItems } from './aggregate'
import { round } from './round'

const PERIODS_PER_YEAR: Record<Granularity, number> = { day: 365, week: 52, month: 12 }
/** Days in a year, for `daysInventoryOutstanding` — a calendar-days figure, independent of `periodsPerYear`/`granularity`. */
const DAYS_PER_YEAR = 365

export interface TurnoverOptions {
  /** Demand bucketing granularity. Default `'day'`. */
  granularity?: Granularity
  /** Periods per year, for annualising `meanDemandPerPeriod`. Defaults from `granularity` (365/52/12). */
  periodsPerYear?: number
}

export interface TurnoverRow {
  itemId: string
  /** Annualised demand ÷ stock on hand. `Infinity` when there is demand but no stock (not `NaN`). */
  turnoverRatio: number
  /** `365 / turnoverRatio` — genuine calendar days, regardless of `granularity`. `Infinity` when `turnoverRatio` is 0 (no demand). */
  daysInventoryOutstanding: number
}

/**
 * Computes per-item turnover from raw stock and demand records.
 *
 * @example
 * ```ts
 * turnover(stock, demand).value // [{ itemId: 'A', turnoverRatio: 36.5, daysInventoryOutstanding: 10 }, ...]
 * ```
 */
export function turnover(
  stock: readonly StockRecord[],
  demand: readonly DemandRecord[],
  options: TurnoverOptions = {},
): Explained<TurnoverRow[]> {
  const { granularity = 'day' } = options
  const periodsPerYear = options.periodsPerYear ?? PERIODS_PER_YEAR[granularity]
  const aggregates = aggregateItems(stock, demand, [], { granularity })
  const warnings: string[] = []

  const rows: TurnoverRow[] = aggregates.map((agg) => {
    const annualizedDemand = agg.meanDemandPerPeriod * periodsPerYear
    let turnoverRatio: number
    if (agg.stockOnHand === 0) {
      turnoverRatio = annualizedDemand === 0 ? 0 : Number.POSITIVE_INFINITY
      if (annualizedDemand > 0) {
        warnings.push(`item "${agg.itemId}" has demand but no stock on hand; turnover is unbounded`)
      }
    } else {
      turnoverRatio = annualizedDemand / agg.stockOnHand
    }
    const daysInventoryOutstanding =
      turnoverRatio === 0 ? Number.POSITIVE_INFINITY : DAYS_PER_YEAR / turnoverRatio

    return {
      itemId: agg.itemId,
      turnoverRatio: Number.isFinite(turnoverRatio) ? round(turnoverRatio) : turnoverRatio,
      daysInventoryOutstanding: Number.isFinite(daysInventoryOutstanding)
        ? round(daysInventoryOutstanding)
        : daysInventoryOutstanding,
    }
  })

  return explain(rows, {
    method: 'turnover-unit-based',
    inputs: { items: rows.length, granularity, periodsPerYear },
    reasoning: [
      'turnoverRatio = (meanDemandPerPeriod · periodsPerYear) / stockOnHand',
      'daysInventoryOutstanding = 365 / turnoverRatio (calendar days, independent of granularity)',
    ],
    citations: ['Silver, Pyke & Thomas (2017), Inventory and Production Management'],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}
