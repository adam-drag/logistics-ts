/**
 * Doctests: every load-bearing number in a `@example` block in this package is
 * asserted here, so an example that drifts from the implementation fails CI.
 *
 * This exists because `@example` values are executable-looking but never
 * executed — the library has shipped wrong ones twice (`smape` said 6.13 where
 * the code gives 10.03; `fillRate` said 0.9583 where its own test said 0.97917).
 * Agents read these `.d.ts` blocks directly, so a wrong one is a wrong API.
 *
 * When you change an `@example`, change the matching assertion here.
 */
import { describe, expect, it } from 'vitest'
import { normalCdf, normalLossFunction, normalPdf } from './numerics/normal'
import { nelderMead } from './numerics/optimize'
import {
  averageDemandInterval,
  coefficientOfVariation,
  mean,
  squaredCvOfNonZero,
  standardDeviation,
  variance,
} from './numerics/stats'
import { loadDemand, loadLeadTimes, loadStock } from './table/loader'
import { bucketize } from './time/bucketize'
import { formatEpochDay, fromEpochDay, isoWeekday, toEpochDay } from './time/epoch-day'

describe('@example blocks in core', () => {
  it('stats.ts', () => {
    const s = [10, 12, 8, 14, 6]
    expect(mean(s)).toBe(10)
    expect(mean([])).toBeNaN()
    expect(variance(s)).toBe(10)
    expect(variance(s, true)).toBe(8)
    expect(standardDeviation(s)).toBe(3.1622776601683795)
    expect(coefficientOfVariation(s)).toBe(0.31622776601683794)

    const lumpy = [0, 5, 0, 0, 12, 0, 3, 0]
    expect(squaredCvOfNonZero(lumpy)).toBe(0.5025000000000001)
    expect(averageDemandInterval(lumpy)).toBe(2.6666666666666665)
  })

  it('normal.ts', () => {
    expect(normalPdf(0)).toBe(0.3989422804014327)
    expect(normalPdf(1)).toBe(0.24197072451914337)
    expect(normalCdf(0)).toBe(0.5)
    expect(normalCdf(1.645)).toBe(0.9500151083946706)
    expect(normalCdf(1.96)).toBe(0.9750021738917761)
    expect(normalLossFunction(0)).toBe(0.3989422804014327)
    expect(normalLossFunction(1)).toBe(0.08331546068677964)
    expect(normalLossFunction(2)).toBe(0.008490840738675384)
    expect(50 * normalLossFunction(1)).toBe(4.165773034338982)
  })

  it('epoch-day.ts', () => {
    expect(toEpochDay('1970-01-01')).toBe(0)
    expect(toEpochDay('2026-03-02')).toBe(20514)
    expect(toEpochDay('2026-03-02T09:30:00Z')).toBe(20514)
    expect(toEpochDay(new Date(Date.UTC(2026, 2, 2)))).toBe(20514)
    expect(fromEpochDay(20514).toISOString()).toBe('2026-03-02T00:00:00.000Z')
    expect(() => fromEpochDay(20514.5)).toThrow(RangeError)
    expect(formatEpochDay(20514)).toBe('2026-03-02')
    expect(formatEpochDay(0)).toBe('1970-01-01')
    expect(isoWeekday(toEpochDay('2026-03-02'))).toBe(0)
    expect(isoWeekday(toEpochDay('2026-03-08'))).toBe(6)
  })

  it('bucketize.ts', () => {
    expect(
      bucketize(
        [
          { itemId: 'A', date: '2026-01-05', quantity: 10 },
          { itemId: 'A', date: '2026-01-07', quantity: 4 },
          { itemId: 'A', date: '2026-01-21', quantity: 6 },
        ],
        'week',
      ),
    ).toEqual([
      {
        itemId: 'A',
        granularity: 'week',
        buckets: [
          { period: '2026-01-05', quantity: 14 },
          { period: '2026-01-12', quantity: 0 },
          { period: '2026-01-19', quantity: 6 },
        ],
      },
    ])
  })

  it('optimize.ts', () => {
    const result = nelderMead((v) => ((v[0] ?? 0) - 3) ** 2 + ((v[1] ?? 0) + 1) ** 2, [0, 0])
    expect(result.x).toEqual([3.000024299792811, -1.000017321997305])
    expect(result.fx).toBe(8.905315212824712e-10)
    expect(result.converged).toBe(true)
    expect(result.iterations).toBe(44)
  })

  it('loader.ts', () => {
    const demand = loadDemand(
      [
        { sku: 'A', when: '2026-01-05', qty: '10' },
        { sku: 'A', when: 'oops', qty: '3' },
      ],
      { itemId: 'sku', date: 'when', quantity: 'qty' },
    )
    expect(demand.records).toEqual([{ itemId: 'A', date: '2026-01-05', quantity: 10 }])
    expect(demand.issues).toEqual([
      { row: 1, column: 'when', problem: 'expected a calendar date (Date or ISO YYYY-MM-DD)' },
    ])

    const stock = loadStock([{ itemId: 'A', quantity: 120, unitCost: 4.5 }])
    expect(stock.records).toEqual([{ itemId: 'A', quantity: 120, unitCost: 4.5 }])
    expect(stock.issues).toEqual([])

    const leadTimes = loadLeadTimes([
      { itemId: 'A', leadTimeDays: 12 },
      { itemId: 'A', leadTimeDays: 16 },
    ])
    expect(leadTimes.records).toEqual([
      { itemId: 'A', leadTimeDays: 12 },
      { itemId: 'A', leadTimeDays: 16 },
    ])
  })
})
