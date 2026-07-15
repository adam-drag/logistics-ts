/**
 * A thin, stateful convenience wrapper over the pure `@logistics-ts/inventory`
 * (and supporting `@logistics-ts/classification`) functions, for callers who'd
 * rather hold a dataset once than pass `stock`/`demand`/`leadTimes` to every
 * call. Holds no source of truth — every method delegates to and returns the
 * underlying pure function's own `Explained<T>` result unchanged. The pure
 * functions themselves live in `@logistics-ts/inventory`; prefer them directly
 * when you want the smallest install and best tree-shaking.
 */
import {
  type AbcOptions,
  abc,
  abcXyzMatrix,
  type XyzOptions,
  xyz,
} from '@logistics-ts/classification'
import {
  bucketize,
  type DemandRecord,
  type Granularity,
  type LeadTimeRecord,
  mean,
  type StockRecord,
  standardDeviation,
} from '@logistics-ts/core'
import {
  type CoverageOptions,
  coverage as coverageFn,
  type IssuesOptions,
  issues as issuesFn,
  type SafetyStockOptions,
  safetyStock as safetyStockFn,
  type TurnoverOptions,
  turnover as turnoverFn,
} from '@logistics-ts/inventory'

/** The dataset an {@link InventoryAnalyzer} holds and passes to every method. */
export interface InventoryAnalyzerInput {
  demand: readonly DemandRecord[]
  stock: readonly StockRecord[]
  leadTimes?: readonly LeadTimeRecord[]
}

/** Options for {@link InventoryAnalyzer.abcXyz}. */
export interface AbcXyzOptions {
  /** Demand bucketing granularity for the XYZ variability axis. Default `'day'`. */
  granularity?: Granularity
  abc?: AbcOptions
  xyz?: XyzOptions
}

/**
 * Approximate length of one demand-bucketing period, in days — `LeadTimeRecord`
 * is always recorded in days, but demand may be bucketed at a coarser
 * granularity, so lead time must be converted into the same period unit
 * before combining the two (e.g. `meanDemand · meanLeadTime` for safety
 * stock). Mirrors `@logistics-ts/inventory`'s internal `DAYS_PER_PERIOD`.
 */
const DAYS_PER_PERIOD: Record<Granularity, number> = { day: 1, week: 7, month: 365 / 12 }

/**
 * @example
 * ```ts
 * const analyzer = new InventoryAnalyzer({ demand, stock, leadTimes })
 * analyzer.issues({ serviceLevel: 0.95 }).value
 * ```
 */
export class InventoryAnalyzer {
  constructor(private readonly input: InventoryAnalyzerInput) {}

  /** ABC-by-value/volume × XYZ-by-variability policy matrix over the held dataset. */
  abcXyz(options: AbcXyzOptions = {}) {
    const granularity = options.granularity ?? 'day'
    const series = bucketize(this.input.demand, granularity)

    const volumeByItem = new Map<string, number>()
    const unitValueByItem = new Map<string, number>()
    for (const record of this.input.demand) {
      volumeByItem.set(record.itemId, (volumeByItem.get(record.itemId) ?? 0) + record.quantity)
      if (record.unitPrice !== undefined) unitValueByItem.set(record.itemId, record.unitPrice)
    }
    const items = [...volumeByItem.entries()].map(([itemId, volume]) => {
      const unitValue = unitValueByItem.get(itemId)
      return unitValue !== undefined ? { itemId, volume, unitValue } : { itemId, volume }
    })

    const abcResult = abc(items, options.abc)
    const xyzResult = xyz(series, options.xyz)
    return abcXyzMatrix(abcResult.value, xyzResult.value)
  }

  /** Safety stock for one item, aggregating its demand and lead-time history from the held dataset. */
  safetyStock(
    itemId: string,
    options: SafetyStockOptions,
    aggregateOptions: { granularity?: Granularity } = {},
  ) {
    const granularity = aggregateOptions.granularity ?? 'day'
    const series = bucketize(
      this.input.demand.filter((r) => r.itemId === itemId),
      granularity,
    )[0]
    const quantities = series?.buckets.map((b) => b.quantity) ?? []
    const leadTimeValues = (this.input.leadTimes ?? [])
      .filter((r) => r.itemId === itemId)
      .map((r) => r.leadTimeDays)
    if (leadTimeValues.length === 0) {
      throw new Error(
        `InventoryAnalyzer.safetyStock: item "${itemId}" has no lead-time records in the held dataset`,
      )
    }
    // Lead time is always recorded in days; convert into the same period unit
    // as meanDemand (the chosen granularity) before combining the two.
    const periodLengthDays = DAYS_PER_PERIOD[granularity]
    const leadTimeStdDev = standardDeviation(leadTimeValues) / periodLengthDays

    return safetyStockFn(
      {
        meanDemand: quantities.length === 0 ? 0 : mean(quantities),
        meanLeadTime: mean(leadTimeValues) / periodLengthDays,
        demandStdDev: quantities.length < 2 ? 0 : standardDeviation(quantities),
        series: quantities,
        ...(Number.isFinite(leadTimeStdDev) ? { leadTimeStdDev } : {}),
      },
      options,
    )
  }

  /** Coverage (days of inventory) for every item in the held dataset. */
  coverage(options?: CoverageOptions) {
    return coverageFn(this.input.stock, this.input.demand, options)
  }

  /** Turnover for every item in the held dataset. */
  turnover(options?: TurnoverOptions) {
    return turnoverFn(this.input.stock, this.input.demand, options)
  }

  /** Inventory issue flags for every item in the held dataset. */
  issues(options: IssuesOptions) {
    return issuesFn(this.input.stock, this.input.demand, this.input.leadTimes ?? [], options)
  }
}
