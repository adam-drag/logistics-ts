/**
 * Shared types for the time-phased netting grid — the canonical MRP record for
 * a single item (Orlicky; APICS/ASCM CPIM body of knowledge).
 *
 * The grid is **period-indexed throughout**: every array index is a bucket
 * (period) number, never a date and never a day offset. Whatever calendar
 * granularity the caller bucketed demand at (day, week, month) is the
 * granularity of every index and every `period` field here.
 */
import type { Explained } from '@logistics-ts/core'

/**
 * Input to {@link mrpGrid}: the demand and supply picture for one item over a
 * bucketed planning horizon.
 */
export interface MrpInput {
  /**
   * Gross requirements per period (units/period), index = period (bucket).
   * Each entry must be finite and non-negative. The horizon length is
   * `grossRequirements.length`.
   */
  grossRequirements: readonly number[]
  /**
   * Open orders already due, per period (units/period), index = period.
   * Optional; omitted entries and a shorter array are treated as zero. May not
   * be longer than `grossRequirements`.
   */
  scheduledReceipts?: readonly number[]
  /**
   * Starting projected available balance (units) — on-hand inventory before
   * period 0. Must be finite and non-negative.
   */
  onHand: number
}

/** One row of the time-phased record: the full netting arithmetic for a period. */
export interface MrpRow {
  /** Zero-based period (bucket) index. */
  period: number
  /** Gross requirements in this period (units). */
  grossRequirements: number
  /** Scheduled receipts arriving in this period (units); `0` when none. */
  scheduledReceipts: number
  /** Projected available balance at the END of this period (units), never negative. */
  projectedAvailableBalance: number
  /** Net requirement for this period (units): `max(0, GR − PAB_prev − SR)`. */
  netRequirements: number
  /** Planned order receipt scheduled into this period (units); `0` when none. */
  plannedOrderReceipt: number
}

/** The netting-grid payload: one {@link MrpRow} per period, in period order. */
export interface MrpGridPlan {
  /** Rows ordered by ascending period, one per entry of `grossRequirements`. */
  rows: MrpRow[]
}

/** An MRP netting-grid result: an {@link MrpGridPlan} wrapped in `Explained`. */
export type MrpPlan = Explained<MrpGridPlan>
