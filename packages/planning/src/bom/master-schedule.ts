/**
 * Turns dated master-production-schedule records into the period-indexed series
 * an MRP run consumes, with every item aligned to one shared calendar.
 *
 * This is the bridge between the two halves of the library's date convention:
 * records carry calendar dates at the boundary, while every planning function
 * is indexed by period (bucket). It exists because getting the alignment wrong
 * is silent — see the warning on {@link toMasterSchedule}.
 *
 * @see Orlicky, J. (1975). Material Requirements Planning, McGraw-Hill — the
 *   master production schedule as the driver of the MRP explosion.
 */
import {
  type BucketizeOptions,
  bucketize,
  type Granularity,
  type MasterScheduleRecord,
  toEpochDay,
} from '@logistics-ts/core'
import type { ItemRequirements } from './types'

/** A master schedule bucketed onto a single shared period grid. */
export interface MasterScheduleSeries {
  /**
   * Period-indexed independent demand, one entry per item, sorted by `itemId`.
   * Every `requirements` array has the same length and the same period meaning,
   * so index `t` is the same calendar period for every item.
   */
  masterSchedule: ItemRequirements[]
  /**
   * Canonical label per period index: `YYYY-MM-DD` for `day` and for `week`
   * (the Monday), `YYYY-MM` for `month`. Use it to report a planned order
   * against a real date — `periods[3]` is what period 3 means.
   */
  periods: string[]
  /** The granularity the periods were bucketed at. */
  granularity: Granularity
}

/**
 * Buckets dated {@link MasterScheduleRecord}s into period-indexed
 * {@link ItemRequirements}, aligning **every item to one common calendar**.
 *
 * The alignment is the entire reason this function exists rather than a bare
 * `bucketize` call. `bucketize` defaults each item's series to that item's own
 * earliest and latest demand, which is right for forecasting — each item is
 * modelled independently — and silently wrong for MRP, where period 0 must mean
 * the same calendar period for every item or a component gets netted against
 * the wrong period's requirement. This function therefore derives a single
 * `start`/`end` spanning **all** records and applies it to every item.
 *
 * Quantities in the same period are summed, so a repeated item/date pair is
 * combined here rather than at load time. Periods with no demand are explicit
 * zeros, which is what the netting grid expects.
 *
 * Units: quantities are in each item's own units; `periods` are buckets, and
 * every downstream `leadTimePeriods` is counted in these same buckets — not in
 * days. At `granularity: 'week'`, a lead time of 14 days is `2`.
 *
 * @param records - Dated master-schedule rows, e.g. from `loadMasterSchedule`.
 * @param granularity - `day`, `week`, or `month`; sets what one period means.
 * @param options - Optional explicit `start`/`end` ({@link BucketizeOptions}).
 *   Pass `start` to make period 0 a specific date (typically "today") rather
 *   than the earliest scheduled demand, and `end` to plan out to a fixed
 *   horizon even if nothing is scheduled that far out.
 * @returns A {@link MasterScheduleSeries} ready for `planRequirements`.
 * @throws RangeError if `start` is after `end`, or a date cannot be parsed.
 * @example
 * ```ts
 * const { masterSchedule, periods } = toMasterSchedule(
 *   [
 *     { itemId: 'BIKE', date: '2026-03-02', quantity: 100 },
 *     { itemId: 'BIKE', date: '2026-03-16', quantity: 150 },
 *   ],
 *   'week',
 * )
 *
 * periods                        // ['2026-03-02', '2026-03-09', '2026-03-16']
 * masterSchedule[0]              // { itemId: 'BIKE', requirements: [100, 0, 150] }
 * // ↑ the empty middle week is an explicit zero, not a missing period
 * ```
 */
export function toMasterSchedule(
  records: readonly MasterScheduleRecord[],
  granularity: Granularity,
  options: BucketizeOptions = {},
): MasterScheduleSeries {
  if (!Array.isArray(records)) {
    throw new TypeError(`records must be an array of master-schedule rows (got ${typeof records})`)
  }
  if (records.length === 0) {
    return { masterSchedule: [], periods: [], granularity }
  }

  // Derive one calendar span across EVERY record, so bucketize cannot fall back
  // to its per-item default. Carry the caller's own dates through rather than
  // converting back from epoch days — bucketize re-buckets them anyway, and a
  // round trip would be one more place for an off-by-one to hide.
  let earliest = records[0] as MasterScheduleRecord
  let latest = earliest
  let earliestDay = toEpochDay(earliest.date)
  let latestDay = earliestDay
  for (const record of records) {
    const day = toEpochDay(record.date)
    if (day < earliestDay) {
      earliestDay = day
      earliest = record
    }
    if (day > latestDay) {
      latestDay = day
      latest = record
    }
  }

  const series = bucketize(records, granularity, {
    start: options.start ?? earliest.date,
    end: options.end ?? latest.date,
  })

  return {
    masterSchedule: series.map((s) => ({
      itemId: s.itemId,
      requirements: s.buckets.map((b) => b.quantity),
    })),
    // Every series shares the span, so the first one's labels describe them all.
    periods: series[0]?.buckets.map((b) => b.period) ?? [],
    granularity,
  }
}
