import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { accumulateLotCost } from './cost'
import { lotForLot } from './lot-for-lot'
import { periodOrderQuantity } from './period-order-quantity'
import type { LotSizingCostParams } from './types'
import { wagnerWhitin } from './wagner-whitin'

/**
 * Minimum cost over ALL 2^T subsets of order periods, scored with the same
 * `accumulateLotCost` model that `wagnerWhitin` reports — an exhaustive,
 * obviously-correct reference for the DP to be checked against.
 *
 * Infeasible subsets are filtered: demand falling before the first order is
 * never covered, and `accumulateLotCost` would still happily price such a plan
 * (understating its cost, since uncovered demand contributes no holding). Not
 * filtering would let a stockout masquerade as a cheaper plan and make this
 * bound dishonest.
 */
function bruteForceOptimalCost(demand: readonly number[], options: LotSizingCostParams): number {
  const horizon = demand.length
  const firstPositive = demand.findIndex((d) => d > 0)
  let best = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 1 << horizon; mask++) {
    const orderPeriods: number[] = []
    for (let i = 0; i < horizon; i++) {
      if ((mask & (1 << i)) !== 0) orderPeriods.push(i)
    }
    if (firstPositive !== -1) {
      const first = orderPeriods[0]
      if (first === undefined || first > firstPositive) continue
    }
    const cost = accumulateLotCost(demand, orderPeriods, options).totalCost
    if (cost < best) best = cost
  }
  return best
}

