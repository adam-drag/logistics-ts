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

export {
  type SafetyStockMethod,
  type SafetyStockInput,
  type SafetyStockOptions,
  safetyStock,
} from './safety-stock'
export {
  type ReorderPointInput,
  reorderPoint,
  type OrderUpToInput,
  orderUpToLevel,
} from './reorder-point'
export {
  type EoqInput,
  eoq,
  type EpqInput,
  epq,
  type QuantityDiscountTier,
  type QuantityDiscountInput,
  type QuantityDiscountResult,
  eoqWithQuantityDiscounts,
} from './eoq'
export { type CoverageOptions, type CoverageRow, coverage } from './coverage'
export { type TurnoverOptions, type TurnoverRow, turnover } from './turnover'
export { type IssueFlag, type Issue, type IssuesOptions, issues } from './issues'
