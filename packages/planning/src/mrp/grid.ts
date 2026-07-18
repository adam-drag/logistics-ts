/**
 * The time-phased netting grid: the canonical MRP record for a single item.
 *
 * @see Orlicky, J. (1975). Material Requirements Planning, McGraw-Hill.
 * @see Jacobs, F.R. & Chase, R.B. (2018). Operations and Supply Chain
 *   Management, 15th ed., McGraw-Hill — the MRP time-phased record.
 */
import { explain } from '@logistics-ts/core'
import { requireNonNegative } from '../lot-sizing/validate'
import { round } from '../round'
import type { MrpInput, MrpPlan, MrpRow } from './types'

/**
 * Builds the time-phased netting grid for one item: period by period, net the
 * gross requirements against what is already available (the prior period's
 * projected available balance) plus what is already on order (scheduled
 * receipts), and create a planned order receipt for any shortfall.
 *
 * Formula, for each period `t = 0 … T−1` with `PAB₋₁ = onHand`:
 * - `net_t   = max(0, GR_t − PAB_{t−1} − SR_t)`
 * - `PORcpt_t = net_t` — **lot-for-lot only** in this version: the receipt
 *   exactly covers the net requirement, so `PAB_t` lands on zero whenever an
 *   order is planned. (A pluggable lot rule and a safety-stock floor are
 *   planned; a lead-time offset / planned order *release* is not modelled yet,
 *   so every receipt is shown in the period it is needed.)
 * - `PAB_t   = PAB_{t−1} + SR_t + PORcpt_t − GR_t`
 *
 * Units: everything is in demand units, and every index is a **period
 * (bucket)** — never a date and never a day count. The grid inherits whatever
 * calendar granularity the caller bucketed `grossRequirements` at.
 *
 * Constraints: `onHand` and every entry of `grossRequirements` /
 * `scheduledReceipts` must be finite and non-negative; `scheduledReceipts` may
 * be shorter than (or omitted from) the horizon but never longer.
 *
 * @param input - The {@link MrpInput} demand/supply picture for one item.
 * @returns An `Explained` grid: `{ rows }`, one {@link MrpRow} per period.
 * @example
 * ```ts
 * mrpGrid({ grossRequirements: [0, 30, 20], scheduledReceipts: [0, 20], onHand: 25 }).value.rows
 * // [
 * //   { period: 0, grossRequirements: 0,  scheduledReceipts: 0,  projectedAvailableBalance: 25, netRequirements: 0, plannedOrderReceipt: 0 },
 * //   { period: 1, grossRequirements: 30, scheduledReceipts: 20, projectedAvailableBalance: 15, netRequirements: 0, plannedOrderReceipt: 0 },
 * //   { period: 2, grossRequirements: 20, scheduledReceipts: 0,  projectedAvailableBalance: 0,  netRequirements: 5, plannedOrderReceipt: 5 },
 * // ]
 * ```
 */
export function mrpGrid(input: MrpInput): MrpPlan {
  const { grossRequirements, scheduledReceipts, onHand } = input
  requireNonNegative('onHand', onHand)
  if (scheduledReceipts !== undefined && scheduledReceipts.length > grossRequirements.length) {
    throw new Error(
      `scheduledReceipts must not be longer than grossRequirements (got ${scheduledReceipts.length} > ${grossRequirements.length})`,
    )
  }

  const rows: MrpRow[] = []
  let previousBalance = onHand
  let totalPlanned = 0
  let orderCount = 0

  for (let period = 0; period < grossRequirements.length; period++) {
    const gross = grossRequirements[period] ?? 0
    requireNonNegative(`grossRequirements[${period}]`, gross)
    const receipt = scheduledReceipts?.[period] ?? 0
    requireNonNegative(`scheduledReceipts[${period}]`, receipt)

    const netRequirements = Math.max(0, gross - previousBalance - receipt)
    const plannedOrderReceipt = netRequirements
    const projectedAvailableBalance = previousBalance + receipt + plannedOrderReceipt - gross

    if (plannedOrderReceipt > 0) {
      totalPlanned += plannedOrderReceipt
      orderCount++
    }
    rows.push({
      period,
      grossRequirements: gross,
      scheduledReceipts: receipt,
      projectedAvailableBalance,
      netRequirements,
      plannedOrderReceipt,
    })
    previousBalance = projectedAvailableBalance
  }

  const totalGross = rows.reduce((sum, r) => sum + r.grossRequirements, 0)
  const totalScheduled = rows.reduce((sum, r) => sum + r.scheduledReceipts, 0)

  return explain(
    { rows },
    {
      method: 'mrp-netting-grid',
      inputs: {
        periods: grossRequirements.length,
        onHand: round(onHand),
        totalGrossRequirements: round(totalGross),
        totalScheduledReceipts: round(totalScheduled),
        totalPlannedOrderReceipts: round(totalPlanned),
        plannedOrders: orderCount,
      },
      reasoning: [
        'time-phased netting, period by period: net_t = max(0, grossRequirements_t − projectedAvailableBalance_{t−1} − scheduledReceipts_t), starting from projectedAvailableBalance_{−1} = onHand',
        'a positive net requirement creates a planned order receipt in the same period, sized lot-for-lot (receipt = net requirement), so no lead-time offset or release is modelled here',
        'projectedAvailableBalance_t = projectedAvailableBalance_{t−1} + scheduledReceipts_t + plannedOrderReceipt_t − grossRequirements_t, and is never negative',
        `over ${grossRequirements.length} periods, gross requirements ${round(totalGross)} were covered by onHand ${round(onHand)} + scheduled receipts ${round(totalScheduled)} + ${orderCount} planned order receipts totalling ${round(totalPlanned)}`,
      ],
      citations: [
        'Orlicky, J. (1975), Material Requirements Planning, McGraw-Hill.',
        'Jacobs, F.R. & Chase, R.B. (2018), Operations and Supply Chain Management, 15th ed.',
      ],
    },
  )
}
