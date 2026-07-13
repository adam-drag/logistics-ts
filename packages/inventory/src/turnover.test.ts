import type { DemandRecord, StockRecord } from '@logistics-ts/core'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { turnover } from './turnover'

const demandOf = (itemId: string, quantities: number[]): DemandRecord[] =>
  quantities.map((quantity, i) => ({
    itemId,
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    quantity,
  }))

const stockOf = (itemId: string, quantity: number): StockRecord => ({ itemId, quantity })

const rowFor = <T extends { itemId: string }>(rows: T[], itemId: string) =>
  rows.find((r) => r.itemId === itemId)

describe('turnover', () => {
  it('computes annualised demand ÷ stock', () => {
    // meanDemandPerPeriod = 4, periodsPerYear (day) = 365 → annualised 1460;
    // stock 40 → turnoverRatio 36.5; DIO = 365/36.5 = 10.
    const result = turnover([stockOf('A', 40)], demandOf('A', [4, 4, 4, 4, 4, 4, 4, 4, 4, 4]))
    const row = rowFor(result.value, 'A')
    expect(row?.turnoverRatio).toBeCloseTo(36.5, 6)
    expect(row?.daysInventoryOutstanding).toBeCloseTo(10, 6)
  })

  it('is 0 turnover, Infinity DIO for an item with stock but no demand', () => {
    const result = turnover([stockOf('dead', 10)], [])
    const row = rowFor(result.value, 'dead')
    expect(row?.turnoverRatio).toBe(0)
    expect(row?.daysInventoryOutstanding).toBe(Number.POSITIVE_INFINITY)
  })

  it('is Infinity turnover for an item with demand but no stock, and warns', () => {
    const result = turnover([stockOf('A', 0)], demandOf('A', [4, 4]))
    const row = rowFor(result.value, 'A')
    expect(row?.turnoverRatio).toBe(Number.POSITIVE_INFINITY)
    expect(result.warnings?.some((w) => w.includes('A'))).toBe(true)
  })

  it('returns an empty result for empty input without throwing', () => {
    expect(turnover([], []).value).toEqual([])
  })

  it('never returns a negative turnoverRatio for non-negative inputs', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), { minLength: 1, maxLength: 10 }),
        fc.double({ min: 0, max: 10_000, noNaN: true }),
        (quantities, stockQty) => {
          const result = turnover([stockOf('X', stockQty)], demandOf('X', quantities))
          const row = rowFor(result.value, 'X')
          expect(row?.turnoverRatio).toBeGreaterThanOrEqual(0)
        },
      ),
    )
  })
})
