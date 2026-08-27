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
  type BomRecord,
  bucketize,
  type DateInput,
  type DemandRecord,
  type Granularity,
  type LeadTimeRecord,
  type MasterScheduleRecord,
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
import {
  type ItemPlanningData,
  planRequirements,
  type RequirementsPlan,
  toMasterSchedule,
} from '@logistics-ts/planning'

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

/** Input to {@link InventoryAnalyzer.plan}: structure and schedule, dated. */
export interface AnalyzerPlanInput {
  /** The product-structure edge list. Must be acyclic. */
  bom: BomRecord
  /** Dated independent demand for end items — the master production schedule. */
  masterSchedule: readonly MasterScheduleRecord[]
  /**
   * Bucket size for the whole plan. Default `'week'`, the usual MRP bucket.
   * Every derived `leadTimePeriods` is counted in these buckets.
   */
  granularity?: Granularity
  /**
   * Per-item overrides, merged over the values derived from the held dataset.
   * Supplying only a `lotRule` keeps the derived `onHand` and `leadTimePeriods`.
   * Safety stock, scheduled receipts and lot rules can only be set here.
   */
  items?: Record<string, ItemPlanningData>
  /** Force period 0 to a date (typically today) rather than the earliest demand. */
  start?: DateInput
  /** Plan out to this date even if nothing is scheduled that far out. */
  end?: DateInput
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

  /**
   * Runs a multi-level MRP plan over a bill of materials and a dated master
   * production schedule, filling in each item's on-hand stock and lead time
   * **from the held dataset**.
   *
   * This is the composition the wrapper exists for. `planRequirements` needs
   * per-item `onHand` and `leadTimePeriods` in buckets; the analyzer is already
   * holding `stock` records and day-denominated `leadTimes`, so it derives them:
   *
   * - `onHand` — the **sum** of that item's stock records, across locations.
   *   MRP nets against total available stock; if you plan per location, hold one
   *   analyzer per location or override the item explicitly.
   * - `leadTimePeriods` — the item's mean observed `leadTimeDays` converted into
   *   `granularity` buckets and **rounded up**. Rounding up is deliberate: a
   *   10-day lead time at weekly buckets becomes 2 weeks, not 1. Rounding down
   *   would plan a release later than the part can actually arrive, which is a
   *   stockout the plan claims is fine.
   *
   * Anything in `items` overrides the derived value for that item, and is the
   * only way to set a safety stock, scheduled receipts, or a lot rule.
   *
   * The master schedule is dated; it is bucketed with {@link toMasterSchedule},
   * so every item shares one calendar and the resulting `periods` labels are
   * attached to the plan.
   *
   * @param input - BOM, dated master schedule, and optional per-item overrides.
   * @returns The `Explained` {@link RequirementsPlan} from `planRequirements`,
   *   unchanged, with `value.periods` naming the calendar.
   * @throws RangeError if the BOM is cyclic; Error if an item has no derivable
   *   lead time and none was supplied.
   * @example
   * ```ts
   * const analyzer = new InventoryAnalyzer({ demand, stock, leadTimes })
   * const plan = analyzer.plan({
   *   bom: [{ parentId: 'BIKE', childId: 'WHEEL', quantityPer: 2 }],
   *   masterSchedule: [{ itemId: 'BIKE', date: '2026-03-23', quantity: 100 }],
   *   granularity: 'week',
   * })
   *
   * plan.value.periods                    // ['2026-03-02', … ] if start given
   * plan.value.items.WHEEL?.plannedOrders // release/receipt pairs
   * ```
   */
  plan(input: AnalyzerPlanInput): RequirementsPlan {
    const granularity = input.granularity ?? 'week'
    const { masterSchedule, periods } = toMasterSchedule(input.masterSchedule, granularity, {
      ...(input.start !== undefined ? { start: input.start } : {}),
      ...(input.end !== undefined ? { end: input.end } : {}),
    })

    const onHandByItem = new Map<string, number>()
    for (const record of this.input.stock) {
      onHandByItem.set(record.itemId, (onHandByItem.get(record.itemId) ?? 0) + record.quantity)
    }
    const leadTimeDaysByItem = new Map<string, number[]>()
    for (const record of this.input.leadTimes ?? []) {
      const list = leadTimeDaysByItem.get(record.itemId)
      if (list) list.push(record.leadTimeDays)
      else leadTimeDaysByItem.set(record.itemId, [record.leadTimeDays])
    }

    // Every item the plan will touch: both ends of every BOM edge, plus
    // everything the master schedule drives.
    const itemIds = new Set<string>()
    for (const line of input.bom) {
      itemIds.add(line.parentId)
      itemIds.add(line.childId)
    }
    for (const entry of masterSchedule) itemIds.add(entry.itemId)

    const periodLengthDays = DAYS_PER_PERIOD[granularity]
    const items: Record<string, ItemPlanningData> = {}
    for (const itemId of itemIds) {
      const derived: ItemPlanningData = {}
      const onHand = onHandByItem.get(itemId)
      if (onHand !== undefined) derived.onHand = onHand
      const observed = leadTimeDaysByItem.get(itemId)
      if (observed && observed.length > 0) {
        derived.leadTimePeriods = Math.ceil(mean(observed) / periodLengthDays)
      }
      // Caller overrides win field by field, so supplying only a lot rule keeps
      // the derived on-hand and lead time.
      items[itemId] = { ...derived, ...(input.items?.[itemId] ?? {}) }
    }

    return planRequirements({
      bom: input.bom,
      masterSchedule,
      items,
      periods,
    })
  }
}
