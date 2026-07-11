import { describe, expect, it } from 'vitest'
import { formatEpochDay, fromEpochDay, isoWeekday, toEpochDay } from './epoch-day'

describe('toEpochDay', () => {
  it('anchors the Unix epoch at 0 and counts whole days', () => {
    expect(toEpochDay('1970-01-01')).toBe(0)
    expect(toEpochDay('1970-01-02')).toBe(1)
  })

  it('accepts Date values by their UTC calendar date', () => {
    expect(toEpochDay(new Date(Date.UTC(1970, 0, 1)))).toBe(0)
    expect(toEpochDay(new Date('2026-01-01T23:59:59Z'))).toBe(toEpochDay('2026-01-01'))
  })

  it('counts calendar spans correctly, including leap years', () => {
    // 2025 is not a leap year → 365 days.
    expect(toEpochDay('2026-01-01') - toEpochDay('2025-01-01')).toBe(365)
    // 2024 is a leap year → February has 29 days.
    expect(toEpochDay('2024-03-01') - toEpochDay('2024-02-01')).toBe(29)
  })

  it('rejects invalid or unparseable dates', () => {
    expect(() => toEpochDay('not-a-date')).toThrow()
    expect(() => toEpochDay('2026-13-01')).toThrow()
    expect(() => toEpochDay('2026-02-30')).toThrow()
    expect(() => toEpochDay(new Date('nonsense'))).toThrow()
  })

  it('accepts a trailing time part but rejects other trailing garbage', () => {
    expect(toEpochDay('2026-01-01T23:59:59Z')).toBe(toEpochDay('2026-01-01'))
    expect(toEpochDay('2026-01-01 12:00:00')).toBe(toEpochDay('2026-01-01'))
    expect(() => toEpochDay('2026-01-019')).toThrow()
    expect(() => toEpochDay('2026-01-01x')).toThrow()
  })
})

describe('fromEpochDay / formatEpochDay', () => {
  it('round-trips with toEpochDay', () => {
    for (const iso of ['1970-01-01', '2000-02-29', '2026-07-11']) {
      expect(formatEpochDay(toEpochDay(iso))).toBe(iso)
    }
  })

  it('returns a UTC-midnight Date', () => {
    expect(fromEpochDay(0).toISOString()).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('isoWeekday', () => {
  it('maps Monday to 0 … Sunday to 6', () => {
    // 1970-01-01 was a Thursday.
    expect(isoWeekday(toEpochDay('1970-01-01'))).toBe(3)
    // 2026-01-05 is a Monday.
    expect(isoWeekday(toEpochDay('2026-01-05'))).toBe(0)
    // 2026-01-11 is a Sunday.
    expect(isoWeekday(toEpochDay('2026-01-11'))).toBe(6)
  })
})
