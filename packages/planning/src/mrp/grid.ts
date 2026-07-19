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
import type { MrpInput, MrpPlan, MrpRow, PlannedOrderSchedule } from './types'

/** Above this many planned orders the narration summarises instead of listing. */
const MAX_NARRATED_ORDERS = 12

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
 * 3. **Offset** — release each receipt `leadTimePeriods` earlier:
 *    `plannedOrderRelease_{t−L} = plannedOrderReceipt_t`. A release landing
 *    before period 0 is **past due** — the receipt is kept (the demand is real)
 *    and reported in `warnings` and `plannedOrders`, never dropped or clamped.
 * 4. **Rebuild** — recompute `PAB_t = PAB_{t−1} + SR_t + PORcpt_t − GR_t`
 *    against those receipts. Periods a lot already covered net to zero and
 *    carry the surplus forward. Note the balance follows *receipts*: a lead
 *    time shifts when an order is placed, not when it arrives.
 *
 * Because every rule in the family is feasible and conserving — it never orders
 * late and orders `Σ net` in total — the rebuilt balance is always at least the
 * pass-1 balance, so `PAB_t ≥ safetyStock` holds for every rule. Under
 * lot-for-lot the receipt equals the net requirement exactly, so the balance
 * lands *on* the floor whenever an order is planned; under every other rule it
 * may sit above the floor.
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
 * @returns An `Explained` grid: `{ rows, plannedOrders }` — one {@link MrpRow}
 *   per period plus the {@link PlannedOrderSchedule} release/receipt pairs.
 *   Carries a `warnings` entry when any release is past due.
 * @example
 * ```ts
 * const plan = mrpGrid({
 *   grossRequirements: [0, 30, 20],
 *   scheduledReceipts: [0, 20],
 *   onHand: 25,
 *   leadTimePeriods: 1,
 * })
 *
 * plan.value.rows.map((r) => r.projectedAvailableBalance) // [25, 15, 0]
 * plan.value.rows.map((r) => r.netRequirements)           // [0, 0, 5]
 * plan.value.rows.map((r) => r.plannedOrderReceipt)       // [0, 0, 5]
 * plan.value.rows.map((r) => r.plannedOrderRelease)       // [0, 5, 0]  ← released a period early
 * plan.value.plannedOrders
 * // [{ releasePeriod: 1, receiptPeriod: 2, quantity: 5, pastDue: false }]
 * ```
 */
