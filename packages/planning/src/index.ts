/**
 * @logistics-ts/planning — MRP planning: lot-sizing rules, time-phased netting,
 * and BOM explosion for logistics-ts.
 *
 * This is the layer-3.5 planning package: it may import inward from `inventory`,
 * `forecasting`, `classification`, and `core`, and turns per-period demand into
 * explainable order plans. Every result is `Explained`.
 *
 * Lot-sizing rules: {@link lotForLot}, {@link fixedOrderQuantity},
 * {@link periodOrderQuantity}, {@link silverMeal}, and {@link leastUnitCost} are
 * heuristics; {@link wagnerWhitin} is the dynamic-programming optimum they
 * approximate — reach for it when cost matters more than simplicity. All share
 * the {@link LotPlan} result type and one end-of-period holding convention, via
 * the two cost primitives (`accumulateLotCost` coverage form, `simulateLotCost`
 * on-hand-simulation form), so their costs are directly comparable.
 */
export { type Explained, explain } from '@logistics-ts/core'
export { accumulateLotCost, type LotSizingCost, simulateLotCost } from './lot-sizing/cost'
export {
  type FixedOrderQuantityOptions,
  fixedOrderQuantity,
} from './lot-sizing/fixed-order-quantity'
export { type LeastUnitCostOptions, leastUnitCost } from './lot-sizing/least-unit-cost'
export { type LotForLotOptions, lotForLot } from './lot-sizing/lot-for-lot'
export {
  type PeriodOrderQuantityOptions,
  periodOrderQuantity,
} from './lot-sizing/period-order-quantity'
export { type SilverMealOptions, silverMeal } from './lot-sizing/silver-meal'
export type {
  LotPlan,
  LotSizingCostParams,
  LotSizingPlan,
  PlannedOrder,
} from './lot-sizing/types'
export { type WagnerWhitinOptions, wagnerWhitin } from './lot-sizing/wagner-whitin'
