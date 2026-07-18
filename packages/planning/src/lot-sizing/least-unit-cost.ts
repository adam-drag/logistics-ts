/**
 * The least-unit-cost (LUC) heuristic for dynamic lot sizing: greedily extend an
 * order's coverage while the cost *per unit* keeps falling.
 *
 * @see Nahmias, S. (2009). Production and Operations Analysis, 6th ed.,
 *   McGraw-Hill — dynamic lot sizing (least unit cost).
 */
import { explain } from '@logistics-ts/core'
import { round } from '../round'
import { accumulateLotCost } from './cost'
import { greedyLotRuns } from './greedy'
import type { LotPlan, LotSizingCostParams } from './types'
import { requireNonNegative } from './validate'

/** Options for {@link leastUnitCost}: the setup and holding cost parameters. */
export type LeastUnitCostOptions = LotSizingCostParams

/**
 * Least-unit-cost lot sizing. Structurally identical to {@link silverMeal} — a
 * greedy forward run extension — but the criterion divides by the **units
 * covered** rather than the **periods** covered, so it favours runs that spread
 * the setup cost over more demand rather than over more time. The two rules
 * therefore disagree whenever demand is uneven across the run.
 *
 * Formula: for a run started at `t` covering `k+1` periods, the criterion is
 * `(S + h · Σ_{i=1..k} i·d_{t+i}) / Σ_{i=0..k} d_{t+i}`. The run extends while
 * this does not strictly increase (a tie extends it), then the next run begins.
 * Each order equals exactly its covered demand, so the plan is costed with the
 * shared coverage helper. Units: `demand` in units/period, `setupCost` in
 * currency/order, `holdingCostPerUnitPerPeriod` in currency/unit/period.
 *
 * **This is a greedy local heuristic, NOT an optimum.** Like Silver-Meal it
 * stops at the first upturn and never revisits an earlier run boundary, so it
 * can be beaten — sometimes badly — by the optimal plan. Use
 * {@link wagnerWhitin} when you need the provably minimum-cost plan; this rule
 * trades that accuracy for an O(T) single forward pass.
 *
 * Degenerate cases: a zero-demand period is absorbed into the current run (it
 * changes neither cost nor units, so the criterion ties) and is never chosen as
 * a run start — which also guarantees the divisor is positive, so cost-per-unit
 * can never divide by zero. An all-zero or empty horizon yields an empty plan
 * costing 0; a single-period horizon yields one order costing `S`.
 *
 * @param demand - Per-period demand vector (units/period); each entry must be
 *   finite and non-negative.
 * @param options - `setupCost` (S ≥ 0) and `holdingCostPerUnitPerPeriod`
 *   (h ≥ 0), both finite.
 * @returns An `Explained` {@link LotPlan}.
 * @example
 * ```ts
 * leastUnitCost([30, 10, 50], { setupCost: 60, holdingCostPerUnitPerPeriod: 1 }).value
 * // run at p0: cost/unit 2.0 → 1.75, then 1.889 rises, so it covers p0-p1
 * // {
 * //   orders: [{ period: 0, quantity: 40 }, { period: 2, quantity: 50 }],
 * //   totalCost: 130,
 * //   setupCost: 120,
 * //   holdingCost: 10,
 * // }
 * ```
 */
export function leastUnitCost(demand: readonly number[], options: LeastUnitCostOptions): LotPlan {
  const { setupCost, holdingCostPerUnitPerPeriod } = options
  requireNonNegative('setupCost', setupCost)
  requireNonNegative('holdingCostPerUnitPerPeriod', holdingCostPerUnitPerPeriod)
  for (let period = 0; period < demand.length; period++) {
    const d = demand[period]
    if (d === undefined) continue
    requireNonNegative(`demand[${period}]`, d)
  }

  const orders = greedyLotRuns(
    demand,
    { setupCost, holdingCostPerUnitPerPeriod },
    ({ cost, units }) => cost / units,
  )

  const cost = accumulateLotCost(
    demand,
    orders.map((o) => o.period),
    { setupCost, holdingCostPerUnitPerPeriod },
  )

  return explain(
    {
      orders,
      totalCost: cost.totalCost,
      setupCost: cost.setupCost,
      holdingCost: cost.holdingCost,
    },
    {
      method: 'least-unit-cost',
      inputs: {
        setupCost: round(setupCost),
        holdingCostPerUnitPerPeriod: round(holdingCostPerUnitPerPeriod),
        periods: demand.length,
        orders: orders.length,
      },
      reasoning: [
        "least unit cost: extend each order's coverage while the cost per unit falls, stopping at the first period where it would rise",
        `${orders.length} orders: ${orders.map((o) => `${round(o.quantity)}@p${o.period}`).join(', ')}`,
        `setup ${round(cost.setupCost)} + holding ${round(cost.holdingCost)} = ${round(cost.totalCost)}`,
        'greedy local heuristic — NOT optimal; it never revisits an earlier run boundary and can be beaten by the Wagner-Whitin optimum',
      ],
      citations: ['Nahmias, S. (2009), Production and Operations Analysis, 6th ed.'],
    },
  )
}
