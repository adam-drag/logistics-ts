/**
 * Calendar-date handling. logistics-ts treats every date as a **calendar date**
 * (never an instant with a timezone), represented internally as an integer
 * "epoch day" — the number of whole days since 1970-01-01 in UTC. This keeps
 * bucketization deterministic and free of daylight-saving/timezone drift, with
 * no date-library dependency.
 */
import type { DateInput } from '../model'

const MS_PER_DAY = 86_400_000
// A calendar date, optionally followed by a time part ("2026-01-31T09:30:00Z").
// The time, if present, must itself be time-shaped (HH:MM[:SS[.sss]][Z|±HH:MM]);
// anything else after the date (e.g. "2026-01-019" or "2026-01-01Txyz") is
// rejected rather than silently truncated to the calendar date.
const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

/**
 * Converts a {@link DateInput} to an integer epoch day (days since 1970-01-01,
 * UTC). ISO strings are read by their calendar `YYYY-MM-DD` part (a trailing
 * time part is accepted and ignored); `Date` values are read by their UTC
 * year/month/day. Throws on an unparseable value.
 *
 * @example
 * ```ts
 * toEpochDay('1970-01-01')            // 0
 * toEpochDay('2026-03-02')            // 20514
 * toEpochDay('2026-03-02T09:30:00Z')  // 20514 — the time part is ignored
 * toEpochDay(new Date(Date.UTC(2026, 2, 2))) // 20514
 * ```
 */
export function toEpochDay(input: DateInput): number {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new RangeError('Invalid Date')
    return Math.floor(
      Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()) / MS_PER_DAY,
    )
  }
  const match = ISO_DATE.exec(input)
  if (!match) throw new RangeError(`Unparseable date: ${JSON.stringify(input)}`)
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const utc = Date.UTC(year, month, day)
  // Reject values that overflowed (e.g. month 13, day 32).
  const d = new Date(utc)
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) {
    throw new RangeError(`Invalid calendar date: ${input}`)
  }
  return Math.floor(utc / MS_PER_DAY)
}

/**
 * Converts an epoch day back to a UTC-midnight `Date`. An epoch day is an
 * integer count of days; a non-integer input is rejected so the midnight
 * contract holds.
 *
 * @example
 * ```ts
 * fromEpochDay(20514).toISOString() // '2026-03-02T00:00:00.000Z'
 * fromEpochDay(20514.5)             // throws RangeError
 * ```
 */
export function fromEpochDay(epochDay: number): Date {
  if (!Number.isInteger(epochDay)) {
    throw new RangeError(`Epoch day must be an integer, got ${epochDay}`)
  }
  return new Date(epochDay * MS_PER_DAY)
}

/**
 * Formats an epoch day as an ISO `YYYY-MM-DD` calendar date.
 *
 * @example
 * ```ts
 * formatEpochDay(20514) // '2026-03-02'
 * formatEpochDay(0)     // '1970-01-01'
 * ```
 */
export function formatEpochDay(epochDay: number): string {
  return fromEpochDay(epochDay).toISOString().slice(0, 10)
}

/**
 * ISO weekday of an epoch day, Monday = 0 … Sunday = 6.
 *
 * Note the zero-based Monday convention, which is what week bucketing needs —
 * it is NOT the 1..7 of ISO-8601 proper, nor `Date.getUTCDay`'s Sunday = 0.
 *
 * @example
 * ```ts
 * isoWeekday(toEpochDay('2026-03-02')) // 0 — a Monday
 * isoWeekday(toEpochDay('2026-03-08')) // 6 — the Sunday that ends that week
 * ```
 */
export function isoWeekday(epochDay: number): number {
  // 1970-01-01 is a Thursday (JS getUTCDay = 4); normalise so Monday = 0.
  return ((((epochDay % 7) + 4) % 7) + 6) % 7
}
