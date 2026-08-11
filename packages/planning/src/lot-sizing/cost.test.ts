import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { accumulateLotCost, simulateLotCost } from './cost'
import type { PlannedOrder } from './types'

describe('accumulateLotCost', () => {
  it('charges end-of-period holding on carried inventory (one order over [10,20,30], h=1)', () => {
    // Single order in period 0 covering all three periods. Under the
    // end-of-period convention each unit is held one period per period carried:
    //   d0=10 consumed on arrival  -> 0 periods -> 0
    //   d1=20 held 1 period        -> 1·20 = 20
    //   d2=30 held 2 periods       -> 2·30 = 60
    // holding = h·(20 + 60) = 1·80 = 80; one setup S = 100 -> total 180.
    const cost = accumulateLotCost([10, 20, 30], [0], {
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(cost.holdingCost).toBe(80)
    expect(cost.setupCost).toBe(100)
    expect(cost.totalCost).toBe(180)
  })

  it('resets holding at each order boundary (order per period → zero holding)', () => {
    const cost = accumulateLotCost([10, 20, 30], [0, 1, 2], {
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(cost.holdingCost).toBe(0)
    expect(cost.setupCost).toBe(300)
    expect(cost.totalCost).toBe(300)
  })

  it('scales holding linearly with the holding rate h', () => {
    const cost = accumulateLotCost([10, 20, 30], [0], {
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 3,
    })
    expect(cost.holdingCost).toBe(240) // 3 · 80
    expect(cost.totalCost).toBe(340) // 100 + 240
  })

  it('always satisfies totalCost = setupCost + holdingCost (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 500 }), { minLength: 1, maxLength: 12 }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        (demand, setupCost, holdingCostPerUnitPerPeriod) => {
          // Order in every period → a valid, in-range, ascending order set.
          const orderPeriods = demand.map((_, i) => i)
          const cost = accumulateLotCost(demand, orderPeriods, {
            setupCost,
            holdingCostPerUnitPerPeriod,
          })
          expect(cost.totalCost).toBeCloseTo(cost.setupCost + cost.holdingCost, 9)
          expect(cost.holdingCost).toBeGreaterThanOrEqual(0)
        },
      ),
    )
  })
})

describe('simulateLotCost', () => {
  it('charges holding on remainder inventory a fixed lot leaves behind', () => {
    // Fixed lot of 50 against demand [10,20,30,40]: orders 50@p0, 50@p2.
    // end-of-period on-hand: p0 50-10=40, p1 40-20=20, p2 20+50-30=40, p3 40-40=0.
    // holding = 1·(40+20+40+0) = 100, 2 setups × 100 = 200, total 300.
    const orders: PlannedOrder[] = [
      { period: 0, quantity: 50 },
      { period: 2, quantity: 50 },
    ]
    const cost = simulateLotCost([10, 20, 30, 40], orders, {
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(cost.holdingCost).toBe(100)
    expect(cost.setupCost).toBe(200)
    expect(cost.totalCost).toBe(300)
  })

  it('throws on an order period outside [0, demand.length) rather than charging a phantom setup', () => {
    // An unreceivable order must not silently cost a setup while never arriving.
    expect(() =>
      simulateLotCost([10], [{ period: 99, quantity: 50 }], {
        setupCost: 100,
        holdingCostPerUnitPerPeriod: 1,
      }),
    ).toThrow(/orders\[0\]\.period/)
    expect(() =>
      simulateLotCost([10], [{ period: -1, quantity: 50 }], {
        setupCost: 100,
        holdingCostPerUnitPerPeriod: 1,
      }),
    ).toThrow(/orders\[0\]\.period/)
  })

  it('throws on a non-integer or non-finite order period', () => {
    expect(() =>
      simulateLotCost([10, 20], [{ period: 0.5, quantity: 50 }], {
        setupCost: 100,
        holdingCostPerUnitPerPeriod: 1,
      }),
    ).toThrow(/orders\[0\]\.period/)
    expect(() =>
      simulateLotCost([10, 20], [{ period: Number.NaN, quantity: 50 }], {
        setupCost: 100,
        holdingCostPerUnitPerPeriod: 1,
      }),
    ).toThrow(/orders\[0\]\.period/)
  })

  it('sums multiple orders received in the same period', () => {
    // 30 + 20 received at p0 against demand 40 → end-of-period on-hand 10.
    const cost = simulateLotCost(
      [40],
      [
        { period: 0, quantity: 30 },
        { period: 0, quantity: 20 },
      ],
      { setupCost: 100, holdingCostPerUnitPerPeriod: 1 },
    )
    expect(cost.holdingCost).toBe(10)
    expect(cost.setupCost).toBe(200) // two orders, two setups
  })

  it('agrees with the coverage form when order qty = covered demand', () => {
    // Orders equal to each covered block → the two conventions must coincide.
    const demand = [10, 20, 30, 40]
    const orders: PlannedOrder[] = [
      { period: 0, quantity: 60 }, // covers p0..p2
      { period: 3, quantity: 40 }, // covers p3
    ]
    const sim = simulateLotCost(demand, orders, { setupCost: 100, holdingCostPerUnitPerPeriod: 1 })
    const cov = accumulateLotCost(demand, [0, 3], {
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
    })
    expect(sim.holdingCost).toBe(cov.holdingCost)
    expect(sim.totalCost).toBe(cov.totalCost)
  })
})
