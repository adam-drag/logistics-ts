/**
 * Reorder point — the stock level at which a new replenishment order should be
 * placed, and its periodic-review counterpart, the order-up-to level.
 *
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and
 *   Production Management in Supply Chains, 4th ed.
 */
import { type Explained, explain } from '@logistics-ts/core'

export interface ReorderPointInput {
  /** Mean demand per period (D̄). */
  meanDemand: number
  /** Mean replenishment lead time (L̄), same period unit as `meanDemand`. */
  meanLeadTime: number
  /** Safety stock buffer, e.g. from `safetyStock()`. */
  safetyStock: number
}

/**
 * Continuous-review reorder point: `ROP = D̄·L̄ + SS`. When on-hand stock falls
 * to this level, place a replenishment order — the expected demand over the
 * lead time, plus a buffer for variability.
 *
 * @example
 * ```ts
 * reorderPoint({ meanDemand: 100, meanLeadTime: 7, safetyStock: 186 }).value // 886
 * ```
 */
export function reorderPoint(input: ReorderPointInput): Explained<number> {
  const { meanDemand, meanLeadTime, safetyStock } = input
  requireNonNegative('meanDemand', meanDemand)
  requireNonNegative('meanLeadTime', meanLeadTime)
  requireNonNegative('safetyStock', safetyStock)

  const value = meanDemand * meanLeadTime + safetyStock

  return explain(value, {
    method: 'reorder-point',
    inputs: { meanDemand, meanLeadTime, safetyStock },
    reasoning: ['ROP = D̄·L̄ + SS — expected lead-time demand plus the safety-stock buffer'],
    citations: ['Silver, Pyke & Thomas (2017), Inventory and Production Management'],
  })
}

export interface OrderUpToInput extends ReorderPointInput {
  /** Review period (R), same unit as `meanLeadTime` — time between periodic reviews. */
  reviewPeriod: number
}

/**
 * Periodic-review order-up-to level: `S = D̄·(L̄+R) + SS`. Under periodic
 * review, stock must cover demand over both the lead time *and* the review
 * period until the next review, so each order restores stock to this level.
 *
 * @example
 * ```ts
 * orderUpToLevel({ meanDemand: 100, meanLeadTime: 7, reviewPeriod: 14, safetyStock: 186 }).value // 2286
 * ```
 */
export function orderUpToLevel(input: OrderUpToInput): Explained<number> {
  const { meanDemand, meanLeadTime, reviewPeriod, safetyStock } = input
  requireNonNegative('meanDemand', meanDemand)
  requireNonNegative('meanLeadTime', meanLeadTime)
  requireNonNegative('reviewPeriod', reviewPeriod)
  requireNonNegative('safetyStock', safetyStock)

  const value = meanDemand * (meanLeadTime + reviewPeriod) + safetyStock

  return explain(value, {
    method: 'order-up-to-level',
    inputs: { meanDemand, meanLeadTime, reviewPeriod, safetyStock },
    reasoning: [
      'S = D̄·(L̄+R) + SS — expected demand over the lead time plus the review period, plus the safety-stock buffer',
    ],
    citations: ['Silver, Pyke & Thomas (2017), Inventory and Production Management'],
  })
}

function requireNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative (got ${value})`)
  }
}