export function mrpGrid(input: MrpInput): MrpPlan {
  const { grossRequirements, scheduledReceipts, onHand } = input
  const safetyStock = input.safetyStock ?? 0
  const lotRule: LotSizeOptions = input.lotRule ?? DEFAULT_LOT_RULE
  const leadTimePeriods = input.leadTimePeriods ?? 0
  requireNonNegative('onHand', onHand)
  requireNonNegative('safetyStock', safetyStock)
  // Periods, not days — a fractional bucket offset is meaningless in a
  // period-indexed grid, so require an integer rather than rounding one.
  if (!Number.isInteger(leadTimePeriods) || leadTimePeriods < 0) {
    throw new Error(
      `leadTimePeriods must be a non-negative integer number of periods/buckets (got ${leadTimePeriods})`,
    )
  }
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

  // Pass 2b — offset. Each receipt is released `leadTimePeriods` earlier. A
  // release before period 0 is PAST DUE: the receipt stays (the demand is
  // real), but it is reported, never dropped and never clamped to period 0 as
  // though it were actionable.
  const plannedReleases = new Array<number>(horizon).fill(0)
  const plannedOrders: PlannedOrderSchedule[] = []
  for (let receiptPeriod = 0; receiptPeriod < horizon; receiptPeriod++) {
    const quantity = plannedReceipts[receiptPeriod] ?? 0
    if (quantity <= 0) continue
    const releasePeriod = receiptPeriod - leadTimePeriods
    const pastDue = releasePeriod < 0
    if (!pastDue) {
      plannedReleases[releasePeriod] = (plannedReleases[releasePeriod] ?? 0) + quantity
    }
    plannedOrders.push({ releasePeriod, receiptPeriod, quantity, pastDue })
  }
  const pastDueOrders = plannedOrders.filter((o) => o.pastDue)

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
      plannedOrderRelease: plannedReleases[period] ?? 0,
    })
    previousBalance = projectedAvailableBalance
  }

  const totalGross = rows.reduce((sum, r) => sum + r.grossRequirements, 0)
  const totalScheduled = rows.reduce((sum, r) => sum + r.scheduledReceipts, 0)

  // Narrate each planned order back to the net requirement that caused it —
  // the explainability payoff. Long horizons summarise instead of emitting one
  // bullet per order, so the explanation stays readable.
  const orderNarration =
    plannedOrders.length === 0
      ? ['no planned orders — on-hand, scheduled receipts, and the floor already cover the horizon']
      : plannedOrders.length <= MAX_NARRATED_ORDERS
        ? plannedOrders.map(
            (o) =>
              `planned order of ${round(o.quantity)} sized by '${lotRule.rule}' to cover the net requirement first arising in period ${o.receiptPeriod}: receive in period ${o.receiptPeriod}, release in period ${o.releasePeriod}${o.pastDue ? ' — PAST DUE, before the start of the horizon' : ''}`,
          )
        : [
            `${plannedOrders.length} planned orders sized by '${lotRule.rule}' totalling ${round(totalPlanned)} units, each released ${leadTimePeriods} period(s) before the period whose net requirement it covers (individual orders not narrated — over ${MAX_NARRATED_ORDERS} of them; read plannedOrders for the full schedule)`,
          ]

  const warnings =
    pastDueOrders.length > 0
      ? [
          `${pastDueOrders.length} planned order(s) are PAST DUE — their release period falls before the start of the horizon, so the plan is infeasible as scheduled: ${pastDueOrders
            .map(
              (o) =>
                `${round(o.quantity)} units needed in period ${o.receiptPeriod} should have been released in period ${o.releasePeriod} (${-o.releasePeriod} period(s) ago)`,
            )
            .join('; ')}. Expedite, or re-plan with an earlier horizon start.`,
        ]
      : undefined

  return explain(
    { rows, plannedOrders },
    {
      method: 'mrp-netting-grid',
      inputs: {
        periods: horizon,
        onHand: round(onHand),
        safetyStock: round(safetyStock),
        lotRule: lotRule.rule,
        leadTimePeriods,
        totalGrossRequirements: round(totalGross),
        totalScheduledReceipts: round(totalScheduled),
        totalPlannedOrderReceipts: round(totalPlanned),
        plannedOrders: orderCount,
        pastDueOrders: pastDueOrders.length,
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
        'projectedAvailableBalance_t = projectedAvailableBalance_{t−1} + scheduledReceipts_t + plannedOrderReceipt_t − grossRequirements_t',
        leadTimePeriods === 0
          ? 'leadTimePeriods = 0, so every order is released in the same period it is received'
          : `each receipt is released ${leadTimePeriods} period(s) earlier (plannedOrderRelease_t = plannedOrderReceipt_{t+${leadTimePeriods}}); the offset is in periods/buckets, not days`,
        ...orderNarration,
        `over ${horizon} periods, gross requirements ${round(totalGross)} were covered by onHand ${round(onHand)} + scheduled receipts ${round(totalScheduled)} + ${orderCount} planned order receipts totalling ${round(totalPlanned)}`,
      ],
      citations: [
        'Orlicky, J. (1975), Material Requirements Planning, McGraw-Hill.',
        'Jacobs, F.R. & Chase, R.B. (2018), Operations and Supply Chain Management, 15th ed.',
      ],
      ...(warnings ? { warnings } : {}),
    },
  )
}
