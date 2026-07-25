/**
 * Period-order-quantity (POQ) lot sizing: order at a fixed period interval whose
 * length is derived from the EOQ economic order interval.
 *
 * @see Nahmias, S. (2009). Production and Operations Analysis, 6th ed.,
 *   McGraw-Hill — dynamic lot sizing (period order quantity).
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and Production
 *   Management in Supply Chains, 4th ed.
 */
import { explain, mean } from '@logistics-ts/core'
import { eoq } from '@logistics-ts/inventory'
import { round } from '../round'
import { accumulateLotCost } from './cost'
import type { LotPlan, LotSizingCostParams, PlannedOrder } from './types'
import { requireNonNegative, requirePositive } from './validate'

/** Options for {@link periodOrderQuantity}: the setup and holding cost parameters. */
export type PeriodOrderQuantityOptions = LotSizingCostParams

/**
 * Period-order-quantity sizing: convert EOQ into a whole number of periods per
 * order and then order that block's total demand at the start of each interval.
 *
 * The economic order interval comes from the continuous EOQ anchor: with
 * `meanDemand = mean(demand)`, `EOQ = √(2 · meanDemand · S / h)` (via
 * `@logistics-ts/inventory`'s `eoq`), the interval is `T* = max(1, round(EOQ /
 * meanDemand))`. An order is placed at periods `0, T*, 2·T*, …`, each covering
 * the demand of its block `[k·T*, (k+1)·T*)`; blocks with zero total demand are
 * skipped. Because each order equals exactly its block's demand, holding is
 * computed with the coverage helper (`accumulateLotCost`).
 *
 * Formula: `T* = max(1, round(EOQ / meanDemand))`; `order_{k·T*} = Σ_{t∈block} d_t`;
 * `holdingCost = h · Σ (per-block carried units)`; `setupCost = S ×` (#orders).
 * Units: `demand` in units/period, `setupCost` currency/order, `h`
 * currency/unit/period.
 *
 * @param demand - Per-period demand vector (units/period); each entry finite and
 *   non-negative.
 * @param options - `setupCost` (S > 0) and `holdingCostPerUnitPerPeriod` (h > 0);
 *   both must be positive for the EOQ anchor to be defined.
 * @returns An `Explained` {@link LotPlan}. An empty or all-zero demand horizon
 *   yields an empty plan with a warning.
 * @example
 * ```ts
 * periodOrderQuantity([10, 20, 30, 40], {
 *   setupCost: 100, holdingCostPerUnitPerPeriod: 1,
 * }).value
 * // meanDemand 25, EOQ √5000 ≈ 70.71, T* = round(2.83) = 3
 * // {
 * //   orders: [{ period: 0, quantity: 60 }, { period: 3, quantity: 40 }],
 * //   totalCost: 280,
 * //   setupCost: 200,
 * //   holdingCost: 80,
 * // }
 * ```
 */
export function periodOrderQuantity(
  demand: readonly number[],
  options: PeriodOrderQuantityOptions,
): LotPlan {
  const { setupCost, holdingCostPerUnitPerPeriod } = options
  requirePositive('setupCost', setupCost)
  requirePositive('holdingCostPerUnitPerPeriod', holdingCostPerUnitPerPeriod)
  for (let period = 0; period < demand.length; period++) {
    const d = demand[period]
    if (d === undefined) continue
    requireNonNegative(`demand[${period}]`, d)
  }

  const meanDemand = mean(demand)
  if (!Number.isFinite(meanDemand) || meanDemand <= 0) {
    // No positive demand over the horizon — nothing to order.
    return explain(
      { orders: [], totalCost: 0, setupCost: 0, holdingCost: 0 },
      {
        method: 'period-order-quantity',
        inputs: {
          setupCost: round(setupCost),
          holdingCostPerUnitPerPeriod: round(holdingCostPerUnitPerPeriod),
          periods: demand.length,
          orders: 0,
        },
        reasoning: ['no positive demand over the horizon — empty plan'],
        citations: ['Nahmias, S. (2009), Production and Operations Analysis, 6th ed.'],
        warnings: ['demand has no positive periods; returning an empty plan'],
      },
    )
  }

  // The EOQ anchor is evaluated on a PER-PERIOD time base, not an annual one:
  // `annualDemand` receives demand/period and `holdingCostPerUnit` receives
  // cost/unit/period. EOQ only requires D and h to share a time base, so the
  // `annual*` parameter names are a misnomer here — do NOT "fix" this by
  // annualizing meanDemand; that would silently change T*.
  const economicOrderQuantity = eoq({
    annualDemand: meanDemand,
    orderCost: setupCost,
    holdingCostPerUnit: holdingCostPerUnitPerPeriod,
  }).value
  const intervalPeriods = Math.max(1, Math.round(economicOrderQuantity / meanDemand))

  const orders: PlannedOrder[] = []
  for (let start = 0; start < demand.length; start += intervalPeriods) {
    const end = Math.min(start + intervalPeriods, demand.length)
    let quantity = 0
    for (let period = start; period < end; period++) quantity += demand[period] ?? 0
    if (quantity > 0) orders.push({ period: start, quantity })
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
      method: 'period-order-quantity',
      inputs: {
        setupCost: round(setupCost),
        holdingCostPerUnitPerPeriod: round(holdingCostPerUnitPerPeriod),
        meanDemand: round(meanDemand),
        economicOrderQuantity: round(economicOrderQuantity),
        intervalPeriods,
        periods: demand.length,
        orders: orders.length,
      },
      reasoning: [
        `EOQ ${round(economicOrderQuantity)} over mean demand ${round(meanDemand)} → order every T* = ${intervalPeriods} periods`,
        'each order covers its interval block, so holding is the coverage-based carried inventory',
        `${orders.length} orders × setup ${round(setupCost)} + holding ${round(cost.holdingCost)} = ${round(cost.totalCost)}`,
      ],
      citations: ['Nahmias, S. (2009), Production and Operations Analysis, 6th ed.'],
    },
  )
}
