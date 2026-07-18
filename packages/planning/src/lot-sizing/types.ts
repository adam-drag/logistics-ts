/**
 * Shared types for the lot-sizing family (`lotForLot`, and — in later
 * increments — `fixedOrderQuantity`, `periodOrderQuantity`, `silverMeal`,
 * `leastUnitCost`, `wagnerWhitin`, and the unified `lotSize` entry).
 *
 * Every lot-sizing rule takes a per-period demand vector plus cost parameters
 * and returns a {@link LotPlan}: the planned order receipts by period together
 * with the setup / holding / total cost accounting behind them, wrapped in
 * `Explained` so the plan carries its own method, inputs, and reasoning.
 */
import type { Explained } from '@logistics-ts/core'

/** A planned order receipt: `quantity` units received at period `period`. */
export interface PlannedOrder {
  /** Zero-based period (bucket) index at which the order is received. */
  period: number
  /** Order quantity received in `period`, in demand units. */
  quantity: number
}

/**
 * The lot-sizing plan payload: the ordered list of planned order receipts and
 * the cost accounting that produced it. `totalCost = setupCost + holdingCost`.
 */
export interface LotSizingPlan {
  /** Planned order receipts, ordered by ascending period. */
  orders: PlannedOrder[]
  /** Setup + holding cost over the whole horizon. */
  totalCost: number
  /** Total setup (ordering) cost: `S ×` number of orders. */
  setupCost: number
  /** Total inventory-holding cost over the horizon. */
  holdingCost: number
}

/** A lot-sizing result: a {@link LotSizingPlan} wrapped in `Explained`. */
export type LotPlan = Explained<LotSizingPlan>

/** Cost parameters shared by the cost-based lot-sizing rules. */
export interface LotSizingCostParams {
  /** Fixed setup (ordering) cost `S` incurred once per order, currency/order. */
  setupCost: number
  /**
   * Holding cost `h` per unit carried for one period, currency/unit/period.
   * Charged under the end-of-period convention (see `accumulateLotCost`).
   */
  holdingCostPerUnitPerPeriod: number
}
