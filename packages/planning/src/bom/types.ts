/**
 * Shared types for BOM explosion — turning independent demand for end items
 * into dependent gross requirements for every component beneath them.
 *
 * Period-indexed throughout, exactly like the netting grid: every array index
 * is a bucket number, never a date and never a day offset. The caller chooses
 * the granularity by how they bucketed the end-item requirements.
 */
import type { BomRecord, Explained } from '@logistics-ts/core'
import type { LotSizeOptions } from '../lot-sizing/lot-size'
import type { MrpRow, PlannedOrderSchedule } from '../mrp/types'

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

/** Per-item planning data for a multi-level MRP run. All fields optional. */
export interface ItemPlanningData {
  /** On-hand stock before period 0 (units). Defaults to `0`. */
  onHand?: number
  /** Open orders already due, per period (units). Defaults to none. */
  scheduledReceipts?: readonly number[]
  /** Safety-stock floor (units) the balance must not dip below. Defaults to `0`. */
  safetyStock?: number
  /**
   * Procurement or production lead time in **periods (buckets)**, never days.
   * Defaults to `0`. This is what shifts an item's planned order release ahead
   * of its receipt — and therefore what times its components' demand.
   */
  leadTimePeriods?: number
  /** Lot-sizing rule for this item. Defaults to lot-for-lot at zero cost. */
  lotRule?: LotSizeOptions
}

/** Input to {@link planRequirements}: structure, demand, and per-item data. */
export interface PlanRequirementsInput {
  /** The product-structure edge list. Must be acyclic. */
  bom: BomRecord
  /**
   * Independent demand per end item, per period — the master production
   * schedule. Its longest series sets the planning horizon.
   */
  masterSchedule: readonly ItemRequirements[]
  /**
   * Per-item planning data keyed by item id. Any item omitted is planned with
   * no stock, no receipts, no safety stock, zero lead time, and lot-for-lot.
   */
  items?: Record<string, ItemPlanningData>
}

/** The plan for one item within a multi-level run: its grid, plus its place in the structure. */
export interface ItemPlan {
  /** Stable identifier of the item. */
  itemId: string
  /** This item's low-level code — the order position it was planned in. */
  lowLevelCode: number
  /**
   * The gross requirements this item was planned against: its own independent
   * demand plus `quantityPer ×` each parent's planned order **releases**.
   */
  grossRequirements: number[]
  /** The item's full time-phased record, one {@link MrpRow} per period. */
  rows: MrpRow[]
  /** The item's planned orders as release/receipt pairs, including past-due ones. */
  plannedOrders: PlannedOrderSchedule[]
  /** Warnings from this item's own netting grid (e.g. past-due releases), when any. */
  warnings?: readonly string[]
}

/** The multi-level MRP payload: every planned item, in planning order. */
export interface MultiLevelPlan {
  /** Plan per item, keyed by item id. Only items something actually requires. */
  items: Record<string, ItemPlan>
  /** Low-level code per item across the whole BOM structure. */
  lowLevelCodes: Record<string, number>
  /** The item ids that were planned, in the order they were planned. */
  order: string[]
}

/** A multi-level MRP result: a {@link MultiLevelPlan} wrapped in `Explained`. */
export type RequirementsPlan = Explained<MultiLevelPlan>
