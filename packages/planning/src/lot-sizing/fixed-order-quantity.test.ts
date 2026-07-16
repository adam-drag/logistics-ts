import { describe, expect, it } from 'vitest'
import { fixedOrderQuantity } from './fixed-order-quantity'

describe('fixedOrderQuantity', () => {
  it('orders whole lots and carries remainder (Nahmias FOQ example)', () => {
    // Nahmias (2009), dynamic lot sizing — fixed order quantity.
    // demand [10,20,30,40], Q=50, hand-simulated end-of-period on-hand:
    //   p0: 0<10 → order 50, on-hand 0+50-10 = 40
    //   p1: 40≥20 → no order, on-hand 40-20 = 20
    //   p2: 20<30 → order 50, on-hand 20+50-30 = 40
    //   p3: 40≥40 → no order, on-hand 40-40 = 0
    // on-hand [40,20,40,0] → holding 1·100 = 100, 2 setups × 100 = 200, total 300.
    const result = fixedOrderQuantity([10, 20, 30, 40], {
      orderQuantity: 50,
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.value.orders).toEqual([
      { period: 0, quantity: 50 },
      { period: 2, quantity: 50 },
    ])
    expect(result.value.holdingCost).toBe(100)
    expect(result.value.setupCost).toBe(200)
    expect(result.value.totalCost).toBe(300)
  })

  it('asserts the documented @example outputs exactly (doctest)', () => {
    expect(
      fixedOrderQuantity([10, 20, 30, 40], {
        orderQuantity: 50,
        setupCost: 100,
        holdingCostPerUnitPerPeriod: 1,
      }).value,
    ).toEqual({
      orders: [
        { period: 0, quantity: 50 },
        { period: 2, quantity: 50 },
      ],
      totalCost: 300,
      setupCost: 200,
      holdingCost: 100,
    })
  })

  it('orders multiple whole lots when one is not enough', () => {
    // demand 120 in p0, Q=50 → ⌈120/50⌉ = 3 lots = 150.
    const result = fixedOrderQuantity([120], {
      orderQuantity: 50,
      setupCost: 10,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.value.orders).toEqual([{ period: 0, quantity: 150 }])
    // end-of-period on-hand p0 = 150 - 120 = 30 → holding 30.
    expect(result.value.holdingCost).toBe(30)
    expect(result.value.setupCost).toBe(10)
    expect(result.value.totalCost).toBe(40)
  })

  it('exposes the explanation contract', () => {
    const result = fixedOrderQuantity([10, 20, 30, 40], {
      orderQuantity: 50,
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.method).toBe('fixed-order-quantity')
    expect(result.inputs.orderQuantity).toBe(50)
    expect(result.inputs.orders).toBe(2)
    expect(result.citations).toContain(
      'Nahmias, S. (2009), Production and Operations Analysis, 6th ed.',
    )
  })

  it('returns an empty plan for all-zero demand', () => {
    const result = fixedOrderQuantity([0, 0], {
      orderQuantity: 50,
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.value.orders).toEqual([])
    expect(result.value.totalCost).toBe(0)
  })

  it('throws naming the offending field on invalid input', () => {
    expect(() =>
      fixedOrderQuantity([10], {
        orderQuantity: 0,
        setupCost: 100,
        holdingCostPerUnitPerPeriod: 1,
      }),
    ).toThrow(/orderQuantity/)
    expect(() =>
      fixedOrderQuantity([10, -5], {
        orderQuantity: 50,
        setupCost: 100,
        holdingCostPerUnitPerPeriod: 1,
      }),
    ).toThrow(/demand\[1\]/)
  })
})
