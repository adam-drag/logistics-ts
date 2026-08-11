/**
 * Fixed-order-quantity (FOQ) lot sizing: replenish in whole multiples of a fixed
 * lot size whenever on-hand cannot cover the current period's demand.
 *
 * @see Nahmias, S. (2009). Production and Operations Analysis, 6th ed.,
 *   McGraw-Hill — dynamic lot sizing (fixed order quantity).
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and Production
 *   Management in Supply Chains, 4th ed.
 */
import { explain } from '@logistics-ts/core'
import { round } from '../round'
import { simulateLotCost } from './cost'
import type { LotPlan, LotSizingCostParams, PlannedOrder } from './types'
import { requireNonNegative, requirePositive } from './validate'

/** Options for {@link fixedOrderQuantity}. */
export interface FixedOrderQuantityOptions extends LotSizingCostParams {
  /** Fixed lot size `Q` (units); each order is the fewest whole multiples of it. */
  orderQuantity: number
}

/**
 * Fixed-order-quantity sizing: step through the horizon carrying projected
 * on-hand; whenever on-hand is below a period's demand, order the fewest whole
 * multiples of `orderQuantity` that cover the shortfall
 * (`ceil(shortfall / Q) · Q`). Because a fixed lot can exceed the shortfall,
 * remainder inventory carries forward, so holding is computed from an explicit
 * end-of-period on-hand simulation (`simulateLotCost`), not from coverage.
 *
 * Formula: on receiving into period `t`, `receipt_t = ⌈(d_t − onHand_{t−1}) / Q⌉
 * · Q` when `onHand_{t−1} < d_t`, else `0`; `onHand_t = onHand_{t−1} + receipt_t
 * − d_t`; `holdingCost = h · Σ_t onHand_t`; `setupCost = S ×` (#orders). Units:
 * `demand`/`orderQuantity` in units, `setupCost` currency/order, `h`
 * currency/unit/period.
 *
 * @param demand - Per-period demand vector (units/period); each entry finite and
 *   non-negative.
 * @param options - `orderQuantity` (Q > 0), `setupCost` (S ≥ 0), and
 *   `holdingCostPerUnitPerPeriod` (h ≥ 0).
 * @returns An `Explained` {@link LotPlan}.
 * @example
 * ```ts
 * fixedOrderQuantity([10, 20, 30, 40], {
 *   orderQuantity: 50, setupCost: 100, holdingCostPerUnitPerPeriod: 1,
 * }).value
 * // {
 * //   orders: [{ period: 0, quantity: 50 }, { period: 2, quantity: 50 }],
 * //   totalCost: 300,
 * //   setupCost: 200,
 * //   holdingCost: 100,
 * // }
 * ```
 */
export function fixedOrderQuantity(
  demand: readonly number[],
  options: FixedOrderQuantityOptions,
): LotPlan {
  const { orderQuantity, setupCost, holdingCostPerUnitPerPeriod } = options
  requirePositive('orderQuantity', orderQuantity)
  requireNonNegative('setupCost', setupCost)
  requireNonNegative('holdingCostPerUnitPerPeriod', holdingCostPerUnitPerPeriod)

  const orders: PlannedOrder[] = []
  let onHand = 0
  for (let period = 0; period < demand.length; period++) {
    const d = demand[period]
    if (d === undefined) continue
    requireNonNegative(`demand[${period}]`, d)
    if (onHand < d) {
      const multiples = Math.ceil((d - onHand) / orderQuantity)
      const quantity = multiples * orderQuantity
      orders.push({ period, quantity })
      onHand += quantity
    }
    onHand -= d
  }

  const cost = simulateLotCost(demand, orders, { setupCost, holdingCostPerUnitPerPeriod })

  return explain(
    {
      orders,
      totalCost: cost.totalCost,
      setupCost: cost.setupCost,
      holdingCost: cost.holdingCost,
    },
    {
      method: 'fixed-order-quantity',
      inputs: {
        orderQuantity: round(orderQuantity),
        setupCost: round(setupCost),
        holdingCostPerUnitPerPeriod: round(holdingCostPerUnitPerPeriod),
        periods: demand.length,
        orders: orders.length,
      },
      reasoning: [
        `fixed lot Q = ${round(orderQuantity)}: order the fewest whole multiples of Q whenever on-hand cannot cover the period's demand`,
        'remainder inventory carries forward, so holding is from an end-of-period on-hand simulation',
        `${orders.length} orders × setup ${round(setupCost)} + holding ${round(cost.holdingCost)} = ${round(cost.totalCost)}`,
      ],
      citations: ['Nahmias, S. (2009), Production and Operations Analysis, 6th ed.'],
    },
  )
}
