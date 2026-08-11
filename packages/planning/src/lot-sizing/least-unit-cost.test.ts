import { describe, expect, it } from 'vitest'
import { leastUnitCost } from './least-unit-cost'
import { silverMeal } from './silver-meal'
import { wagnerWhitin } from './wagner-whitin'

describe('leastUnitCost', () => {
  it('extends a run while cost per unit falls (hand-derived trace)', () => {
    // HAND-DERIVED, not a textbook golden. demand [30,10,50], S=60, h=1.
    // Run started at p0, criterion = (S + h·Σ i·d_{t+i}) / units covered:
    //   cover p0    : 60 / 30                        = 2.0    (start)
    //   cover p0-p1 : (60 + 1·10) / 40      = 70/40  = 1.75   ↓ extend
    //   cover p0-p2 : (60 + 10 + 2·50) / 90 = 170/90 = 1.889  ↑ STOP
    // → order 30+10 = 40 @p0 covering p0-p1; then a run at p2 → 50 @p2.
    // setup 2×60 = 120; holding 1·(1·10) = 10; total 130.
    const result = leastUnitCost([30, 10, 50], {
      setupCost: 60,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.value.orders).toEqual([
      { period: 0, quantity: 40 },
      { period: 2, quantity: 50 },
    ])
    expect(result.value.setupCost).toBe(120)
    expect(result.value.holdingCost).toBe(10)
    expect(result.value.totalCost).toBe(130)
  })

  it('asserts the documented @example outputs exactly (doctest)', () => {
    expect(
      leastUnitCost([30, 10, 50], { setupCost: 60, holdingCostPerUnitPerPeriod: 1 }).value,
    ).toEqual({
      orders: [
        { period: 0, quantity: 40 },
        { period: 2, quantity: 50 },
      ],
      totalCost: 130,
      setupCost: 120,
      holdingCost: 10,
    })
  })

  it('is strictly worse than Wagner-Whitin on demand that defeats the greedy stop', () => {
    // demand [10,20,30,40], S=100, h=1. LUC (hand-derived), criterion per unit:
    //   cover p0    : 100/10                        = 10
    //   cover p0-p1 : (100 + 20)/30         = 120/30 = 4      ↓
    //   cover p0-p2 : (100 + 20 + 60)/60    = 180/60 = 3      ↓
    //   cover p0-p3 : (100 + 80 + 120)/100  = 300/100 = 3     tie → extends
    // → one order of 100 @p0; holding 1·(1·20 + 2·30 + 3·40) = 200; total 300.
    // Wagner-Whitin's optimum is 260, so LUC is strictly worse here.
    const options = { setupCost: 100, holdingCostPerUnitPerPeriod: 1 }
    const luc = leastUnitCost([10, 20, 30, 40], options)
    const ww = wagnerWhitin([10, 20, 30, 40], options)

    expect(luc.value.orders).toEqual([{ period: 0, quantity: 100 }])
    expect(luc.value.totalCost).toBe(300)
    expect(ww.value.totalCost).toBe(260)
    expect(ww.value.totalCost).toBeLessThan(luc.value.totalCost)
  })

  it('differs from silverMeal when demand is uneven across the run', () => {
    // The two criteria genuinely diverge: on [10,20,30,40] cost-per-period stops
    // after p0-p2 (280) while cost-per-unit runs to the horizon end (300).
    const options = { setupCost: 100, holdingCostPerUnitPerPeriod: 1 }
    const sm = silverMeal([10, 20, 30, 40], options)
    const luc = leastUnitCost([10, 20, 30, 40], options)
    expect(luc.value.orders).not.toEqual(sm.value.orders)
    expect(luc.value.totalCost).not.toBe(sm.value.totalCost)
  })

  it('exposes the explanation contract and does NOT claim optimality', () => {
    const result = leastUnitCost([30, 10, 50], {
      setupCost: 60,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.method).toBe('least-unit-cost')
    expect(result.inputs.orders).toBe(2)
    expect(result.citations).toContain(
      'Nahmias, S. (2009), Production and Operations Analysis, 6th ed.',
    )
    expect(result.reasoning.some((r) => r.includes('NOT optimal'))).toBe(true)
  })

  it('absorbs zero-demand periods without dividing by zero', () => {
    // A zero-demand period leaves cost and units unchanged → an exact tie, which
    // extends the run. A run never STARTS on a zero-demand period, so the
    // cost-per-unit divisor is always positive.
    const result = leastUnitCost([10, 0, 20], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 })
    expect(result.value.orders).toEqual([{ period: 0, quantity: 30 }])
    expect(Number.isFinite(result.value.totalCost)).toBe(true)
    expect(result.value.totalCost).toBe(140)
  })

  it('handles single-period, empty, and all-zero horizons', () => {
    expect(leastUnitCost([25], { setupCost: 70, holdingCostPerUnitPerPeriod: 1 }).value).toEqual({
      orders: [{ period: 0, quantity: 25 }],
      totalCost: 70,
      setupCost: 70,
      holdingCost: 0,
    })
    expect(
      leastUnitCost([], { setupCost: 70, holdingCostPerUnitPerPeriod: 1 }).value.orders,
    ).toEqual([])
    expect(leastUnitCost([0, 0], { setupCost: 70, holdingCostPerUnitPerPeriod: 1 }).value).toEqual({
      orders: [],
      totalCost: 0,
      setupCost: 0,
      holdingCost: 0,
    })
  })

  it('throws naming the offending field on invalid input', () => {
    expect(() => leastUnitCost([10], { setupCost: -1, holdingCostPerUnitPerPeriod: 1 })).toThrow(
      /setupCost/,
    )
    expect(() =>
      leastUnitCost([10, -5], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 }),
    ).toThrow(/demand\[1\]/)
  })
})