describe('wagnerWhitin', () => {
  it('reproduces Snyder & Shen FoSCT 2e Example 3.9 (stockpyl wagner_whitin)', () => {
    // demand [90,120,80,70], S=500, h=2 → order 210 @p0 (covers p0-p1) and
    // 150 @p2 (covers p2-p3). setup 2×500 = 1000; holding 2·(1·120) + 2·(1·70)
    // = 240 + 140 = 380; total 1380 — stockpyl reports cost 1380.0.
    const result = wagnerWhitin([90, 120, 80, 70], {
      setupCost: 500,
      holdingCostPerUnitPerPeriod: 2,
    })
    expect(result.value.orders).toEqual([
      { period: 0, quantity: 210 },
      { period: 2, quantity: 150 },
    ])
    expect(result.value.totalCost).toBe(1380)
  })

  it('asserts the documented @example outputs exactly (doctest)', () => {
    expect(
      wagnerWhitin([90, 120, 80, 70], { setupCost: 500, holdingCostPerUnitPerPeriod: 2 }).value,
    ).toEqual({
      orders: [
        { period: 0, quantity: 210 },
        { period: 2, quantity: 150 },
      ],
      totalCost: 1380,
      setupCost: 1000,
      holdingCost: 380,
    })
  })

  it('exposes the explanation contract, naming the chosen runs and optimality', () => {
    const result = wagnerWhitin([90, 120, 80, 70], {
      setupCost: 500,
      holdingCostPerUnitPerPeriod: 2,
    })
    expect(result.method).toBe('wagner-whitin')
    expect(result.inputs.orders).toBe(2)
    expect(result.reasoning).toContain('order 210 at period 0 covers periods 0–1')
    expect(result.reasoning).toContain('order 150 at period 2 covers periods 2–3')
    expect(result.reasoning.some((r) => r.includes('provably optimal'))).toBe(true)
    expect(result.citations).toContain(
      'Wagner, H.M. & Whitin, T.M. (1958), Management Science 5(1), 89-96',
    )
  })

  it('collapses to a single order when setup dominates holding', () => {
    // Huge S, tiny h → one order covering the whole horizon is cheapest:
    // holding = 0.01·(1·10 + 2·10) = 0.3, setup 1000 → 1000.3.
    const result = wagnerWhitin([10, 10, 10], {
      setupCost: 1000,
      holdingCostPerUnitPerPeriod: 0.01,
    })
    expect(result.value.orders).toEqual([{ period: 0, quantity: 30 }])
    expect(result.value.totalCost).toBeCloseTo(1000.3, 9)
  })

  it('degenerates to lot-for-lot when holding dominates setup', () => {
    // Tiny S, huge h → never carry: order every period.
    const demand = [10, 20, 30]
    const result = wagnerWhitin(demand, { setupCost: 1, holdingCostPerUnitPerPeriod: 1000 })
    expect(result.value.orders).toEqual([
      { period: 0, quantity: 10 },
      { period: 1, quantity: 20 },
      { period: 2, quantity: 30 },
    ])
    expect(result.value.holdingCost).toBe(0)
    expect(result.value.totalCost).toBe(3)
  })

  it('places no order in zero-demand periods', () => {
    const result = wagnerWhitin([0, 0, 10], { setupCost: 5, holdingCostPerUnitPerPeriod: 1000 })
    expect(result.value.orders).toEqual([{ period: 2, quantity: 10 }])
    expect(result.value.totalCost).toBe(5)
  })

  it('returns an empty plan for empty and all-zero demand', () => {
    expect(wagnerWhitin([], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 }).value).toEqual({
      orders: [],
      totalCost: 0,
      setupCost: 0,
      holdingCost: 0,
    })
    expect(
      wagnerWhitin([0, 0], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 }).value.orders,
    ).toEqual([])
  })

  it('throws naming the offending field on invalid input', () => {
    expect(() => wagnerWhitin([10], { setupCost: -1, holdingCostPerUnitPerPeriod: 1 })).toThrow(
      /setupCost/,
    )
    expect(() =>
      wagnerWhitin([10, -5], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 }),
    ).toThrow(/demand\[1\]/)
  })

  it('never stocks out: cumulative receipts ≥ cumulative demand (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 100 }), { minLength: 1, maxLength: 10 }),
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        (demand, setupCost, holdingCostPerUnitPerPeriod) => {
          const { orders } = wagnerWhitin(demand, {
            setupCost,
            holdingCostPerUnitPerPeriod,
          }).value
          const received = new Array<number>(demand.length).fill(0)
          for (const o of orders) received[o.period] = (received[o.period] ?? 0) + o.quantity
          let cumRecv = 0
          let cumDem = 0
          for (let t = 0; t < demand.length; t++) {
            cumRecv += received[t] ?? 0
            cumDem += demand[t] ?? 0
            expect(cumRecv).toBeGreaterThanOrEqual(cumDem)
          }
          // WW leaves no surplus: total ordered equals total demand.
          expect(cumRecv).toBe(cumDem)
        },
      ),
    )
  })

  it('is exactly optimal: equals brute force over all 2^T order subsets (property)', () => {
    // THE guard for the "provably optimal" claim this function makes to agents in
    // its reasoning[]. Do not "simplify" this away in favour of the cheaper
    // WW ≤ heuristic bound below — that bound cannot guard this claim, because
    // lot-for-lot and POQ are typically FAR from optimal, so a subtle off-by-one
    // in the DP's holding coefficient would still comfortably beat both and pass.
    //
    // Scoring every feasible candidate with the REPORTED cost model is deliberate
    // and pins two things at once:
    //   1. the DP genuinely minimises (not merely beats some heuristic), and
    //   2. the DP's INTERNAL incremental run-holding recurrence (kept O(T²)) and
    //      the accumulateLotCost expression it REPORTS agree — this function is
    //      the one place two cost expressions coexist, so nothing else pins that.
    // The demand generator must keep emitting zero-demand periods: the skipped
    // zero-demand run is exactly where the two attributions could diverge.
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            { weight: 3, arbitrary: fc.constant(0) },
            { weight: 7, arbitrary: fc.integer({ min: 1, max: 50 }) },
          ),
          { minLength: 1, maxLength: 8 },
        ),
        fc.double({ min: 1, max: 500, noNaN: true }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (demand, setupCost, holdingCostPerUnitPerPeriod) => {
          const options = { setupCost, holdingCostPerUnitPerPeriod }
          const ww = wagnerWhitin(demand, options).value.totalCost
          const brute = bruteForceOptimalCost(demand, options)
          // Tolerance absorbs float accumulation order between two summation
          // routes only; a real coefficient error is orders of magnitude larger.
          expect(Math.abs(ww - brute)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(brute)))
        },
      ),
    )
  })

  it('is optimal: never costs more than lot-for-lot or POQ (property)', () => {
    // WW minimises over ALL feasible plans (the zero-inventory property makes the
    // DP's search exhaustive), so every other rule's plan is an upper bound on it.
    // A violation here means the DP is wrong.
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 100 }), { minLength: 1, maxLength: 10 }),
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        (demand, setupCost, holdingCostPerUnitPerPeriod) => {
          // POQ needs a positive mean demand for its EOQ anchor to be defined.
          fc.pre(demand.some((d) => d > 0))
          const options = { setupCost, holdingCostPerUnitPerPeriod }
          const ww = wagnerWhitin(demand, options).value.totalCost
          // Tolerance absorbs float accumulation order, not a real cost gap.
          const tol = 1e-9 * Math.max(1, Math.abs(ww))
          expect(ww).toBeLessThanOrEqual(lotForLot(demand, options).value.totalCost + tol)
          expect(ww).toBeLessThanOrEqual(periodOrderQuantity(demand, options).value.totalCost + tol)
        },
      ),
    )
  })
})
