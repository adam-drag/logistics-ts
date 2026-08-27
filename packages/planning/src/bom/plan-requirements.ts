/**
 * Multi-level MRP: explode a master production schedule down a bill of
 * materials, netting and lot-sizing each item in low-level-code order, so that
 * every component's demand is driven by its parents' planned order **releases**.
 *
 * @see Orlicky, J. (1975). Material Requirements Planning, McGraw-Hill —
 *   the MRP explosion/netting cycle.
 * @see Jacobs, F.R. & Chase, R.B. (2018). Operations and Supply Chain
 *   Management, 15th ed., McGraw-Hill — multi-level MRP.
 */
import { type BomRecord, explain } from '@logistics-ts/core'
import { mrpGrid } from '../mrp/grid'
import { round } from '../round'
import { assignLowLevelCodes } from './low-level-codes'
import type {
  ItemPlan,
  ItemRequirements,
  MultiLevelPlan,
  PlanRequirementsInput,
  RequirementsPlan,
} from './types'

/** Above this many items the narration summarises instead of listing each one. */
const MAX_NARRATED_ITEMS = 12

/**
 * Runs a full multi-level MRP pass: master schedule → dependent requirements →
 * netted, lot-sized, lead-time-offset planned orders for every item.
 *
 * The pass walks items in ascending low-level code. For each item:
 *
 * 1. **Gross requirements** = its independent demand from the master schedule,
 *    plus, for every BOM edge `parent -> item`, `quantityPer ×` the parent's
 *    **planned order release** in that period.
 * 2. **Net, lot-size and offset** by handing that series to {@link mrpGrid}
 *    with the item's own on-hand, scheduled receipts, safety stock, lot rule
 *    and lead time.
 * 3. Its resulting releases become its children's demand on a later iteration.
 *
 * The release, not the receipt, is what drives dependent demand — that is the
 * whole point of MRP. A parent that must be *started* in period 3 needs its
 * components in period 3, not in period 5 when the finished parent arrives.
 * Using gross requirements instead (what {@link explode} does, deliberately)
 * would ignore the parent's own stock and lead time, and schedule components
 * against demand that netting may have already covered.
 *
 * Because a low-level code is the *longest* path from an end item, every parent
 * of an item is planned before the item itself, so one pass suffices.
 *
 * Units: `quantityPer` is units-of-child per unit-of-parent. Every index is a
 * **period (bucket)**, never a date; `leadTimePeriods` is in those same buckets.
 *
 * Constraints: the BOM must be acyclic (a cycle throws a `RangeError` naming an
 * offending edge). Per-item planning data is optional and defaults to no stock,
 * no receipts, no safety stock, zero lead time, and lot-for-lot.
 *
 * @param input - The {@link PlanRequirementsInput} BOM, master schedule and
 *   per-item planning data.
 * @returns An `Explained` {@link MultiLevelPlan}: one {@link ItemPlan} per item
 *   in planning order, each carrying the full netting grid for that item.
 * @throws RangeError if the BOM contains a cycle.
 * @example
 * ```ts
 * // A (lead time 1) is built from 2 B (lead time 2). 10 A needed in period 3.
 * const plan = planRequirements({
 *   bom: [{ parentId: 'A', childId: 'B', quantityPer: 2 }],
 *   masterSchedule: [{ itemId: 'A', requirements: [0, 0, 0, 10] }],
 *   items: { A: { leadTimePeriods: 1 }, B: { leadTimePeriods: 2 } },
 * })
 *
 * plan.value.items.A.rows.map((r) => r.plannedOrderRelease) // [0, 0, 10, 0]
 * // B's demand follows A's RELEASE in period 2, not A's requirement in 3:
 * plan.value.items.B.grossRequirements                      // [0, 0, 20, 0]
 * plan.value.items.B.rows.map((r) => r.plannedOrderRelease)  // [20, 0, 0, 0]
 * ```
 */
