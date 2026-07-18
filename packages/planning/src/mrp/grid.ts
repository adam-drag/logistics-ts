/**
 * The time-phased netting grid: the canonical MRP record for a single item.
 *
 * @see Orlicky, J. (1975). Material Requirements Planning, McGraw-Hill.
 * @see Jacobs, F.R. & Chase, R.B. (2018). Operations and Supply Chain
 *   Management, 15th ed., McGraw-Hill — the MRP time-phased record.
 */
import { explain } from '@logistics-ts/core'
import { type LotSizeOptions, lotSize } from '../lot-sizing/lot-size'
import { requireNonNegative } from '../lot-sizing/validate'
import { round } from '../round'
import type { MrpInput, MrpPlan, MrpRow } from './types'

/**
 * Default lot rule: lot-for-lot. Its plan is independent of the cost
 * parameters — it never carries inventory and orders once per nonzero-net
 * period — so zero costs are the honest default rather than an invented price.
 */
const DEFAULT_LOT_RULE: LotSizeOptions = {
  rule: 'lot-for-lot',
  setupCost: 0,
  holdingCostPerUnitPerPeriod: 0,
}

/**
 * Builds the time-phased netting grid for one item: period by period, net the
 * gross requirements against what is already available (the prior period's
 * projected available balance) plus what is already on order (scheduled
 * receipts), and create a planned order receipt for any shortfall.
 *
 * Runs in three passes, because lot sizing is not a per-period decision —
 * Silver-Meal and Wagner-Whitin need the whole net-requirements vector at once:
 *
 * 1. **Net** — walk the horizon lot-for-lot with `PAB₋₁ = onHand`, computing
 *    `net_t = max(0, GR_t + safetyStock − PAB_{t−1} − SR_t)` and
 *    `PAB_t = PAB_{t−1} + SR_t + net_t − GR_t`. This yields the genuine
 *    net-requirements *series*: what must actually be procured.
 * 2. **Lot-size** — hand that whole series to {@link lotSize} with `lotRule`,
 *    giving planned order receipts by period. A rule may order early and cover
 *    several periods with one lot.
 * 3. **Rebuild** — recompute `PAB_t = PAB_{t−1} + SR_t + PORcpt_t − GR_t`
 *    against those receipts. Periods a lot already covered net to zero and
 *    carry the surplus forward.
 *
 * Because every rule in the family is feasible and conserving — it never orders
 * late and orders `Σ net` in total — the rebuilt balance is always at least the
 * pass-1 balance, so `PAB_t ≥ safetyStock` holds for every rule. Under
 * lot-for-lot the receipt equals the net requirement exactly, so the balance
 * lands *on* the floor whenever an order is planned; under every other rule it
 * may sit above the floor. No lead-time offset is modelled yet, so each receipt
 * is shown in the period it is needed and there is no planned order *release*.
 *
 * Units: everything is in demand units, and every index is a **period
 * (bucket)** — never a date and never a day count. The grid inherits whatever
 * calendar granularity the caller bucketed `grossRequirements` at.
 *
 * Constraints: `onHand`, `safetyStock`, and every entry of `grossRequirements`
 * / `scheduledReceipts` must be finite and non-negative; `scheduledReceipts`
 * may be shorter than (or omitted from) the horizon but never longer.
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
  const safetyStock = input.safetyStock ?? 0
  const lotRule: LotSizeOptions = input.lotRule ?? DEFAULT_LOT_RULE
  requireNonNegative('onHand', onHand)
  requireNonNegative('safetyStock', safetyStock)
  if (scheduledReceipts !== undefined && scheduledReceipts.length > grossRequirements.length) {
    throw new Error(
      `scheduledReceipts must not be longer than grossRequirements (got ${scheduledReceipts.length} > ${grossRequirements.length})`,
    )
  }

  const horizon = grossRequirements.length
  const gross: number[] = []
  const receipts: number[] = []
  for (let period = 0; period < horizon; period++) {
    const g = grossRequirements[period] ?? 0
    requireNonNegative(`grossRequirements[${period}]`, g)
    const sr = scheduledReceipts?.[period] ?? 0
    requireNonNegative(`scheduledReceipts[${period}]`, sr)
    gross.push(g)
    receipts.push(sr)
  }

  // Pass 1 — net. Walk the horizon lot-for-lot to recover the genuine
  // net-requirements SERIES: what must actually be procured, once on-hand,
  // scheduled receipts, and the safety-stock floor are accounted for.
  const netSeries: number[] = []
  let balance = onHand
  for (let period = 0; period < horizon; period++) {
    const g = gross[period] ?? 0
    const sr = receipts[period] ?? 0
    const net = Math.max(0, g + safetyStock - balance - sr)
    netSeries.push(net)
    balance = balance + sr + net - g
  }

  // Pass 2 — lot-size. Hand the WHOLE net series to the dispatcher: Silver-Meal
  // and Wagner-Whitin are horizon algorithms and cannot be driven period by
  // period. A rule may order early and cover several periods with one lot.
  const lotPlan = lotSize(netSeries, lotRule)
  const plannedReceipts = new Array<number>(horizon).fill(0)
  for (const order of lotPlan.value.orders) {
    plannedReceipts[order.period] = (plannedReceipts[order.period] ?? 0) + order.quantity
  }

  // Pass 3 — rebuild. Recompute the balances against the lot-sized receipts.
  // Periods a lot covered early now net to zero and carry surplus forward.
  const rows: MrpRow[] = []
  let previousBalance = onHand
  let totalPlanned = 0
  let orderCount = 0

  for (let period = 0; period < horizon; period++) {
    const g = gross[period] ?? 0
    const receipt = receipts[period] ?? 0
    const plannedOrderReceipt = plannedReceipts[period] ?? 0
    const netRequirements = Math.max(0, g + safetyStock - previousBalance - receipt)
    const projectedAvailableBalance = previousBalance + receipt + plannedOrderReceipt - g

    if (plannedOrderReceipt > 0) {
      totalPlanned += plannedOrderReceipt
      orderCount++
    }
    rows.push({
      period,
      grossRequirements: g,
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
        periods: horizon,
        onHand: round(onHand),
        safetyStock: round(safetyStock),
        lotRule: lotRule.rule,
        totalGrossRequirements: round(totalGross),
        totalScheduledReceipts: round(totalScheduled),
        totalPlannedOrderReceipts: round(totalPlanned),
        plannedOrders: orderCount,
      },
      reasoning: [
        `time-phased netting, period by period: net_t = max(0, grossRequirements_t + safetyStock ${round(safetyStock)} − projectedAvailableBalance_{t−1} − scheduledReceipts_t), starting from projectedAvailableBalance_{−1} = onHand`,
        safetyStock > 0
          ? `the safety-stock floor of ${round(safetyStock)} is netted against as if it were extra demand, so projectedAvailableBalance never drops below it — this pulls orders earlier and larger than they would otherwise be`
          : 'no safety-stock floor was set (safetyStock = 0), so the balance is netted down to zero',
        `the net-requirements series was lot-sized as a whole by the '${lotRule.rule}' rule — lot sizing is a horizon decision, not a per-period one, so the grid delegates the entire vector to lotSize rather than sizing each period independently`,
        lotRule.rule === 'lot-for-lot'
          ? 'under lot-for-lot each receipt equals its period’s net requirement exactly, so the balance lands on the floor whenever an order is planned and nothing is carried beyond it'
          : `'${lotRule.rule}' may order early to cover several periods with one lot, so a covered period shows netRequirements = 0 and the balance sits above the floor while the surplus is carried forward`,
        'projectedAvailableBalance_t = projectedAvailableBalance_{t−1} + scheduledReceipts_t + plannedOrderReceipt_t − grossRequirements_t; no lead-time offset or planned order release is modelled here, so each receipt is shown in the period it is needed',
        `over ${horizon} periods, gross requirements ${round(totalGross)} were covered by onHand ${round(onHand)} + scheduled receipts ${round(totalScheduled)} + ${orderCount} planned order receipts totalling ${round(totalPlanned)}`,
      ],
      citations: [
        'Orlicky, J. (1975), Material Requirements Planning, McGraw-Hill.',
        'Jacobs, F.R. & Chase, R.B. (2018), Operations and Supply Chain Management, 15th ed.',
      ],
    },
  )
}
