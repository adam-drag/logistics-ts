import { describe, expect, it } from 'vitest'
import { lotForLot } from './lot-for-lot'

describe('lotForLot', () => {
  it('orders each nonzero-demand period, carries nothing (demand=[10,0,20,5], S=100)', () => {
    // Nahmias (2009), dynamic lot sizing — lot-for-lot baseline: one order per
    // nonzero-demand period, zero holding. 3 nonzero periods × S=100 = 300.
    const result = lotForLot([10, 0, 20, 5], {
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.value.orders).toEqual([
      { period: 0, quantity: 10 },
      { period: 2, quantity: 20 },
      { period: 3, quantity: 5 },
    ])
    expect(result.value.holdingCost).toBe(0)
    expect(result.value.setupCost).toBe(300)
    expect(result.value.totalCost).toBe(300)
  })

  it('asserts the documented @example outputs exactly (doctest)', () => {
    // Guards the TSDoc @example against code drift — it carries load-bearing numbers.
    expect(
      lotForLot([10, 0, 20, 5], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 }).value,
    ).toEqual({
      orders: [
        { period: 0, quantity: 10 },
        { period: 2, quantity: 20 },
        { period: 3, quantity: 5 },
      ],
      totalCost: 300,
      setupCost: 300,
      holdingCost: 0,
    })
  })

  it('exposes the explanation contract (method, inputs, citation)', () => {
    const result = lotForLot([10, 0, 20, 5], {
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.method).toBe('lot-for-lot')
    expect(result.inputs.orders).toBe(3)
    expect(result.inputs.periods).toBe(4)
    expect(result.citations).toContain(
      'Nahmias, S. (2009), Production and Operations Analysis, 6th ed.',
    )
  })

  it('holds zero inventory for any demand vector, so cost = orders × S (property)', () => {
    const demand = [5, 5, 0, 12, 0, 0, 7]
    const setupCost = 40
    const result = lotForLot(demand, { setupCost, holdingCostPerUnitPerPeriod: 2 })
    const nonzero = demand.filter((d) => d > 0).length
    expect(result.value.holdingCost).toBe(0)
    expect(result.value.orders).toHaveLength(nonzero)
    expect(result.value.totalCost).toBe(nonzero * setupCost)
  })

  it('returns an empty plan for all-zero demand', () => {
    const result = lotForLot([0, 0, 0], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 })
    expect(result.value.orders).toEqual([])
    expect(result.value.totalCost).toBe(0)
  })

  it('handles empty demand', () => {
    const result = lotForLot([], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 })
    expect(result.value.orders).toEqual([])
    expect(result.value.totalCost).toBe(0)
  })

  it('throws naming the offending field on invalid input', () => {
    expect(() => lotForLot([10], { setupCost: -1, holdingCostPerUnitPerPeriod: 1 })).toThrow(
      /setupCost/,
    )
    expect(() => lotForLot([10, -5], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 })).toThrow(
      /demand\[1\]/,
    )
    expect(() =>
      lotForLot([10], { setupCost: 100, holdingCostPerUnitPerPeriod: Number.NaN }),
    ).toThrow(/holdingCostPerUnitPerPeriod/)
  })
})
