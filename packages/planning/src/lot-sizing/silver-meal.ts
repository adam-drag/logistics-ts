/**
 * The Silver-Meal heuristic for dynamic lot sizing: greedily extend an order's
 * coverage while the average cost *per period* keeps falling.
 *
 * @see Silver, E.A. & Meal, H.C. (1973). A heuristic for selecting lot size
 *   quantities for the case of a deterministic time-varying demand rate and
 *   discrete opportunities for replenishment. Production and Inventory
 *   Management, 14(2), 64-74.
 */
import { explain } from '@logistics-ts/core'
import { round } from '../round'
import { accumulateLotCost } from './cost'
import { greedyLotRuns } from './greedy'
import type { LotPlan, LotSizingCostParams } from './types'
import { requireNonNegative } from './validate'

/** Options for {@link silverMeal}: the setup and holding cost parameters. */
export type SilverMealOptions = LotSizingCostParams

/**
 * Silver-Meal lot sizing. Place an order at the first period with positive
 * demand and extend the periods it covers while the **average cost per period**
 * keeps falling; stop at the first period where it would rise, and start the
 * next order there.
 *
 * Formula: for a run started at `t` covering `k+1` periods, the criterion is
 * `(S + h · Σ_{i=1..k} i·d_{t+i}) / (k+1)`. The run extends while this does not
 * strictly increase (a tie extends it, per the textbook "stop when it
 * increases" phrasing), then the next run begins. Each order equals exactly its
 * covered demand, so the plan is costed with the shared coverage helper.
 * Units: `demand` in units/period, `setupCost` in currency/order,
 * `holdingCostPerUnitPerPeriod` in currency/unit/period.
 *
 * **This is a greedy local heuristic, NOT an optimum.** It stops at the first
 * upturn in its criterion and never reconsiders an earlier run boundary, so it
 * can miss a cheaper plan that requires accepting one locally worse step. On
 * adversarial demand Silver-Meal can be **arbitrarily worse** than the optimum.
 * Use {@link wagnerWhitin} when you need the provably minimum-cost plan; this
 * rule trades that accuracy for an O(T) single forward pass and is one of the
 * standard MRP textbook defaults.
 *
 * Degenerate cases: a zero-demand period is absorbed into the current run (it
 * adds no cost, so the criterion cannot rise) and is never chosen as a run
 * start; an all-zero or empty horizon yields an empty plan costing 0; a
 * single-period horizon yields one order costing `S`.
 *
 * @param demand - Per-period demand vector (units/period); each entry must be
 *   finite and non-negative.
 * @param options - `setupCost` (S ≥ 0) and `holdingCostPerUnitPerPeriod`
 *   (h ≥ 0), both finite.
 * @returns An `Explained` {@link LotPlan}.
 * @example
 * ```ts
 * silverMeal([20, 10, 5, 40], { setupCost: 50, holdingCostPerUnitPerPeriod: 1 }).value
 * // run at p0: avg 50 → 30 → 23.33, then 47.5 rises, so it covers p0-p2
 * // {
 * //   orders: [{ period: 0, quantity: 35 }, { period: 3, quantity: 40 }],
 * //   totalCost: 120,
 * //   setupCost: 100,
 * //   holdingCost: 20,
 * // }
 * ```
 */
export function silverMeal(demand: readonly number[], options: SilverMealOptions): LotPlan {
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
    ({ cost, periods }) => cost / periods,
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
      method: 'silver-meal',
      inputs: {
        setupCost: round(setupCost),
        holdingCostPerUnitPerPeriod: round(holdingCostPerUnitPerPeriod),
        periods: demand.length,
        orders: orders.length,
      },
      reasoning: [
        "Silver-Meal: extend each order's coverage while the average cost per period falls, stopping at the first period where it would rise",
        `${orders.length} orders: ${orders.map((o) => `${round(o.quantity)}@p${o.period}`).join(', ')}`,
        `setup ${round(cost.setupCost)} + holding ${round(cost.holdingCost)} = ${round(cost.totalCost)}`,
        'greedy local heuristic — NOT optimal; it never revisits an earlier run boundary and can be arbitrarily worse than the Wagner-Whitin optimum on adversarial demand',
      ],
      citations: [
        'Silver, E.A. & Meal, H.C. (1973), Production and Inventory Management 14(2), 64-74',
      ],
    },
  )
}
