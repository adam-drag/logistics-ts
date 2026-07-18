import { describe, expect, it } from 'vitest'
import { periodOrderQuantity } from './period-order-quantity'

describe('periodOrderQuantity', () => {
  it('derives T* from EOQ and orders per block (Nahmias/SPT POQ example)', () => {
    // Nahmias (2009) / Silver-Pyke-Thomas (2017), POQ.
    // demand [10,20,30,40]: meanDemand = 25, EOQ = √(2·25·100/1) = √5000 ≈ 70.71,
    // T* = max(1, round(70.71/25)) = round(2.83) = 3.
    // block p0..p2 → order 60@p0; block p3 → order 40@p3.
    // coverage holding for the first block = 1·d1 + 2·d2 = 20 + 60 = 80.
    // 2 setups × 100 = 200 → total 280.
    const result = periodOrderQuantity([10, 20, 30, 40], {
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.value.orders).toEqual([
      { period: 0, quantity: 60 },
      { period: 3, quantity: 40 },
    ])
    expect(result.value.holdingCost).toBe(80)
    expect(result.value.setupCost).toBe(200)
    expect(result.value.totalCost).toBe(280)
  })

  it('asserts the documented @example outputs exactly (doctest)', () => {
    expect(
      periodOrderQuantity([10, 20, 30, 40], {
        setupCost: 100,
        holdingCostPerUnitPerPeriod: 1,
      }).value,
    ).toEqual({
      orders: [
        { period: 0, quantity: 60 },
        { period: 3, quantity: 40 },
      ],
      totalCost: 280,
      setupCost: 200,
      holdingCost: 80,
    })
  })

  it('exposes the explanation contract, including the derived interval', () => {
    const result = periodOrderQuantity([10, 20, 30, 40], {
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.method).toBe('period-order-quantity')
    expect(result.inputs.meanDemand).toBe(25)
    expect(result.inputs.intervalPeriods).toBe(3)
    expect(result.citations).toContain(
      'Nahmias, S. (2009), Production and Operations Analysis, 6th ed.',
    )
  })

  it('warns and returns an empty plan for all-zero demand', () => {
    const result = periodOrderQuantity([0, 0, 0], {
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.value.orders).toEqual([])
    expect(result.value.totalCost).toBe(0)
    expect(result.warnings).toBeDefined()
  })

  it('never stocks out: cumulative receipts ≥ cumulative demand (property-ish)', () => {
    const demand = [5, 8, 0, 12, 3, 9, 1, 20]
    const result = periodOrderQuantity(demand, {
      setupCost: 50,
      holdingCostPerUnitPerPeriod: 1,
    })
    const received = new Array<number>(demand.length).fill(0)
    for (const o of result.value.orders) received[o.period] = (received[o.period] ?? 0) + o.quantity
    let cumRecv = 0
    let cumDem = 0
    for (let t = 0; t < demand.length; t++) {
      cumRecv += received[t] ?? 0
      cumDem += demand[t] ?? 0
      expect(cumRecv).toBeGreaterThanOrEqual(cumDem)
    }
  })

  it('throws when setup or holding cost is non-positive (EOQ undefined)', () => {
    expect(() =>
      periodOrderQuantity([10], { setupCost: 0, holdingCostPerUnitPerPeriod: 1 }),
    ).toThrow(/setupCost/)
    expect(() =>
      periodOrderQuantity([10], { setupCost: 100, holdingCostPerUnitPerPeriod: 0 }),
    ).toThrow(/holdingCostPerUnitPerPeriod/)
  })
})
