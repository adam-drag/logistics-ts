/**
 * Lot-for-lot (L4L), the simplest discrete-time dynamic lot-sizing rule: order
 * exactly each period's demand, in that period.
 *
 * @see Nahmias, S. (2009). Production and Operations Analysis, 6th ed.,
 *   McGraw-Hill — dynamic lot sizing (lot-for-lot).
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and Production
 *   Management in Supply Chains, 4th ed.
 */
import { explain } from '@logistics-ts/core'
import { round } from '../round'
import { accumulateLotCost } from './cost'
import type { LotPlan, LotSizingCostParams, PlannedOrder } from './types'
import { requireNonNegative } from './validate'

/** Options for {@link lotForLot}: the setup and holding cost parameters. */
export type LotForLotOptions = LotSizingCostParams

/**
 * Lot-for-lot sizing: place one planned order receipt equal to each period's
 * demand, in that period. Because nothing is ever carried between periods,
 * `holdingCost = 0` and `totalCost = (number of nonzero-demand periods) ×
 * setupCost`. Zero-demand periods incur no order. This is the standard MRP
 * baseline — minimal inventory, maximal ordering — and the reference every
 * cost-trading heuristic (POQ, Silver-Meal, Wagner-Whitin) improves upon.
 *
 * Formula: for each period `t`, `order_t = demand_t` (omitted when `demand_t =
 * 0`); `holdingCost = 0`; `setupCost = S × |{t : demand_t > 0}|`. Units:
 * `demand` in units/period, `setupCost` in currency/order.
 *
 * @param demand - Per-period demand vector (units/period); each entry must be
 *   finite and non-negative.
 * @param options - `setupCost` (S, currency/order) and
 *   `holdingCostPerUnitPerPeriod` (h, currency/unit/period); both must be
 *   finite and non-negative. `h` does not affect the plan (holding is always
 *   zero) but is recorded in the explanation for parity with the other rules.
 * @returns An `Explained` {@link LotPlan}.
 * @example
 * ```ts
 * lotForLot([10, 0, 20, 5], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 }).value
 * // {
 * //   orders: [{ period: 0, quantity: 10 }, { period: 2, quantity: 20 }, { period: 3, quantity: 5 }],
 * //   totalCost: 300,
 * //   setupCost: 300,
 * //   holdingCost: 0,
 * // }
 * ```
 */
export function lotForLot(demand: readonly number[], options: LotForLotOptions): LotPlan {
  const { setupCost, holdingCostPerUnitPerPeriod } = options
  requireNonNegative('setupCost', setupCost)
  requireNonNegative('holdingCostPerUnitPerPeriod', holdingCostPerUnitPerPeriod)

  const orders: PlannedOrder[] = []
  for (let period = 0; period < demand.length; period++) {
    const d = demand[period]
    if (d === undefined) continue
    requireNonNegative(`demand[${period}]`, d)
    if (d > 0) orders.push({ period, quantity: d })
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
      method: 'lot-for-lot',
      inputs: {
        setupCost: round(setupCost),
        holdingCostPerUnitPerPeriod: round(holdingCostPerUnitPerPeriod),
        periods: demand.length,
        orders: orders.length,
      },
      reasoning: [
        "lot-for-lot: order each period's demand in that period, carrying nothing forward",
        'no inventory is held between periods, so holdingCost = 0',
        `${orders.length} orders (one per nonzero-demand period) × setup ${round(setupCost)} = ${round(cost.totalCost)}`,
      ],
      citations: ['Nahmias, S. (2009), Production and Operations Analysis, 6th ed.'],
    },
  )
}
