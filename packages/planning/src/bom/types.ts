/**
 * Shared types for BOM explosion — turning independent demand for end items
 * into dependent gross requirements for every component beneath them.
 *
 * Period-indexed throughout, exactly like the netting grid: every array index
 * is a bucket number, never a date and never a day offset. The caller chooses
 * the granularity by how they bucketed the end-item requirements.
 */
import type { Explained } from '@logistics-ts/core'

/** Independent (end-item) demand driving an explosion, per period. */
export interface ItemRequirements {
  /** Stable identifier of the item. */
  itemId: string
  /**
   * Requirements per period (units/period), index = period (bucket). Every
   * entry must be finite and non-negative.
   */
  requirements: readonly number[]
}

/**
 * The explosion payload: gross requirements for every item in the structure,
 * keyed by item id, each an array of the same horizon length.
 */
export interface ExplosionResult {
  /**
   * Gross requirements per item, per period. Covers the driving end items
   * themselves (their independent demand, plus any dependent demand if they are
   * also consumed by something else) and every component **reachable** from
   * them. An item in the BOM that no demand reaches gets no row here at all —
   * it is reported in `warnings` instead. Contrast {@link lowLevelCodes}, which
   * covers the whole structure.
   */
  grossRequirements: Record<string, number[]>
  /**
   * Low-level code per item: the **longest** path in the product structure from
   * any end item down to that item. End items are `0`. This is the order the
   * explosion processes items in, and it is what guarantees each component is
   * accumulated only after *every* one of its parents.
   */
  lowLevelCodes: Record<string, number>
}

/** A BOM explosion result: an {@link ExplosionResult} wrapped in `Explained`. */
export type Explosion = Explained<ExplosionResult>
