import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { fillRate } from './fill-rate'
import { type PolicyOptions, simulatePolicy } from './simulate-policy'

/**
 * A seeded PRNG, local to this test file on purpose.
 *
 * `simulatePolicy` is deterministic — it has no seed and no RNG — so the
 * randomness needed for a convergence study lives here, outside the API. This
 * is mulberry32, the same algorithm `@logistics-ts/core` uses for
 * `generateExampleData`, rather than a second PRNG design.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** One standard-normal sample via Box–Muller, shifted and scaled. */
function normal(r: () => number, mu: number, sd: number): number {
  let u = 0
  while (u === 0) u = r()
  const v = r()
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

describe('simulatePolicy', () => {
  it('asserts the documented @example outputs exactly (doctest)', () => {
    const sim = simulatePolicy({
      demand: [10, 10, 10, 10, 10, 10],
      policy: { policy: '(s,Q)', reorderPoint: 20, orderQuantity: 40 },
      initialOnHand: 50,
      leadTimePeriods: 1,
    })
    expect(sim.value.fillRate).toBe(1)
    expect(sim.value.orderCount).toBe(1)
    expect(sim.value.totalUnitsShort).toBe(0)
  })

  describe('worked traces (hand-derived, row for row)', () => {
    // onHand 50, s=20, Q=40, L=1, demand 10/period.
    //  t | recv | dem | onHand | position | order
    //  0 |   0  |  10 |   40   |    40    |   0    (40 > 20)
    //  1 |   0  |  10 |   30   |    30    |   0
    //  2 |   0  |  10 |   20   |    60    |  40    (20 <= 20 → 1 lot)
    //  3 |  40  |  10 |   50   |    50    |   0
    //  4 |   0  |  10 |   40   |    40    |   0
    //  5 |   0  |  10 |   30   |    30    |   0
    it('(s,Q): orders one lot when position touches the reorder point', () => {
      const sim = simulatePolicy({
        demand: [10, 10, 10, 10, 10, 10],
        policy: { policy: '(s,Q)', reorderPoint: 20, orderQuantity: 40 },
        initialOnHand: 50,
        leadTimePeriods: 1,
      })
      const rows = sim.value.rows
      expect(rows.map((r) => r.onHand)).toEqual([40, 30, 20, 50, 40, 30])
      expect(rows.map((r) => r.inventoryPosition)).toEqual([40, 30, 60, 50, 40, 30])
      expect(rows.map((r) => r.ordered)).toEqual([0, 0, 40, 0, 0, 0])
      expect(rows.map((r) => r.received)).toEqual([0, 0, 0, 40, 0, 0])
      expect(sim.value.averageOnHand).toBeCloseTo(35, 10)
    })

    // A stockout with backorders. onHand 20, s=10, Q=20, L=2.
    //  t | recv | dem | sat | short | onHand | BO | position | order
    //  0 |   0  |   5 |   5 |   0   |   15   |  0 |    15    |   0
    //  1 |   0  |   5 |   5 |   0   |   10   |  0 |    30    |  20  (10 <= 10)
    //  2 |   0  |  30 |  10 |  20   |    0   | 20 |    20    |  20  (pos 0 <= 10)
    //  3 |  20  |   5 |   0 |   5   |    0   |  5 |    15    |   0  (arrival cleared 20 BO)
    it('(s,Q): backorders the shortfall and clears it with the next arrival', () => {
      const sim = simulatePolicy({
        demand: [5, 5, 30, 5],
        policy: { policy: '(s,Q)', reorderPoint: 10, orderQuantity: 20 },
        initialOnHand: 20,
        leadTimePeriods: 2,
      })
      const rows = sim.value.rows
      expect(rows.map((r) => r.satisfied)).toEqual([5, 5, 10, 0])
      expect(rows.map((r) => r.short)).toEqual([0, 0, 20, 5])
      expect(rows.map((r) => r.backorders)).toEqual([0, 0, 20, 5])
      expect(rows.map((r) => r.onHand)).toEqual([15, 10, 0, 0])
      expect(sim.value.totalDemand).toBe(45)
      expect(sim.value.totalUnitsShort).toBe(25)
      expect(sim.value.fillRate).toBeCloseTo(20 / 45, 12)
      expect(sim.value.stockoutPeriods).toBe(2)
      expect(sim.value.orderCount).toBe(2)
      // One cycle completed (the arrival in period 3) and it had a stockout.
      expect(sim.value.cycleServiceLevel).toBe(0)
    })

    // onHand 20, R=3, S=40, L=1, demand 10/period. Reviews at t=0,3.
    it('(R,S): orders up to S only on review periods', () => {
      const sim = simulatePolicy({
        demand: [10, 10, 10, 10, 10, 10],
        policy: { policy: '(R,S)', reviewPeriods: 3, orderUpToLevel: 40 },
        initialOnHand: 20,
        leadTimePeriods: 1,
      })
      const rows = sim.value.rows
      expect(rows.map((r) => r.ordered)).toEqual([30, 0, 0, 30, 0, 0])
      expect(rows.map((r) => r.onHand)).toEqual([10, 30, 20, 10, 30, 20])
      expect(sim.value.orderCount).toBe(2)
      expect(sim.value.fillRate).toBe(1)
    })

    // onHand 30, R=2, s=25, S=45, L=1. Reviews at t=0,2,4; all trigger.
    it('(s,S): orders up to S only when the review finds position at or below s', () => {
      const sim = simulatePolicy({
        demand: [10, 10, 10, 10, 10, 10],
        policy: { policy: '(s,S)', reviewPeriods: 2, reorderPoint: 25, orderUpToLevel: 45 },
        initialOnHand: 30,
        leadTimePeriods: 1,
      })
      expect(sim.value.rows.map((r) => r.ordered)).toEqual([25, 0, 20, 0, 20, 0])
      expect(sim.value.orderCount).toBe(3)
      expect(sim.value.fillRate).toBe(1)
    })

    it('(s,S): a review above the trigger orders nothing', () => {
      const sim = simulatePolicy({
        demand: [1, 1, 1, 1],
        policy: { policy: '(s,S)', reviewPeriods: 2, reorderPoint: 5, orderUpToLevel: 50 },
        initialOnHand: 100,
      })
      expect(sim.value.rows.map((r) => r.ordered)).toEqual([0, 0, 0, 0])
      expect(sim.value.orderCount).toBe(0)
    })
  })

  // The classic inventory-simulation bug: reordering on ON-HAND rather than
  // inventory position re-orders every period until the first delivery lands,
  // because stock already in transit is invisible. With a 3-period lead time
  // this test sees 1 order; the buggy version sees 4.
  it('decides on inventory position, not on-hand, so in-transit stock is not ordered twice', () => {
    const sim = simulatePolicy({
      demand: [10, 0, 0, 0, 0],
      policy: { policy: '(s,Q)', reorderPoint: 95, orderQuantity: 50 },
      initialOnHand: 100,
      leadTimePeriods: 3,
    })
    expect(sim.value.orderCount).toBe(1)
    expect(sim.value.rows.map((r) => r.ordered)).toEqual([50, 0, 0, 0, 0])
  })

  it('orders enough whole lots to clear a deep deficit in one review', () => {
    // Position falls to -70 against s=0 with Q=25: ceil needs 3 lots (75).
    const sim = simulatePolicy({
      demand: [100],
      policy: { policy: '(s,Q)', reorderPoint: 0, orderQuantity: 25 },
      initialOnHand: 30,
      leadTimePeriods: 1,
    })
    // position after demand = 0 on-hand - 70 backorders = -70; 3 lots lifts to 5.
    expect(sim.value.rows[0]?.ordered).toBe(75)
    expect(sim.value.rows[0]?.inventoryPosition).toBe(5)
  })

  describe('lost sales', () => {
    it('never accrues backorders and reports the shortfall as gone', () => {
      const sim = simulatePolicy({
        demand: [5, 30, 5],
        policy: { policy: '(s,Q)', reorderPoint: 10, orderQuantity: 20 },
        initialOnHand: 20,
        leadTimePeriods: 2,
        unmetDemand: 'lost-sales',
      })
      expect(sim.value.rows.every((r) => r.backorders === 0)).toBe(true)
      expect(sim.value.totalUnitsShort).toBe(20)
      expect(sim.value.fillRate).toBeCloseTo(20 / 40, 12)
    })

    it('warns that the realised fill rate is not comparable to the analytic one', () => {
      const sim = simulatePolicy({
        demand: [1, 1],
        policy: { policy: '(s,Q)', reorderPoint: 1, orderQuantity: 1 },
        unmetDemand: 'lost-sales',
      })
      expect(sim.warnings?.some((w) => /not comparable to the analytic/i.test(w))).toBe(true)
    })
  })

  /**
   * THE correctness test: the simulation must converge on the analytic fill
   * rate this library already ships. Asserting a simulation against itself
   * proves nothing — the anchor has to be independently derived maths.
   *
   * ## Adjudicating the protection interval (measured, not assumed)
   *
   * `fillRate` is the continuous-review formula β = 1 − σ_L·G(z)/Q. Mapping it
   * onto this simulation needs the right protection interval, and the answer is
   * **L − 0.5 periods**, not L:
   *
   * An order placed at the end of period `t` arrives at the start of `t + L` and
   * covers that period's demand, so the stock on hand must bridge periods
   * `t+1 … t+L−1`. But the reorder point is crossed at a uniformly-distributed
   * moment *within* a period, which adds half a period on average. Measured
   * across z ∈ {−0.5, 0, 0.5, 1}, the L − 0.5 residuals were 2–5× smaller than
   * either L − 1 or L, and were the only ones that stayed small at every z.
   *
   * ## Why the low-undershoot regime
   *
   * The formula assumes the position lands exactly on `s`. With lumpy demand it
   * *undershoots* — it jumps past `s` — and the realised fill rate is then worse
   * than the formula predicts, badly so: at μ=100, σ=30, L=3, Q=150 the gap was
   * ~0.09. Small per-period demand relative to the protection interval (μ=1 over
   * ~20 periods) keeps mean undershoot near 0.5 units, where the formula holds.
   * This is a real limitation of the analytic model, not of the simulation.
   *
   * ## The tolerance, derived rather than tuned
   *
   * Measured over 8 seeds × 60 replications × 600 periods:
   *   analytic 0.981937 · simulated mean 0.980556 · seed-to-seed sd 0.000911
   *   systematic undershoot bias −0.001381
   * Band = |bias| + 4·sd = 0.001381 + 0.003644 ≈ 0.005.
   *
   * The seed is FIXED, so this test is deterministic and cannot flake; the band
   * above is what it would need if the seed were free. The flake budget for this
   * file is therefore zero.
   */
  it('converges on the analytic fillRate for (s,Q) — golden', () => {
    const MU = 1
    const SD = 0.3
    const LEAD = 21
    const Q = 30
    const protection = LEAD - 0.5
    const sigmaLeadTime = SD * Math.sqrt(protection)

    for (const z of [-0.5, 0, 0.5, 1]) {
      const s = protection * MU + z * sigmaLeadTime
      const analytic = fillRate({
        safetyStock: s - protection * MU,
        sigmaLeadTime,
        orderQuantity: Q,
      }).value.fillRate

      const r = rng(20260828)
      let served = 0
      let total = 0
      for (let rep = 0; rep < 40; rep++) {
        const demand = Array.from({ length: 600 }, () => Math.max(0, normal(r, MU, SD)))
        const sim = simulatePolicy({
          demand,
          policy: { policy: '(s,Q)', reorderPoint: s, orderQuantity: Q },
          initialOnHand: s,
          leadTimePeriods: LEAD,
          unmetDemand: 'backorder',
        })
        served += sim.value.totalDemand - sim.value.totalUnitsShort
        total += sim.value.totalDemand
      }
      const realised = served / total

      expect(Math.abs(realised - analytic)).toBeLessThan(0.005)
      // Undershoot can only ever hurt service, never help it, so the realised
      // value must not come out ABOVE the formula by more than noise. This is
      // the directional claim, and it is stronger than the symmetric band.
      expect(realised - analytic).toBeLessThan(0.004)
    }
  })

  it('brackets the analytic value between the L−1 and L protection intervals', () => {
    // A structural claim that needs no tuned tolerance: the true protection
    // interval lies strictly between the two whole-period candidates, so the
    // realised fill rate must too. If the sequence-of-events convention in the
    // implementation ever changes, this fails even if the band above still passes.
    const MU = 1
    const SD = 0.3
    const LEAD = 21
    const Q = 30
    const s = (LEAD - 0.5) * MU

    const r = rng(7)
    let served = 0
    let total = 0
    for (let rep = 0; rep < 40; rep++) {
      const demand = Array.from({ length: 600 }, () => Math.max(0, normal(r, MU, SD)))
      const sim = simulatePolicy({
        demand,
        policy: { policy: '(s,Q)', reorderPoint: s, orderQuantity: Q },
        initialOnHand: s,
        leadTimePeriods: LEAD,
      })
      served += sim.value.totalDemand - sim.value.totalUnitsShort
      total += sim.value.totalDemand
    }
    const realised = served / total

    const at = (n: number) =>
      fillRate({
        safetyStock: s - n * MU,
        sigmaLeadTime: SD * Math.sqrt(n),
        orderQuantity: Q,
      }).value.fillRate

    expect(realised).toBeLessThan(at(LEAD - 1))
    expect(realised).toBeGreaterThan(at(LEAD))
  })

  describe('properties', () => {
    const demandArb = fc.array(
      fc.integer({ min: 0, max: 5000 }).map((n) => n / 100),
      {
        minLength: 1,
        maxLength: 40,
      },
    )
    const policyArb: fc.Arbitrary<PolicyOptions> = fc.oneof(
      fc.record({
        policy: fc.constant('(s,Q)' as const),
        reorderPoint: fc.integer({ min: 0, max: 4000 }).map((n) => n / 100),
        orderQuantity: fc.integer({ min: 1, max: 4000 }).map((n) => n / 100),
      }),
      fc.record({
        policy: fc.constant('(R,S)' as const),
        reviewPeriods: fc.integer({ min: 1, max: 5 }),
        orderUpToLevel: fc.integer({ min: 0, max: 6000 }).map((n) => n / 100),
      }),
      fc
        .record({
          policy: fc.constant('(s,S)' as const),
          reviewPeriods: fc.integer({ min: 1, max: 5 }),
          reorderPoint: fc.integer({ min: 0, max: 3000 }).map((n) => n / 100),
          gap: fc.integer({ min: 0, max: 3000 }).map((n) => n / 100),
        })
        .map(({ gap, ...rest }) => ({ ...rest, orderUpToLevel: rest.reorderPoint + gap })),
    )
    const setupArb = fc.record({
      demand: demandArb,
      policy: policyArb,
      initialOnHand: fc.integer({ min: 0, max: 5000 }).map((n) => n / 100),
      leadTimePeriods: fc.integer({ min: 1, max: 6 }),
      unmetDemand: fc.constantFrom('backorder' as const, 'lost-sales' as const),
    })

    it('never reports negative on-hand, and satisfied + short always equals demand', () => {
      fc.assert(
        fc.property(setupArb, (setup) => {
          const sim = simulatePolicy(setup)
          for (const row of sim.value.rows) {
            expect(row.onHand).toBeGreaterThanOrEqual(0)
            expect(row.backorders).toBeGreaterThanOrEqual(0)
            expect(row.satisfied + row.short).toBeCloseTo(row.demand, 9)
          }
        }),
        { numRuns: 300 },
      )
    })

    it('reports a fill rate in [0, 1] that matches the per-row shortfalls', () => {
      fc.assert(
        fc.property(setupArb, (setup) => {
          const sim = simulatePolicy(setup)
          const { fillRate: f, totalDemand, totalUnitsShort, rows } = sim.value
          expect(f).toBeGreaterThanOrEqual(0)
          expect(f).toBeLessThanOrEqual(1)
          // Derived from the rows independently of the running totals, so this
          // constrains the aggregation rather than restating it.
          const shortFromRows = rows.reduce((sum, r) => sum + r.short, 0)
          expect(shortFromRows).toBeCloseTo(totalUnitsShort, 9)
          const demandFromRows = rows.reduce((sum, r) => sum + r.demand, 0)
          expect(demandFromRows).toBeCloseTo(totalDemand, 9)
        }),
        { numRuns: 300 },
      )
    })

    // Stock conservation. Note honestly what this does and does not guard: it
    // is derivable from the two state-update lines (`onHand += received −
    // clearing; onHand -= satisfied` and the matching backorder update) summed
    // over periods, so it CANNOT constrain the policy logic or the ordering
    // rule — a grid that ordered nothing at all would still satisfy it. It is
    // kept because it does pin those two updates against each other, which is
    // where a units-lost bug would live: a clearing deducted from backorders
    // but not from the arriving stock, or satisfied counted twice.
    //
    // The `cleared` term is the part that is easy to forget. A backorder
    // settled by a later arrival is NOT counted in `satisfied` — satisfied is
    // demand met from stock in the period it arose — so an equation without it
    // is wrong, which is exactly how this property first failed.
    it('conserves stock: opening + received = satisfied + backorders cleared + final on-hand', () => {
      fc.assert(
        fc.property(setupArb, (setup) => {
          const sim = simulatePolicy({ ...setup, unmetDemand: 'backorder' })
          const rows = sim.value.rows
          const last = rows[rows.length - 1]
          if (!last) return
          const received = rows.reduce((s, r) => s + r.received, 0)
          const satisfied = rows.reduce((s, r) => s + r.satisfied, 0)
          const cleared = sim.value.totalUnitsShort - last.backorders
          expect(setup.initialOnHand + received).toBeCloseTo(satisfied + cleared + last.onHand, 8)
        }),
        { numRuns: 300 },
      )
    })

    it('never leaves backorders under lost sales', () => {
      fc.assert(
        fc.property(setupArb, (setup) => {
          const sim = simulatePolicy({ ...setup, unmetDemand: 'lost-sales' })
          for (const row of sim.value.rows) expect(row.backorders).toBe(0)
        }),
        { numRuns: 200 },
      )
    })

    // Added after a Copilot review of PR #44 found that leadTimePeriods: 0 (then
    // the documented default) scheduled arrivals into the CURRENT period, whose
    // receive step had already run — so those orders were never received and sat
    // in on-order forever. Every property above stayed green: they all reason
    // about demand, on-hand and backorders, and stranded on-order stock violates
    // none of them. This one closes that blind spot by asserting the order
    // pipeline itself, and it fails on the original bug at every lead time.
    it('receives every order whose lead time lands inside the horizon', () => {
      fc.assert(
        fc.property(setupArb, (setup) => {
          const sim = simulatePolicy(setup)
          const horizon = sim.value.rows.length
          const lead = setup.leadTimePeriods
          const dueInside = sim.value.rows
            .filter((r) => r.period + lead < horizon)
            .reduce((sum, r) => sum + r.ordered, 0)
          const received = sim.value.rows.reduce((sum, r) => sum + r.received, 0)
          expect(received).toBeCloseTo(dueInside, 9)
        }),
        { numRuns: 300 },
      )
    })

    it('is monotone in the reorder point: a bigger buffer never fills less', () => {
      fc.assert(
        fc.property(
          demandArb,
          fc.integer({ min: 1, max: 3000 }).map((n) => n / 100),
          fc.integer({ min: 0, max: 2000 }).map((n) => n / 100),
          fc.integer({ min: 1, max: 4 }),
          (demand, orderQuantity, extra, leadTimePeriods) => {
            const base = simulatePolicy({
              demand,
              policy: { policy: '(s,Q)', reorderPoint: 10, orderQuantity },
              leadTimePeriods,
            })
            const raised = simulatePolicy({
              demand,
              policy: { policy: '(s,Q)', reorderPoint: 10 + extra, orderQuantity },
              leadTimePeriods,
            })
            expect(raised.value.totalUnitsShort).toBeLessThanOrEqual(
              base.value.totalUnitsShort + 1e-9,
            )
          },
        ),
        { numRuns: 300 },
      )
    })
  })

  describe('edge cases', () => {
    it('returns an empty record for an empty demand path', () => {
      const sim = simulatePolicy({
        demand: [],
        policy: { policy: '(s,Q)', reorderPoint: 5, orderQuantity: 5 },
      })
      expect(sim.value.rows).toEqual([])
      expect(sim.value.orderCount).toBe(0)
      expect(sim.value.averageOnHand).toBe(0)
    })

    it('reports fillRate 1 with a warning when there is no demand at all', () => {
      const sim = simulatePolicy({
        demand: [0, 0, 0],
        policy: { policy: '(R,S)', reviewPeriods: 2, orderUpToLevel: 10 },
      })
      expect(sim.value.fillRate).toBe(1)
      expect(sim.warnings?.some((w) => /total demand over the path is zero/i.test(w))).toBe(true)
    })

    it('warns when no order arrives inside the horizon, so alpha rests on no evidence', () => {
      const sim = simulatePolicy({
        demand: [10, 10],
        policy: { policy: '(s,Q)', reorderPoint: 100, orderQuantity: 10 },
        leadTimePeriods: 50,
      })
      expect(sim.value.orderCount).toBeGreaterThan(0)
      expect(sim.warnings?.some((w) => /none arrived within/i.test(w))).toBe(true)
    })

    it('rejects invalid demand, stock, lead time and policy parameters', () => {
      const ok: PolicyOptions = { policy: '(s,Q)', reorderPoint: 1, orderQuantity: 1 }
      expect(() => simulatePolicy({ demand: [1, -1], policy: ok })).toThrow(/demand\[1\]/)
      expect(() => simulatePolicy({ demand: [1, Number.NaN], policy: ok })).toThrow(/demand\[1\]/)
      expect(() => simulatePolicy({ demand: [1], policy: ok, initialOnHand: -5 })).toThrow(
        /initialOnHand/,
      )
      expect(() => simulatePolicy({ demand: [1], policy: ok, leadTimePeriods: 1.5 })).toThrow(
        /leadTimePeriods/,
      )
      expect(() => simulatePolicy({ demand: [1], policy: ok, leadTimePeriods: -1 })).toThrow(
        /leadTimePeriods/,
      )
      // 0 is rejected deliberately, not overlooked: ordering happens after demand
      // is met, so a 0-period lead time delivers the same service as 1 and would
      // only be a second spelling of it. The message has to say so.
      expect(() => simulatePolicy({ demand: [1], policy: ok, leadTimePeriods: 0 })).toThrow(
        /leadTimePeriods.*positive integer.*same service as 1/s,
      )
      expect(() =>
        simulatePolicy({
          demand: [1],
          policy: { policy: '(s,Q)', reorderPoint: 1, orderQuantity: 0 },
        }),
      ).toThrow(/orderQuantity/)
      expect(() =>
        simulatePolicy({
          demand: [1],
          policy: { policy: '(R,S)', reviewPeriods: 0, orderUpToLevel: 5 },
        }),
      ).toThrow(/reviewPeriods/)
      expect(() =>
        simulatePolicy({
          demand: [1],
          policy: { policy: '(s,S)', reviewPeriods: 2, reorderPoint: 10, orderUpToLevel: 5 },
        }),
      ).toThrow(/must be >= policy\.reorderPoint/)
      expect(() =>
        simulatePolicy({ demand: [1], policy: { policy: 'nope' } as unknown as PolicyOptions }),
      ).toThrow(/unknown policy/)
      expect(() =>
        simulatePolicy({ demand: [1], policy: ok, unmetDemand: 'x' as unknown as 'backorder' }),
      ).toThrow(/unmetDemand/)
    })
  })

  it('exposes the explanation contract', () => {
    const sim = simulatePolicy({
      demand: [10, 10, 10],
      policy: { policy: '(s,Q)', reorderPoint: 5, orderQuantity: 20 },
      initialOnHand: 15,
      leadTimePeriods: 1,
    })
    expect(sim.method).toBe('simulate-policy')
    expect(sim.inputs.policy).toBe('(s,Q)')
    expect(sim.inputs.periods).toBe(3)
    expect(sim.inputs.reorderPoint).toBe(5)
    expect(sim.inputs.orderQuantity).toBe(20)
    expect(sim.citations?.[0]).toMatch(/Silver, Pyke & Thomas/)
    expect(sim.reasoning.some((r) => /INVENTORY POSITION/.test(r))).toBe(true)
  })
})
