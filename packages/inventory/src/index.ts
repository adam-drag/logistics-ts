/**
 * @logistics-ts/inventory — safety stock, reorder point, EOQ, coverage,
 * turnover, and issue analysis for logistics-ts.
 *
 * Every domain result is `Explained`: safety stock and EOQ are scalar
 * formula functions over pre-summarized numbers; coverage, turnover, and
 * issues are bulk analysis functions over raw stock/demand/lead-time records,
 * returning one row per item.
 */
export { type Explained, explain } from '@logistics-ts/core'
export { type CoverageOptions, type CoverageRow, coverage } from './coverage'
export {
  type EoqInput,
  type EpqInput,
  eoq,
  eoqWithQuantityDiscounts,
  epq,
  type QuantityDiscountInput,
  type QuantityDiscountResult,
  type QuantityDiscountTier,
} from './eoq'
export {
  type FillRateInput,
  type FillRateResult,
  fillRate,
  type SafetyStockForFillRateInput,
  type SafetyStockForFillRateResult,
  type ServiceMetricsInput,
  type ServiceMetricsResult,
  safetyStockForFillRate,
  serviceMetrics,
} from './fill-rate'
export { type Issue, type IssueFlag, type IssuesOptions, issues } from './issues'
export {
  type OrderUpToInput,
  orderUpToLevel,
  type ReorderPointInput,
  reorderPoint,
} from './reorder-point'
export {
  type SafetyStockInput,
  type SafetyStockMethod,
  type SafetyStockOptions,
  safetyStock,
} from './safety-stock'
export { type TurnoverOptions, type TurnoverRow, turnover } from './turnover'
