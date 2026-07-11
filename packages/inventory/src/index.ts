/**
 * @logistics-ts/inventory — safety stock, reorder point, EOQ, coverage, issues.
 *
 * M0 scaffold: the actual formulas land in M4 (see plans/v0.1.md). This stub
 * imports from @logistics-ts/core to exercise the layered build. The declared
 * dependency on @logistics-ts/forecasting (auto safety stock) is wired in M4.
 */
import { type Explained, explain } from '@logistics-ts/core'

/** Package identifier, used for scaffold smoke tests. */
export const PACKAGE_NAME = '@logistics-ts/inventory'

export type { Explained }
export { explain }
