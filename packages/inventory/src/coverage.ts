/**
 * Inventory coverage — how many periods of demand current stock can sustain,
 * either from the historical mean or by walking an `autoForecast` projection
 * forward until stock depletes.
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
import { autoForecast } from '@logistics-ts/forecasting'
import { aggregateItems } from './aggregate'
import { round } from './round'

export interface CoverageOptions {
  /** Demand bucketing granularity. Default `'day'`. */
  granularity?: Granularity
  /**
   * When `true`, also compute `forecastWalkDays` by walking an `autoForecast`
   * projection forward per item instead of relying only on the historical
   * mean. Default `false` (mean-based coverage is far cheaper for large
   * catalogues).
   */
  forecastWalk?: boolean
  /** Forecast horizon (periods) to walk when `forecastWalk` is true. Default 90. */
  forecastHorizon?: number
}

export interface CoverageRow {
  itemId: string
  stockOnHand: number
  meanDemandPerPeriod: number
  /** `stockOnHand / meanDemandPerPeriod`. `0` when there is no stock or no demand (not `NaN`). */
  daysOfInventory: number
  /** Periods until cumulative forecast demand depletes stock. Present only when `forecastWalk: true` and depletion occurs within the horizon. */
  forecastWalkDays?: number
}

/**
 * Computes per-item coverage from raw stock and demand records.
 *
 * @example
 * ```ts
 * coverage(stock, demand).value // [{ itemId: 'A', stockOnHand: 40, meanDemandPerPeriod: 4, daysOfInventory: 10 }, ...]
 * ```
 */
export function coverage(
  stock: readonly StockRecord[],
  demand: readonly DemandRecord[],
  options: CoverageOptions = {},
): Explained<CoverageRow[]> {
  const { granularity = 'day', forecastWalk = false, forecastHorizon = 90 } = options
  const aggregates = aggregateItems(stock, demand, [], { granularity })
  const warnings: string[] = []

  const rows: CoverageRow[] = aggregates.map((agg) => {
    const daysOfInventory =
      agg.stockOnHand === 0 || agg.meanDemandPerPeriod === 0
        ? 0
        : agg.stockOnHand / agg.meanDemandPerPeriod

    const row: CoverageRow = {
      itemId: agg.itemId,
      stockOnHand: agg.stockOnHand,
      meanDemandPerPeriod: agg.meanDemandPerPeriod,
      daysOfInventory: round(daysOfInventory),
    }

    if (forecastWalk) {
      const quantities = agg.series.buckets.map((b) => b.quantity)
      if (quantities.length === 0 || agg.stockOnHand === 0) {
        if (quantities.length === 0) {
          warnings.push(`item "${agg.itemId}" has no demand history; forecast walk skipped`)
        }
        return row
      }
      const forecast = autoForecast(quantities, { horizon: forecastHorizon }).value.forecast
      let remaining = agg.stockOnHand
      let depletedAt: number | undefined
      for (let i = 0; i < forecast.length; i++) {
        remaining -= forecast[i] as number
        if (remaining <= 0) {
          depletedAt = i + 1
          break
        }
      }
      if (depletedAt === undefined) {
        warnings.push(
          `item "${agg.itemId}" did not deplete within the ${forecastHorizon}-period forecast horizon`,
        )
      } else {
        row.forecastWalkDays = depletedAt
      }
    }

    return row
  })

  return explain(rows, {
    method: forecastWalk ? 'coverage-forecast-walk' : 'coverage-historical-mean',
    inputs: { items: rows.length, granularity, ...(forecastWalk ? { forecastHorizon } : {}) },
    reasoning: [
      forecastWalk
        ? 'daysOfInventory from the historical mean; forecastWalkDays from walking an autoForecast projection forward until stock depletes'
        : 'daysOfInventory = stockOnHand / meanDemandPerPeriod',
    ],
    citations: ['Silver, Pyke & Thomas (2017), Inventory and Production Management'],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}
