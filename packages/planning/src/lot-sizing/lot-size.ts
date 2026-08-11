/**
 * The unified lot-sizing entry point: one call that dispatches to any rule in
 * the family by name, mirroring how `safetyStock({ method })` selects a
 * safety-stock formula in `@logistics-ts/inventory`.
 *
 * @see Wagner, H.M. & Whitin, T.M. (1958). Dynamic Version of the Economic Lot
 *   Size Model. Management Science, 5(1), 89-96.
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and Production
 *   Management in Supply Chains, 4th ed.
 */
import { fixedOrderQuantity } from './fixed-order-quantity'
import { leastUnitCost } from './least-unit-cost'
import { lotForLot } from './lot-for-lot'
import { periodOrderQuantity } from './period-order-quantity'
import { silverMeal } from './silver-meal'
import type { LotPlan, LotSizingCostParams } from './types'
import { wagnerWhitin } from './wagner-whitin'

/** Which lot-sizing rule {@link lotSize} should run. */
export type LotRule =
  | 'lot-for-lot'
  | 'foq'
  | 'poq'
  | 'silver-meal'
  | 'least-unit-cost'
  | 'wagner-whitin'

/** Every valid {@link LotRule}, in the order documented for `lotSize`. */
export const LOT_RULES: readonly LotRule[] = [
  'lot-for-lot',
  'foq',
  'poq',
  'silver-meal',
  'least-unit-cost',
  'wagner-whitin',
]

/**
 * Options for {@link lotSize}, discriminated on `rule`.
 *
 * The union is what makes an invalid combination a **compile-time** error: only
 * the `'foq'` member carries `orderQuantity`, so supplying it with another rule
 * — or omitting it for `'foq'` — fails to typecheck rather than surfacing at
 * runtime.
 */
export type LotSizeOptions =
  | (LotSizingCostParams & {
      rule: Exclude<LotRule, 'foq'>
    })
  | (LotSizingCostParams & {
      rule: 'foq'
      /** Fixed lot size `Q` (units). Required by — and only valid for — `'foq'`. */
      orderQuantity: number
    })

/**
 * Runs one lot-sizing rule by name against a per-period demand vector.
 *
 * This is a **dispatcher, not an algorithm**: it delegates to the rule's own
 * exported implementation, so there is exactly one implementation of each rule
 * and `lotSize(demand, { rule: 'wagner-whitin', … })` returns precisely what
 * `wagnerWhitin(demand, …)` returns. Reach for it when the rule is chosen at
 * runtime (from config, a UI, or an agent); call the rule directly when it is
 * known at author time.
 *
 * Rules, and what they trade:
 *
 * - `'lot-for-lot'` — order each period's demand in that period. Zero holding,
 *   maximal ordering. The MRP baseline.
 * - `'foq'` — fixed lot size, repeated as needed; requires `orderQuantity`. The
 *   only rule that can leave surplus inventory at the horizon end.
 * - `'poq'` — order at a fixed interval derived from the EOQ anchor.
 * - `'silver-meal'` — greedy extension while average cost per *period* falls.
 * - `'least-unit-cost'` — greedy extension while cost per *unit* falls.
 * - `'wagner-whitin'` — the dynamic-programming **optimum**.
 *
 * Only `'wagner-whitin'` is optimal; the rest are heuristics that never revisit
 * an earlier run boundary, and Silver-Meal can be *arbitrarily worse* than the
 * optimum on adversarial demand. Prefer `'wagner-whitin'` unless you
 * specifically need a textbook heuristic's behaviour — at O(T²) it is cheap for
 * any realistic planning horizon.
 *
 * Units: `demand` in units/period, `setupCost` in currency/order,
 * `holdingCostPerUnitPerPeriod` in currency/unit/period. All rules share one
 * end-of-period holding convention, so their costs are directly comparable.
 *
 * @param demand - Per-period demand vector (units/period); each entry must be
 *   finite and non-negative. Validated by the delegated rule.
 * @param options - The `rule` to run plus that rule's cost parameters.
 * @returns An `Explained` {@link LotPlan} from the delegated rule. Its `method`
 *   identifies the concrete rule that ran (e.g. `'wagner-whitin'`), never
 *   `'lotSize'`, and its `reasoning` records the dispatch.
 * @throws If `rule` is not one of {@link LOT_RULES}.
 * @example
 * ```ts
 * lotSize([90, 120, 80, 70], {
 *   rule: 'wagner-whitin', setupCost: 500, holdingCostPerUnitPerPeriod: 2,
 * }).value
 * // {
 * //   orders: [{ period: 0, quantity: 210 }, { period: 2, quantity: 150 }],
 * //   totalCost: 1380,
 * //   setupCost: 1000,
 * //   holdingCost: 380,
 * // }
 * ```
 */
export function lotSize(demand: readonly number[], options: LotSizeOptions): LotPlan {
  const { rule, setupCost, holdingCostPerUnitPerPeriod } = options
  // Types alone cannot protect a JS caller, so check the selector at runtime
  // too. The numeric parameters are deliberately NOT re-validated here: each
  // rule validates its own, keeping one source of truth for those messages.
  if (!LOT_RULES.includes(rule)) {
    throw new Error(
      `lotSize: unknown rule ${JSON.stringify(rule)} — valid rules are ${LOT_RULES.map((r) => `'${r}'`).join(', ')}`,
    )
  }

  const costParams = { setupCost, holdingCostPerUnitPerPeriod }
  const plan = dispatch(demand, options, costParams)

  return {
    ...plan,
    reasoning: [
      `lotSize dispatched to the '${rule}' rule — lotSize is a dispatcher, not an algorithm; the reasoning below is the rule's own`,
      ...plan.reasoning,
    ],
  }
}

function dispatch(
  demand: readonly number[],
  options: LotSizeOptions,
  costParams: LotSizingCostParams,
): LotPlan {
  switch (options.rule) {
    case 'lot-for-lot':
      return lotForLot(demand, costParams)
    case 'foq':
      return fixedOrderQuantity(demand, {
        ...costParams,
        orderQuantity: options.orderQuantity,
      })
    case 'poq':
      return periodOrderQuantity(demand, costParams)
    case 'silver-meal':
      return silverMeal(demand, costParams)
    case 'least-unit-cost':
      return leastUnitCost(demand, costParams)
    case 'wagner-whitin':
      return wagnerWhitin(demand, costParams)
    default:
      // Unreachable: `lotSize` rejects an unknown rule before dispatching. The
      // `never` parameter keeps the switch exhaustive — adding a rule to
      // LotRule without a case here becomes a typecheck error.
      return assertExhaustive(options)
  }
}

function assertExhaustive(_options: never): never {
  throw new Error('lotSize: unreachable — rule was validated before dispatch')
}
