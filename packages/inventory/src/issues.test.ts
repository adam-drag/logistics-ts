import type { DemandRecord, LeadTimeRecord, StockRecord } from '@logistics-ts/core'
import { describe, expect, it } from 'vitest'
import { issues } from './issues'

const demandOf = (itemId: string, quantities: number[]): DemandRecord[] =>
  quantities.map((quantity, i) => ({
    itemId,
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    quantity,
  }))

const leadTimesOf = (itemId: string, values: number[]): LeadTimeRecord[] =>
  values.map((leadTimeDays) => ({ itemId, leadTimeDays }))

const stockOf = (itemId: string, quantity: number): StockRecord => ({ itemId, quantity })

const issueFor = <T extends { itemId: string }>(result: T[], itemId: string) =>
  result.find((r) => r.itemId === itemId)

describe('issues', () => {
  it('flags below-rop, below-safety-stock, and stockout-risk for a critically low item', () => {
    const stock: StockRecord[] = [stockOf('critical', 10)]
    const demand = demandOf(
      'critical',
      Array.from({ length: 20 }, () => 10),
    )
    const leadTimes = leadTimesOf('critical', [4, 5, 6, 5, 5])

    const result = issues(stock, demand, leadTimes, { serviceLevel: 0.95 })
    const row = issueFor(result.value, 'critical')
    expect(row?.flags).toContain('below-rop')
    expect(row?.flags).toContain('below-safety-stock')
    expect(row?.flags).toContain('stockout-risk-within-leadtime')
  })

  it('flags overstocked for an item with far more coverage than the threshold', () => {
    const stock: StockRecord[] = [stockOf('healthy', 1000)]
    const demand = demandOf(
      'healthy',
      Array.from({ length: 20 }, () => 5),
    )
    const leadTimes = leadTimesOf('healthy', [3, 3, 3])

    const result = issues(stock, demand, leadTimes, { serviceLevel: 0.95 })
    const row = issueFor(result.value, 'healthy')
    expect(row?.flags).toContain('overstocked')
    expect(row?.flags).not.toContain('below-rop')
  })

  it('flags dead-stock for an item with stock but no demand history', () => {
    const result = issues([stockOf('dead', 20)], [], [], { serviceLevel: 0.95 })
    const row = issueFor(result.value, 'dead')
    expect(row?.flags).toContain('dead-stock')
  })

  it('skips lead-time-dependent flags and warns when an item has no lead-time records', () => {
    const stock: StockRecord[] = [stockOf('nolead', 5)]
    const demand = demandOf('nolead', [10, 10, 10])
    const result = issues(stock, demand, [], { serviceLevel: 0.95 })
    const row = issueFor(result.value, 'nolead')
    expect(row?.flags).not.toContain('below-rop')
    expect(row?.flags).not.toContain('below-safety-stock')
    expect(row?.flags).not.toContain('stockout-risk-within-leadtime')
    expect(result.warnings?.some((w) => w.includes('nolead'))).toBe(true)
  })

  it('returns an empty result for empty input without throwing', () => {
    expect(issues([], [], [], { serviceLevel: 0.95 }).value).toEqual([])
  })

  it('never flags an item with no flags raised, and says so in reasoning', () => {
    const result = issues([], [], [], { serviceLevel: 0.95 })
    expect(result.reasoning).toEqual(['no items flagged'])
  })

  it('converts lead time (always in days) into the demand-bucketing period unit', () => {
    // Three full ISO weeks (Mon 2026-01-05 → Sun 2026-01-25) of 10 units/day
    // → meanDemandPerPeriod = 70/week, zero variance. A 7-day lead time is
    // exactly 1 week, so ROP/leadTimeDemand should land near 70 — not ~7x
    // that (490), which is what a days-vs-weeks unit mismatch would produce.
    const stock: StockRecord[] = [stockOf('weekly', 50)]
    const dates = Array.from({ length: 21 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 5 + i))
      return d.toISOString().slice(0, 10)
    })
    const demand: DemandRecord[] = dates.map((date) => ({ itemId: 'weekly', date, quantity: 10 }))
    const leadTimes = leadTimesOf('weekly', [7, 7, 7])

    const result = issues(stock, demand, leadTimes, { serviceLevel: 0.95, granularity: 'week' })
    const row = issueFor(result.value, 'weekly')
    expect(row?.details.reorderPoint).toBeGreaterThan(50)
    expect(row?.details.reorderPoint).toBeLessThan(150)
    expect(row?.details.leadTimeDemand).toBeGreaterThan(30)
    expect(row?.details.leadTimeDemand).toBeLessThan(150)
  })
})
