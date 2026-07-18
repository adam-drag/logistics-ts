/**
 * @logistics-ts/planning — MRP planning: lot-sizing rules, time-phased netting,
 * and BOM explosion for logistics-ts.
 *
 * This is the layer-3.5 planning package: it may import inward from `inventory`,
 * `forecasting`, `classification`, and `core`, and turns per-period demand into
 * explainable order plans. Every result is `Explained`.
 *
 * Lot-sizing rules shipped so far: {@link lotForLot}, {@link fixedOrderQuantity},
 * {@link periodOrderQuantity} (heuristics), and {@link wagnerWhitin} — the DP
 * optimum the heuristics approximate. The shared {@link LotPlan} type and the two
 * cost primitives (`accumulateLotCost` coverage form, `simulateLotCost`
 * on-hand-simulation form) serve the rest of the family (Silver-Meal, LUC) added
 * in later increments.
 */
export { type Explained, explain } from '@logistics-ts/core'
export { accumulateLotCost, type LotSizingCost, simulateLotCost } from './lot-sizing/cost'
export {
  type FixedOrderQuantityOptions,
  fixedOrderQuantity,
} from './lot-sizing/fixed-order-quantity'
export { type LotForLotOptions, lotForLot } from './lot-sizing/lot-for-lot'
export {
  type PeriodOrderQuantityOptions,
  periodOrderQuantity,
} from './lot-sizing/period-order-quantity'
export type {
  LotPlan,
  LotSizingCostParams,
  LotSizingPlan,
  PlannedOrder,
} from './lot-sizing/types'
export { type WagnerWhitinOptions, wagnerWhitin } from './lot-sizing/wagner-whitin'
