/**
 * Cost accounting shared by every lot-sizing rule.
 *
 * All lot-sizing heuristics and the Wagner-Whitin optimum differ only in *when*
 * they place orders; once the orders are fixed the setup and holding costs are
 * computed here, so the whole family agrees on the cost convention (and so a
 * later increment's Wagner-Whitin golden test against stockpyl compares like
 * with like).
 *
 * Two forms of the same **end-of-period** convention are provided:
 *
 * - {@link accumulateLotCost} — *coverage* form: assumes each order's quantity
 *   equals the exact demand of the periods it covers (true for lot-for-lot and
 *   POQ). Cheaper, closed-form.
 * - {@link simulateLotCost} — *simulation* form: takes explicit order quantities
 *   and simulates end-of-period on-hand, so it is correct even when an order
 *   leaves remainder inventory that carries past the periods it nominally covers
 *   (required for fixed-order-quantity). The two agree whenever every order
 *   quantity equals its covered demand.
 */
import type { LotSizingCostParams, PlannedOrder } from './types'
import { requirePeriodInRange } from './validate'

/** The setup / holding / total cost of a fixed set of order periods. */
export interface LotSizingCost {
  /** Total setup (ordering) cost: `setupCost ×` number of orders. */
  setupCost: number
  /** Total inventory-holding cost over the horizon. */
  holdingCost: number
  /** `setupCost + holdingCost`. */
  totalCost: number
}

/**
 * Computes the cost of a lot plan under the **end-of-period holding
 * convention**: holding is charged on units carried *into* a later period, one
 * period's charge per period each unit is held.
 *
 * `orderPeriods` are the (ascending, in-range) periods at which an order is
 * received; each order covers the contiguous run of demand periods up to — but
 * not including — the next order (the last order covers through the horizon
 * end). An order received in period `t` and covering periods `t … t+k` incurs
 * holding `h · Σ_{i=1..k} i · d_{t+i}` (the `d_t` consumed on arrival is held
 * zero periods; `d_{t+1}` one period; …) and exactly one setup `S`. This
 * matches stockpyl's Wagner-Whitin holding convention, which a later increment
 * golden-tests against.
 *
 * This is a low-level cost primitive, so it returns a plain cost object rather
 * than an `Explained` result; the public lot-sizing functions wrap the plan they
 * build with it.
 *
 * Formula (per order covering `t … t+k`): holding `= h · Σ_{i=1..k} i · d_{t+i}`,
 * setup `= S`. Units: `demand` in units/period, `setupCost` in currency/order,
 * `holdingCostPerUnitPerPeriod` in currency/unit/period.
 *
 * @param demand - Per-period demand vector (units/period), non-negative.
 * @param orderPeriods - Ascending, in-range indices of the periods that receive
 *   an order. Duplicates or out-of-order entries are the caller's responsibility.
 * @param params - Setup cost `S` and holding cost `h` per unit per period.
 * @see Wagner, H.M. & Whitin, T.M. (1958). Dynamic Version of the Economic Lot
 *   Size Model. Management Science, 5(1), 89-96.
 * @example
 * ```ts
 * // one order in period 0 covering demand [10, 20, 30] over 3 periods, h = 1:
 * // holding = 1 · (1·20 + 2·30) = 80, one setup S = 100 → total 180
 * accumulateLotCost([10, 20, 30], [0], { setupCost: 100, holdingCostPerUnitPerPeriod: 1 })
 * // { setupCost: 100, holdingCost: 80, totalCost: 180 }
 * ```
 */
