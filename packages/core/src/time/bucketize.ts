/**
 * Aggregates raw demand records into dense, chronological, **zero-filled** time
 * series per item. Zero-filling is essential: intermittent-demand statistics
 * (ADI, CV²) and forecasting models are only meaningful when the periods with no
 * demand are present as explicit zeros rather than missing rows.
 */
import type { DateInput, DemandRecord } from '../model'
import { formatEpochDay, fromEpochDay, isoWeekday, toEpochDay } from './epoch-day'

/** Time granularity for bucketization. */
export type Granularity = 'day' | 'week' | 'month'

/** A single dense time bucket. */
export interface DemandBucket {
  /**
   * Canonical period label: `YYYY-MM-DD` for `day`, the Monday's `YYYY-MM-DD`
   * for `week`, and `YYYY-MM` for `month`.
   */
  period: string
  /** Total demand in the period (0 for zero-filled gaps). */
  quantity: number
}

/** A dense, chronological, zero-filled demand series for one item. */
export interface DemandSeries {
  itemId: string
  granularity: Granularity
  buckets: DemandBucket[]
}

export interface BucketizeOptions {
  /**
   * Inclusive range start. When omitted, each item's series starts at its own
   * earliest demand. Provide this to align every item to a common calendar.
   */
  start?: DateInput
  /** Inclusive range end. When omitted, each item's series ends at its latest demand. */
  end?: DateInput
}

/**
 * Maps an epoch day to its integer bucket key. Keys are comparable and step by a
 * fixed amount within a granularity:
 * - `day`  → the epoch day itself (step 1)
 * - `week` → the Monday's epoch day (step 7)
 * - `month`→ a year·12 + monthIndex ordinal (step 1)
 */
function bucketKey(epochDay: number, granularity: Granularity): number {
  switch (granularity) {
    case 'day':
      return epochDay
    case 'week':
      return epochDay - isoWeekday(epochDay)
    case 'month': {
      const d = fromEpochDay(epochDay)
      return d.getUTCFullYear() * 12 + d.getUTCMonth()
    }
  }
}

/** The step between adjacent bucket keys for a granularity. */
function keyStep(granularity: Granularity): number {
  return granularity === 'week' ? 7 : 1
}

/** Renders a bucket key back to its canonical period label. */
function keyToLabel(key: number, granularity: Granularity): string {
  if (granularity === 'month') {
    const year = Math.floor(key / 12)
    const month = key % 12
    return `${year}-${String(month + 1).padStart(2, '0')}`
  }
  return formatEpochDay(key)
}

/**
 * Buckets demand records into dense, zero-filled series — one per item, sorted
 * by `itemId`, each chronologically ordered.
 *
 * @param records - Raw demand records; multiple records in the same period are summed.
 * @param granularity - `day`, `week`, or `month`.
 * @param options - Optional common calendar range (see {@link BucketizeOptions}).
 */
export function bucketize(
  records: readonly DemandRecord[],
  granularity: Granularity,
  options: BucketizeOptions = {},
): DemandSeries[] {
  const step = keyStep(granularity)

  const rangeStart =
    options.start !== undefined ? bucketKey(toEpochDay(options.start), granularity) : undefined
  const rangeEnd =
    options.end !== undefined ? bucketKey(toEpochDay(options.end), granularity) : undefined

  // Aggregate quantities into a key→quantity map per item, tracking each item's
  // observed key span for the default (per-item) range.
  const perItem = new Map<string, { totals: Map<number, number>; min: number; max: number }>()

  for (const record of records) {
    const key = bucketKey(toEpochDay(record.date), granularity)
    let entry = perItem.get(record.itemId)
    if (!entry) {
      entry = { totals: new Map(), min: key, max: key }
      perItem.set(record.itemId, entry)
    }
    entry.totals.set(key, (entry.totals.get(key) ?? 0) + record.quantity)
    if (key < entry.min) entry.min = key
    if (key > entry.max) entry.max = key
  }

  const series: DemandSeries[] = []
  for (const itemId of [...perItem.keys()].sort()) {
    const entry = perItem.get(itemId) as { totals: Map<number, number>; min: number; max: number }
    const from = rangeStart ?? entry.min
    const to = rangeEnd ?? entry.max

    const buckets: DemandBucket[] = []
    for (let key = from; key <= to; key += step) {
      buckets.push({ period: keyToLabel(key, granularity), quantity: entry.totals.get(key) ?? 0 })
    }
    series.push({ itemId, granularity, buckets })
  }

  return series
}
