/**
 * @logistics-ts/inventory — safety stock, reorder point, EOQ, coverage, issues.
 *
 * M0 scaffold: the actual formulas land in M4 (see plans/v0.1.md). This stub
 * imports from @logistics-ts/core to exercise the layered build. Dependencies
 * on classification and forecasting (for auto safety stock) are added in M4,
 * when the code first imports them.
 */
import { type Explained, explain } from '@logistics-ts/core'

/** Package identifier, used for scaffold smoke tests. */
export const PACKAGE_NAME = '@logistics-ts/inventory'

export type { Explained }
export { explain }