export function accumulateLotCost(
  demand: readonly number[],
  orderPeriods: readonly number[],
  params: LotSizingCostParams,
): LotSizingCost {
  const { setupCost: S, holdingCostPerUnitPerPeriod: h } = params
  const horizon = demand.length

  let holdingCost = 0
  for (let j = 0; j < orderPeriods.length; j++) {
    const start = orderPeriods[j]
    if (start === undefined) continue
    // This order covers demand periods [start, nextOrder) — the run up to the
    // next order, or through the horizon end for the last order.
    const nextOrder = orderPeriods[j + 1] ?? horizon
    for (let period = start; period < nextOrder; period++) {
      const d = demand[period]
      if (d === undefined) continue
      // `period - start` periods held; the unit consumed on arrival (i = 0)
      // contributes nothing (end-of-period convention).
      holdingCost += h * (period - start) * d
    }
  }

  const setupCostTotal = S * orderPeriods.length
  return {
    setupCost: setupCostTotal,
    holdingCost,
    totalCost: setupCostTotal + holdingCost,
  }
}

/**
 * Computes the cost of a lot plan by **simulating end-of-period on-hand**, under
 * the same end-of-period holding convention as {@link accumulateLotCost} but
 * correct for orders that carry *remainder* inventory past the periods they
 * nominally cover (e.g. a fixed order quantity larger than the shortfall).
 *
 * The on-hand balance is stepped period by period — receipts added, demand
 * subtracted — and holding is charged on the balance carried out of each
 * period: `holdingCost = h · Σ_t onHand_t`, where `onHand_t = onHand_{t−1} +
 * receipts_t − demand_t`. Setup is `S ×` the number of orders. A plan that
 * never stocks out keeps `onHand_t ≥ 0`; only positive balances are charged, so
 * a transient shortfall (an infeasible plan) is not credited as negative
 * holding.
 *
 * This is a low-level cost primitive, so it returns a plain cost object rather
 * than an `Explained` result.
 *
 * Units: `demand` in units/period, `setupCost` in currency/order,
 * `holdingCostPerUnitPerPeriod` in currency/unit/period.
 *
 * @param demand - Per-period demand vector (units/period), non-negative.
 * @param orders - Planned order receipts; each `quantity` is received at its
 *   `period`. Multiple orders in the same period are summed. Every `period` must
 *   be an integer in `[0, demand.length)`; an out-of-range, non-integer, or
 *   non-finite period throws, since such an order would otherwise be charged a
 *   setup while never being received.
 * @param params - Setup cost `S` and holding cost `h` per unit per period.
 * @throws If any order's `period` is not an integer in `[0, demand.length)`.
 * @see Wagner, H.M. & Whitin, T.M. (1958). Dynamic Version of the Economic Lot
 *   Size Model. Management Science, 5(1), 89-96.
 * @example
 * ```ts
 * // fixed lot of 50 against demand [10,20,30,40]: orders 50@p0, 50@p2.
 * // end-of-period on-hand [40,20,40,0] → holding 1·100 = 100, 2 setups → 300.
 * simulateLotCost([10, 20, 30, 40], [{ period: 0, quantity: 50 }, { period: 2, quantity: 50 }],
 *   { setupCost: 100, holdingCostPerUnitPerPeriod: 1 })
 * // { setupCost: 200, holdingCost: 100, totalCost: 300 }
 * ```
 */
export function simulateLotCost(
  demand: readonly number[],
  orders: readonly PlannedOrder[],
  params: LotSizingCostParams,
): LotSizingCost {
  const { setupCost: S, holdingCostPerUnitPerPeriod: h } = params
  const horizon = demand.length

  const received = new Array<number>(horizon).fill(0)
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i]
    if (order === undefined) continue
    // Reject rather than silently skip: an unreceivable order would still be
    // charged a setup below, which is undefined behavior, not a no-op.
    requirePeriodInRange(`orders[${i}].period`, order.period, horizon)
    received[order.period] = (received[order.period] ?? 0) + order.quantity
  }

  let onHand = 0
  let holdingCost = 0
  for (let period = 0; period < horizon; period++) {
    onHand += (received[period] ?? 0) - (demand[period] ?? 0)
    // Charge holding only on positive carried inventory (end-of-period).
    if (onHand > 0) holdingCost += h * onHand
  }

  const setupCostTotal = S * orders.length
  return {
    setupCost: setupCostTotal,
    holdingCost,
    totalCost: setupCostTotal + holdingCost,
  }
}
