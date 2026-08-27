import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { toMasterSchedule } from './master-schedule'
import { planRequirements } from './plan-requirements'

describe('toMasterSchedule', () => {
  it('asserts the documented @example outputs exactly (doctest)', () => {
    const { masterSchedule, periods } = toMasterSchedule(
      [
        { itemId: 'BIKE', date: '2026-03-02', quantity: 100 },
        { itemId: 'BIKE', date: '2026-03-16', quantity: 150 },
      ],
      'week',
    )
    expect(periods).toEqual(['2026-03-02', '2026-03-09', '2026-03-16'])
    expect(masterSchedule[0]).toEqual({ itemId: 'BIKE', requirements: [100, 0, 150] })
  })

  // THE point of this function. bucketize defaults each item to its own
  // earliest/latest demand, which would make period 0 a different calendar week
  // per item — silently netting components against the wrong period.
  it('aligns every item to ONE calendar even when their demand spans differ', () => {
    const { masterSchedule, periods } = toMasterSchedule(
      [
        { itemId: 'EARLY', date: '2026-03-02', quantity: 10 },
        { itemId: 'LATE', date: '2026-03-23', quantity: 20 },
      ],
      'week',
    )
    expect(periods).toEqual(['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23'])
    expect(masterSchedule).toEqual([
      { itemId: 'EARLY', requirements: [10, 0, 0, 0] },
      { itemId: 'LATE', requirements: [0, 0, 0, 20] },
    ])
  })

  it('gives every item the same number of periods, whatever their spans', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            itemId: fc.constantFrom('A', 'B', 'C'),
            day: fc.integer({ min: 0, max: 60 }),
            quantity: fc.integer({ min: 0, max: 10_000 }).map((n) => n / 100),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (rows) => {
          const records = rows.map((r) => ({
            itemId: r.itemId,
            // 2026-03-01 + day, as a plain ISO date
            date: new Date(Date.UTC(2026, 2, 1 + r.day)).toISOString().slice(0, 10),
            quantity: r.quantity,
          }))
          const { masterSchedule, periods } = toMasterSchedule(records, 'week')
          for (const series of masterSchedule) {
            expect(series.requirements).toHaveLength(periods.length)
          }
          // Nothing is lost or invented by the bucketing.
          const inTotal = records.reduce((s, r) => s + r.quantity, 0)
          const outTotal = masterSchedule.reduce(
            (s, m) => s + m.requirements.reduce((a, b) => a + b, 0),
            0,
          )
          expect(outTotal).toBeCloseTo(inTotal, 8)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('sums repeated item/date rows into one period', () => {
    const { masterSchedule } = toMasterSchedule(
      [
        { itemId: 'A', date: '2026-03-02', quantity: 10 },
        { itemId: 'A', date: '2026-03-03', quantity: 4 },
      ],
      'week',
    )
    expect(masterSchedule[0]?.requirements).toEqual([14])
  })

  it('honours an explicit start so period 0 can be today rather than first demand', () => {
    const { masterSchedule, periods } = toMasterSchedule(
      [{ itemId: 'A', date: '2026-03-16', quantity: 10 }],
      'week',
      { start: '2026-03-02' },
    )
    expect(periods).toEqual(['2026-03-02', '2026-03-09', '2026-03-16'])
    expect(masterSchedule[0]?.requirements).toEqual([0, 0, 10])
  })

  it('honours an explicit end so the horizon can run past the last demand', () => {
    const { periods } = toMasterSchedule(
      [{ itemId: 'A', date: '2026-03-02', quantity: 10 }],
      'week',
      { end: '2026-03-23' },
    )
    expect(periods).toHaveLength(4)
  })

  it('buckets at day and month granularity too', () => {
    const day = toMasterSchedule(
      [
        { itemId: 'A', date: '2026-03-01', quantity: 1 },
        { itemId: 'A', date: '2026-03-03', quantity: 2 },
      ],
      'day',
    )
    expect(day.periods).toEqual(['2026-03-01', '2026-03-02', '2026-03-03'])
    expect(day.masterSchedule[0]?.requirements).toEqual([1, 0, 2])

    const month = toMasterSchedule(
      [
        { itemId: 'A', date: '2026-01-15', quantity: 5 },
        { itemId: 'A', date: '2026-03-02', quantity: 7 },
      ],
      'month',
    )
    expect(month.periods).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(month.masterSchedule[0]?.requirements).toEqual([5, 0, 7])
  })

  it('accepts Date objects as well as ISO strings', () => {
    const { periods } = toMasterSchedule(
      [{ itemId: 'A', date: new Date(Date.UTC(2026, 2, 2)), quantity: 1 }],
      'week',
    )
    expect(periods).toEqual(['2026-03-02'])
  })

  it('returns an empty schedule for no records rather than throwing', () => {
    expect(toMasterSchedule([], 'week')).toEqual({
      masterSchedule: [],
      periods: [],
      granularity: 'week',
    })
  })

  it('rejects a non-array and an unparseable date', () => {
    expect(() => toMasterSchedule(null as unknown as [], 'week')).toThrow(/must be an array/)
    expect(() =>
      toMasterSchedule([{ itemId: 'A', date: 'not-a-date', quantity: 1 }], 'week'),
    ).toThrow()
  })

  // The reason the whole function exists: its output feeds planRequirements
  // directly, and the period index it produces is the index that comes back.
  it('feeds planRequirements directly, end to end', () => {
    const { masterSchedule, periods } = toMasterSchedule(
      [{ itemId: 'BIKE', date: '2026-03-23', quantity: 100 }],
      'week',
      { start: '2026-03-02' },
    )
    const plan = planRequirements({
      bom: [{ parentId: 'BIKE', childId: 'WHEEL', quantityPer: 2 }],
      masterSchedule,
      items: { BIKE: { leadTimePeriods: 1 }, WHEEL: { leadTimePeriods: 2 } },
    })

    expect(periods).toEqual(['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23'])
    // BIKE is needed in period 3, released in period 2 (lead time 1 week).
    expect(plan.value.items.BIKE?.rows.map((r) => r.plannedOrderRelease)).toEqual([0, 0, 100, 0])
    // WHEEL demand follows BIKE's RELEASE in period 2 → 200, released 2 weeks
    // earlier, in period 0 — the week of 2026-03-02.
    expect(plan.value.items.WHEEL?.grossRequirements).toEqual([0, 0, 200, 0])
    expect(plan.value.items.WHEEL?.rows.map((r) => r.plannedOrderRelease)).toEqual([200, 0, 0, 0])
  })
})
