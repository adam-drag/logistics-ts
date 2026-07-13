import type { DemandRecord, StockRecord } from '@logistics-ts/core'
import { describe, expect, it } from 'vitest'
import { coverage } from './coverage'

const demandOf = (itemId: string, quantities: number[]): DemandRecord[] =>
  quantities.map((quantity, i) => ({
    itemId,
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    quantity,
  }))

const stockOf = (itemId: string, quantity: number): StockRecord => ({ itemId, quantity })

const rowFor = <T extends { itemId: string }>(rows: T[], itemId: string) =>
  rows.find((r) => r.itemId === itemId)

describe('coverage', () => {
  it('computes daysOfInventory from the historical mean', () => {
    const stock = [stockOf('A', 40)]
    const demand = demandOf('A', [4, 4, 4, 4, 4, 4, 4, 4, 4, 4])
    const result = coverage(stock, demand)
    expect(rowFor(result.value, 'A')?.daysOfInventory).toBe(10)
    expect(result.method).toBe('coverage-historical-mean')
  })

  it('is 0, not NaN, when there is no stock or no demand', () => {
    const result = coverage([stockOf('A', 0)], demandOf('A', [4, 4]))
    expect(rowFor(result.value, 'A')?.daysOfInventory).toBe(0)

    const result2 = coverage([stockOf('B', 40)], demandOf('B', [0, 0]))
    expect(rowFor(result2.value, 'B')?.daysOfInventory).toBe(0)
  })

  it('includes an item with stock but no demand history at all', () => {
    const result = coverage([stockOf('dead', 10)], [])
    const row = rowFor(result.value, 'dead')
    expect(row).toBeDefined()
    expect(row?.daysOfInventory).toBe(0)
  })

  it('returns an empty result for empty input without throwing', () => {
    expect(coverage([], []).value).toEqual([])
  })

  describe('forecastWalk', () => {
    it('walks the forecast forward to a plausible depletion day', () => {
      const stock = [stockOf('A', 40)]
      const demand = demandOf('A', [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4])
      const result = coverage(stock, demand, { forecastWalk: true })
      const row = rowFor(result.value, 'A')
      expect(row?.forecastWalkDays).toBeGreaterThan(0)
      expect(row?.forecastWalkDays).toBeLessThanOrEqual(90)
      expect(result.method).toBe('coverage-forecast-walk')
    })

    it('skips the walk and warns for an item with no demand history', () => {
      const result = coverage([stockOf('dead', 10)], [], { forecastWalk: true })
      const row = rowFor(result.value, 'dead')
      expect(row?.forecastWalkDays).toBeUndefined()
      expect(result.warnings?.some((w) => w.includes('dead'))).toBe(true)
    })

    it('warns when depletion does not occur within the horizon', () => {
      const stock = [stockOf('A', 1_000_000)]
      const demand = demandOf('A', [1, 1, 1, 1, 1])
      const result = coverage(stock, demand, { forecastWalk: true, forecastHorizon: 5 })
      const row = rowFor(result.value, 'A')
      expect(row?.forecastWalkDays).toBeUndefined()
      expect(result.warnings?.some((w) => w.includes('did not deplete'))).toBe(true)
    })
  })
})
