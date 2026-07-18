/**
 * Wagner-Whitin dynamic lot sizing: the dynamic program that finds the
 * provably **cost-optimal** order plan for deterministic, period-varying demand.
 * It is the optimum every heuristic in this package approximates.
 *
 * @see Wagner, H.M. & Whitin, T.M. (1958). Dynamic Version of the Economic Lot
 *   Size Model. Management Science, 5(1), 89-96.
 * @see Snyder, L.V. & Shen, Z-J.M. (2019). Fundamentals of Supply Chain Theory,
 *   2nd ed., Example 3.9.
 */
import { explain } from '@logistics-ts/core'
import { round } from '../round'
import { accumulateLotCost } from './cost'
import type { LotPlan, LotSizingCostParams, PlannedOrder } from './types'
import { requireNonNegative } from './validate'

/** Options for {@link wagnerWhitin}: the setup and holding cost parameters. */
export type WagnerWhitinOptions = LotSizingCostParams

/**
 * Wagner-Whitin optimal lot sizing by dynamic programming over the
 * **zero-inventory property**: in an optimal plan an order arrives only when
 * starting inventory is zero, so every order covers a contiguous run of periods
 * exactly (never a fraction of one, and never leaving surplus). That reduces the
 * search from all order quantities to the choice of run boundaries, which the DP
 * solves exactly.
 *
 * Recursion, with `costToGo[i]` the minimum cost of covering periods
 * `i … T−1` when entering period `i` with zero inventory:
 *
 * - `costToGo[T] = 0`
 * - `costToGo[i] = costToGo[i+1]` when `d_i = 0` (no order can be needed, and
 *   ordering here could never beat ordering at the next period with demand)
 * - `costToGo[i] = min_{j > i} ( S + h · Σ_{t=i+1..j−1} (t−i)·d_t + costToGo[j] )`
 *   otherwise — the order at `i` covers the run `i … j−1`.
 *
 * The run-holding term is accumulated incrementally as `j` grows, giving
 * **O(T²)** time and O(T) space. Holding uses the same end-of-period convention
 * as the rest of the family, and the returned plan's cost is computed with the
 * shared `accumulateLotCost` helper, so it is directly comparable with
 * `lotForLot` / `periodOrderQuantity`. The result is an exact optimum, not a
 * heuristic: `wagnerWhitin(...).totalCost ≤` that of any other feasible plan.
 *
 * Units: `demand` in units/period, `setupCost` in currency/order,
 * `holdingCostPerUnitPerPeriod` in currency/unit/period.
 *
 * @param demand - Per-period demand vector (units/period); each entry must be
 *   finite and non-negative.
 * @param options - `setupCost` (S ≥ 0) and `holdingCostPerUnitPerPeriod`
 *   (h ≥ 0), both finite.
 * @returns An `Explained` {@link LotPlan} holding the optimal plan.
 * @example
 * ```ts
 * // Snyder & Shen, Fundamentals of Supply Chain Theory 2e, Example 3.9
 * wagnerWhitin([90, 120, 80, 70], { setupCost: 500, holdingCostPerUnitPerPeriod: 2 }).value
 * // {
 * //   orders: [{ period: 0, quantity: 210 }, { period: 2, quantity: 150 }],
 * //   totalCost: 1380,
 * //   setupCost: 1000,
 * //   holdingCost: 380,
 * // }
 * ```
 */
export function wagnerWhitin(demand: readonly number[], options: WagnerWhitinOptions): LotPlan {
  const { setupCost, holdingCostPerUnitPerPeriod } = options
  requireNonNegative('setupCost', setupCost)
  requireNonNegative('holdingCostPerUnitPerPeriod', holdingCostPerUnitPerPeriod)
  for (let period = 0; period < demand.length; period++) {
    const d = demand[period]
    if (d === undefined) continue
    requireNonNegative(`demand[${period}]`, d)
  }

  const horizon = demand.length
  // costToGo[i]: min cost to cover periods i..horizon-1, entering i with zero
  // inventory. costToGo[horizon] = 0 (nothing left to cover).
  const costToGo = new Array<number>(horizon + 1).fill(0)
  // coverUntil[i]: exclusive end of the run handled from period i — the run an
  // order at i covers, or simply i+1 when i is skipped as a zero-demand period.
  const coverUntil = new Array<number>(horizon + 1).fill(horizon)
  // ordersAt[i]: whether the optimal plan places an order at period i.
  const ordersAt = new Array<boolean>(horizon + 1).fill(false)

  for (let i = horizon - 1; i >= 0; i--) {
    const d = demand[i] ?? 0
    if (d === 0) {
      // Zero demand and zero inventory entering i: no order can be required
      // here, and placing one could only add holding versus ordering later.
      costToGo[i] = costToGo[i + 1] ?? 0
      coverUntil[i] = i + 1
      continue
    }

    let best = Number.POSITIVE_INFINITY
    let bestEnd = i + 1
    let runHolding = 0
    for (let j = i + 1; j <= horizon; j++) {
      // Extending the run to include period j-1 adds h·(j-1-i)·d_{j-1}: those
      // units are carried (j-1-i) periods. At j = i+1 the run is the single
      // period i, consumed on arrival, so it holds nothing.
      if (j > i + 1) {
        runHolding += holdingCostPerUnitPerPeriod * (j - 1 - i) * (demand[j - 1] ?? 0)
      }
      const candidate = setupCost + runHolding + (costToGo[j] ?? 0)
      if (candidate < best) {
        best = candidate
        bestEnd = j
      }
    }
    costToGo[i] = best
    coverUntil[i] = bestEnd
    ordersAt[i] = true
  }

  // Walk the DP decisions forward to recover the plan.
  const orders: PlannedOrder[] = []
  const runs: string[] = []
  for (let i = 0; i < horizon; ) {
    const end = coverUntil[i] ?? i + 1
    if (ordersAt[i] === true) {
      let quantity = 0
      for (let t = i; t < end; t++) quantity += demand[t] ?? 0
      orders.push({ period: i, quantity })
      runs.push(
        end - 1 > i
          ? `order ${round(quantity)} at period ${i} covers periods ${i}–${end - 1}`
          : `order ${round(quantity)} at period ${i} covers period ${i}`,
      )
    }
    i = end
  }

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
      method: 'wagner-whitin',
      inputs: {
        setupCost: round(setupCost),
        holdingCostPerUnitPerPeriod: round(holdingCostPerUnitPerPeriod),
        periods: horizon,
        orders: orders.length,
      },
      reasoning: [
        'DP over the zero-inventory property: an order is placed only when starting inventory is zero, so each order covers a contiguous run of periods exactly',
        ...runs,
        `setup ${round(cost.setupCost)} + holding ${round(cost.holdingCost)} = ${round(cost.totalCost)} — provably optimal (no feasible plan costs less), not a heuristic approximation`,
      ],
      citations: [
        'Wagner, H.M. & Whitin, T.M. (1958), Management Science 5(1), 89-96',
        'Snyder, L.V. & Shen, Z-J.M. (2019), Fundamentals of Supply Chain Theory, 2nd ed., Example 3.9',
      ],
    },
  )
}