export function planRequirements(input: PlanRequirementsInput): RequirementsPlan {
  const { bom, masterSchedule } = input
  const items = input.items ?? {}
  if (!Array.isArray(bom)) {
    throw new TypeError(`bom must be an array of BOM lines (got ${typeof bom})`)
  }
  if (!Array.isArray(masterSchedule)) {
    throw new TypeError(`masterSchedule must be an array (got ${typeof masterSchedule})`)
  }
  for (const [index, line] of bom.entries()) {
    if (line === null || typeof line !== 'object') {
      throw new TypeError(`bom[${index}] must be a BOM line object (got ${typeof line})`)
    }
    if (line.parentId === line.childId) {
      throw new RangeError(
        `bom[${index}] makes '${line.parentId}' a component of itself (parentId === childId)`,
      )
    }
  }

  // Horizon is set by the master schedule: it is the independent demand the
  // whole plan answers. Every item's grid runs over exactly this many periods.
  let horizon = 0
  for (const [index, entry] of masterSchedule.entries()) {
    if (!Array.isArray(entry?.requirements)) {
      throw new TypeError(`masterSchedule[${index}].requirements must be an array`)
    }
    horizon = Math.max(horizon, entry.requirements.length)
  }

  const independent = new Map<string, number[]>()
  for (const entry of masterSchedule) {
    const row = independent.get(entry.itemId) ?? new Array<number>(horizon).fill(0)
    for (let period = 0; period < entry.requirements.length; period++) {
      row[period] = (row[period] ?? 0) + (entry.requirements[period] ?? 0)
    }
    independent.set(entry.itemId, row)
  }

  const seeds = masterSchedule.map((entry) => entry.itemId)
  const lowLevelCodes = assignLowLevelCodes(bom, seeds)

  const edgesByParent = new Map<string, BomRecord>()
  for (const line of bom) {
    const list = edgesByParent.get(line.parentId)
    if (list) list.push(line)
    else edgesByParent.set(line.parentId, [line])
  }

  // Dependent demand accumulates here as parents are planned. An item is only
  // read once every one of its parents has been planned, which the low-level
  // code ordering guarantees.
  const dependent = new Map<string, number[]>()
  const order = Object.keys(lowLevelCodes).sort(
    (a, b) => (lowLevelCodes[a] ?? 0) - (lowLevelCodes[b] ?? 0) || a.localeCompare(b),
  )

  const planned: Record<string, ItemPlan> = {}
  const plannedOrder: string[] = []
  const pastDueParents: string[] = []
  let totalPlannedOrders = 0

  for (const itemId of order) {
    const own = independent.get(itemId)
    const inherited = dependent.get(itemId)
    if (!own && !inherited) {
      // Nothing above this item is scheduled and it has no independent demand.
      // It is a dead BOM branch; reported in warnings rather than given a grid.
      continue
    }
    const grossRequirements = new Array<number>(horizon).fill(0)
    for (let period = 0; period < horizon; period++) {
      grossRequirements[period] = (own?.[period] ?? 0) + (inherited?.[period] ?? 0)
    }

    const data = items[itemId] ?? {}
    const grid = mrpGrid({
      grossRequirements,
      onHand: data.onHand ?? 0,
      ...(data.scheduledReceipts ? { scheduledReceipts: data.scheduledReceipts } : {}),
      ...(data.safetyStock !== undefined ? { safetyStock: data.safetyStock } : {}),
      ...(data.leadTimePeriods !== undefined ? { leadTimePeriods: data.leadTimePeriods } : {}),
      ...(data.lotRule ? { lotRule: data.lotRule } : {}),
    })

    planned[itemId] = {
      itemId,
      lowLevelCode: lowLevelCodes[itemId] ?? 0,
      grossRequirements,
      rows: grid.value.rows,
      plannedOrders: grid.value.plannedOrders,
      ...(grid.warnings ? { warnings: grid.warnings } : {}),
    }
    plannedOrder.push(itemId)
    totalPlannedOrders += grid.value.plannedOrders.length

    // A past-due release sits before period 0, so the components it would have
    // consumed cannot be scheduled inside the horizon at all. Their gross
    // requirements are therefore UNDERSTATED, not merely late — a distinct and
    // more serious condition than the grid's own past-due warning, and one the
    // caller cannot infer from the child's plan alone.
    if (grid.value.plannedOrders.some((o) => o.pastDue) && edgesByParent.has(itemId)) {
      pastDueParents.push(itemId)
    }

    // Push this item's RELEASES down to its children.
    for (const edge of edgesByParent.get(itemId) ?? []) {
      const childRow = dependent.get(edge.childId) ?? new Array<number>(horizon).fill(0)
      for (let period = 0; period < horizon; period++) {
        const release = grid.value.rows[period]?.plannedOrderRelease ?? 0
        childRow[period] = (childRow[period] ?? 0) + release * edge.quantityPer
      }
      dependent.set(edge.childId, childRow)
    }
  }

  const unreachable = Object.keys(lowLevelCodes).filter((id) => planned[id] === undefined)
  const maxLevel = plannedOrder.reduce((max, id) => Math.max(max, lowLevelCodes[id] ?? 0), 0)

  const itemNarration =
    plannedOrder.length <= MAX_NARRATED_ITEMS
      ? plannedOrder.map((id) => {
          const p = planned[id] as ItemPlan
          const total = p.plannedOrders.reduce((s, o) => s + o.quantity, 0)
          return `'${id}' (low-level code ${p.lowLevelCode}): ${p.plannedOrders.length} planned order(s) totalling ${round(total)}`
        })
      : [
          `${plannedOrder.length} items planned across low-level codes 0..${maxLevel} (individual items not narrated — over ${MAX_NARRATED_ITEMS} of them; read items for the full plan)`,
        ]

  const warnings: string[] = []
  if (pastDueParents.length > 0) {
    warnings.push(
      `${pastDueParents.length} item(s) have PAST-DUE planned order releases AND components beneath them, so those components' gross requirements are UNDERSTATED — the demand that would have been driven from before period 0 could not be scheduled: ${pastDueParents.slice(0, 8).join(', ')}${pastDueParents.length > 8 ? `, … (${pastDueParents.length} total)` : ''}. Re-plan with an earlier horizon start.`,
    )
  }
  if (unreachable.length > 0) {
    warnings.push(
      `${unreachable.length} item(s) in the bill of materials were not planned — no independent demand reaches them: ${unreachable.slice(0, 8).join(', ')}${unreachable.length > 8 ? `, … (${unreachable.length} total)` : ''}`,
    )
  }

  return explain(
    { items: planned, lowLevelCodes, order: plannedOrder },
    {
      method: 'mrp-plan-requirements',
      inputs: {
        bomLines: bom.length,
        masterScheduleLines: masterSchedule.length,
        itemsPlanned: plannedOrder.length,
        periods: horizon,
        maxLowLevelCode: maxLevel,
        plannedOrders: totalPlannedOrders,
      },
      reasoning: [
        `planned ${plannedOrder.length} item(s) over ${horizon} period(s) in ascending low-level code (deepest ${maxLevel}), so every parent was netted before any of its components read it`,
        "each component's gross requirement is quantityPer × its parents' planned order RELEASES — the release, not the receipt, because a parent that must be started in a period needs its components in that period, and netting the parent first means its own stock and lead time are already accounted for",
        'each item was then netted, lot-sized and lead-time offset by the same mrpGrid used for single-item planning — this function composes that, it does not re-implement it',
        ...itemNarration,
      ],
      citations: [
        'Orlicky, J. (1975), Material Requirements Planning, McGraw-Hill.',
        'Jacobs, F.R. & Chase, R.B. (2018), Operations and Supply Chain Management, 15th ed.',
      ],
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  )
}

export type { ItemRequirements, MultiLevelPlan }
