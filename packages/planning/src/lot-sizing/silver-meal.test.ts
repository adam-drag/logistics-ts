import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { leastUnitCost } from './least-unit-cost'
import { silverMeal } from './silver-meal'
import { wagnerWhitin } from './wagner-whitin'

describe('silverMeal', () => {
  it('extends a run while average cost per period falls (hand-derived trace)', () => {
    // HAND-DERIVED, not a textbook golden. demand [20,10,5,40], S=50, h=1.
    // Run started at p0, criterion = (S + h·Σ i·d_{t+i}) / periods:
    //   cover p0        : 50 / 1                       = 50
    //   cover p0-p1     : (50 + 1·10) / 2      = 60/2  = 30    ↓ extend
    //   cover p0-p2     : (50 + 10 + 2·5) / 3  = 70/3  = 23.33 ↓ extend
    //   cover p0-p3     : (50 + 20 + 3·40) / 4 = 190/4 = 47.5  ↑ STOP
    // → order 20+10+5 = 35 @p0 covering p0-p2; then a run at p3 → 40 @p3.
    // setup 2×50 = 100; holding 1·(1·10 + 2·5) = 20; total 120.
    const result = silverMeal([20, 10, 5, 40], {
      setupCost: 50,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.value.orders).toEqual([
      { period: 0, quantity: 35 },
      { period: 3, quantity: 40 },
    ])
    expect(result.value.setupCost).toBe(100)
    expect(result.value.holdingCost).toBe(20)
    expect(result.value.totalCost).toBe(120)
  })

  it('asserts the documented @example outputs exactly (doctest)', () => {
    expect(
      silverMeal([20, 10, 5, 40], { setupCost: 50, holdingCostPerUnitPerPeriod: 1 }).value,
    ).toEqual({
      orders: [
        { period: 0, quantity: 35 },
        { period: 3, quantity: 40 },
      ],
      totalCost: 120,
      setupCost: 100,
      holdingCost: 20,
    })
  })

  it('is strictly worse than Wagner-Whitin on demand that defeats the greedy stop', () => {
    // THE test that proves silverMeal is a genuinely distinct implementation and
    // not accidentally re-deriving the DP. demand [10,20,30,40], S=100, h=1.
    // Silver-Meal (hand-derived): avg 100 → 60 → 60 (tie, extends) → 75 rises,
    //   so it covers p0-p2 (qty 60), then 40 @p3.
    //   setup 200 + holding 1·(1·20 + 2·30) = 80 → 280.
    // Wagner-Whitin's optimum is 260 (orders 30 @p0 covering p0-p1, 70 @p2
    //   covering p2-p3: setup 200 + holding 1·20 + 1·40 = 60).
    // The greedy rule cannot see that accepting a locally worse first run pays off.
    const options = { setupCost: 100, holdingCostPerUnitPerPeriod: 1 }
    const sm = silverMeal([10, 20, 30, 40], options)
    const ww = wagnerWhitin([10, 20, 30, 40], options)

    expect(sm.value.orders).toEqual([
      { period: 0, quantity: 60 },
      { period: 3, quantity: 40 },
    ])
    expect(sm.value.totalCost).toBe(280)
    expect(ww.value.totalCost).toBe(260)
    expect(ww.value.totalCost).toBeLessThan(sm.value.totalCost)
  })

  it('exposes the explanation contract and does NOT claim optimality', () => {
    const result = silverMeal([20, 10, 5, 40], {
      setupCost: 50,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(result.method).toBe('silver-meal')
    expect(result.inputs.orders).toBe(2)
    expect(result.citations).toContain(
      'Silver, E.A. & Meal, H.C. (1973), Production and Inventory Management 14(2), 64-74',
    )
    // The prose must stay honest about being a heuristic.
    expect(result.reasoning.some((r) => r.includes('NOT optimal'))).toBe(true)
  })

  it('absorbs zero-demand periods into the current run', () => {
    // demand [10,0,20], S=100, h=1. A zero-demand period adds no cost, so the
    // average per period can only fall: 100 → 100/2 = 50 → (100+2·20)/3 = 46.67.
    // One order of 30 @p0; holding 1·(1·0 + 2·20) = 40; total 140.
    const result = silverMeal([10, 0, 20], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 })
    expect(result.value.orders).toEqual([{ period: 0, quantity: 30 }])
    expect(result.value.holdingCost).toBe(40)
    expect(result.value.totalCost).toBe(140)
  })

  it('handles single-period, empty, and all-zero horizons', () => {
    expect(silverMeal([25], { setupCost: 70, holdingCostPerUnitPerPeriod: 1 }).value).toEqual({
      orders: [{ period: 0, quantity: 25 }],
      totalCost: 70,
      setupCost: 70,
      holdingCost: 0,
    })
    expect(silverMeal([], { setupCost: 70, holdingCostPerUnitPerPeriod: 1 }).value.orders).toEqual(
      [],
    )
    expect(silverMeal([0, 0, 0], { setupCost: 70, holdingCostPerUnitPerPeriod: 1 }).value).toEqual({
      orders: [],
      totalCost: 0,
      setupCost: 0,
      holdingCost: 0,
    })
  })

  it('throws naming the offending field on invalid input', () => {
    expect(() => silverMeal([10], { setupCost: -1, holdingCostPerUnitPerPeriod: 1 })).toThrow(
      /setupCost/,
    )
    expect(() => silverMeal([10, -5], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 })).toThrow(
      /demand\[1\]/,
    )
  })
})

describe('heuristics vs the Wagner-Whitin optimum', () => {
  it('WW never costs more than silverMeal or leastUnitCost (property)', () => {
    // WW is the proven optimum over all feasible plans, so each heuristic's plan
    // is an upper bound on it. A violation means the heuristic produced an
    // infeasible or mis-costed plan (e.g. a run that fails to cover its demand).
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            { weight: 3, arbitrary: fc.constant(0) },
            { weight: 7, arbitrary: fc.integer({ min: 1, max: 100 }) },
          ),
          { minLength: 1, maxLength: 12 },
        ),
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        (demand, setupCost, holdingCostPerUnitPerPeriod) => {
          const options = { setupCost, holdingCostPerUnitPerPeriod }
          const ww = wagnerWhitin(demand, options).value.totalCost
          const tol = 1e-9 * Math.max(1, Math.abs(ww))
          expect(ww).toBeLessThanOrEqual(silverMeal(demand, options).value.totalCost + tol)
          expect(ww).toBeLessThanOrEqual(leastUnitCost(demand, options).value.totalCost + tol)
        },
      ),
    )
  })

  it('every heuristic plan covers all demand without stocking out (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            { weight: 3, arbitrary: fc.constant(0) },
            { weight: 7, arbitrary: fc.integer({ min: 1, max: 100 }) },
          ),
          { minLength: 1, maxLength: 12 },
        ),
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        (demand, setupCost, holdingCostPerUnitPerPeriod) => {
          const options = { setupCost, holdingCostPerUnitPerPeriod }
          for (const plan of [silverMeal(demand, options), leastUnitCost(demand, options)]) {
            const received = new Array<number>(demand.length).fill(0)
            for (const o of plan.value.orders) {
              received[o.period] = (received[o.period] ?? 0) + o.quantity
            }
            let cumRecv = 0
            let cumDem = 0
            for (let t = 0; t < demand.length; t++) {
              cumRecv += received[t] ?? 0
              cumDem += demand[t] ?? 0
              expect(cumRecv).toBeGreaterThanOrEqual(cumDem)
            }
            // Both rules order exactly their covered demand — no surplus.
            expect(cumRecv).toBe(cumDem)
          }
        },
      ),
    )
  })
})
