/**
 * BOM explosion: independent demand for end items becomes dependent gross
 * requirements for every component beneath them, processed in low-level-code
 * order so each item is accumulated exactly once, after all of its parents.
 *
 * @see Orlicky, J. (1975). Material Requirements Planning, McGraw-Hill —
 *   product structure, low-level codes, and the explosion process.
 * @see Jacobs, F.R. & Chase, R.B. (2018). Operations and Supply Chain
 *   Management, 15th ed., McGraw-Hill — multi-level BOM explosion.
 */
import { type BomRecord, explain } from '@logistics-ts/core'
import { round } from '../round'
import { assignLowLevelCodes } from './low-level-codes'
import type { Explosion, ItemRequirements } from './types'
import { requireValidBom, requireValidRequirements } from './validate'

/** Above this many items the narration summarises instead of listing each one. */
const MAX_NARRATED_ITEMS = 12

/**
 * Explodes independent demand for end items down a bill of materials into
 * dependent gross requirements for every component.
 *
 * For each BOM edge `parent -> child` with `quantityPer` q, the child inherits
 * `q ×` the parent's gross requirement **in the same period**:
 *
 * `grossRequirements[child][t] += quantityPer × grossRequirements[parent][t]`
 *
 * Items are processed in ascending low-level code, so a parent's requirement is
 * complete before any of its children read it. Because a low-level code is the
 * *longest* path from an end item, every parent of an item has a strictly
 * smaller code than the item itself — that is exactly what makes one pass
 * sufficient.
 *
 * This is the **gross** explosion: it applies no netting, no on-hand, and no
 * lead-time offset, so a child's requirement lands in the same period as its
 * parent's. Netting each component against its own stock — and offsetting the
 * dependent demand to the parent's planned order *releases* rather than its
 * gross requirements — is the job of `planRequirements`, which composes this
 * with {@link mrpGrid}.
 *
 * Units: `quantityPer` is units-of-child per unit-of-parent; requirements are in
 * each item's own units. Every index is a **period (bucket)**, never a date.
 *
 * Constraints: every `quantityPer` and every requirement entry must be finite
 * and non-negative. The BOM must be **acyclic**; a cycle throws a `RangeError`
 * naming an offending edge. Driving items with differing horizon lengths are
 * padded to the longest with zeros.
 *
 * @param bom - The product-structure edge list ({@link BomRecord}).
 * @param demand - Independent demand per end item ({@link ItemRequirements}).
 * @returns An `Explained` {@link ExplosionResult}: `grossRequirements` per item
 *   per period, plus the `lowLevelCodes` that ordered the pass. The two maps
 *   deliberately differ in coverage — `lowLevelCodes` describes the whole BOM
 *   structure, while `grossRequirements` holds only items the driving demand
 *   actually reaches. Items in the BOM that nothing schedules are reported in
 *   `warnings` rather than padded in with zero rows.
 * @throws RangeError if the BOM contains a cycle.
 * @example
 * ```ts
 * // A is built from 2 B; B is built from 3 C. 100 A in period 1.
 * const x = explode(
 *   [
 *     { parentId: 'A', childId: 'B', quantityPer: 2 },
 *     { parentId: 'B', childId: 'C', quantityPer: 3 },
 *   ],
 *   [{ itemId: 'A', requirements: [0, 100] }],
 * )
 *
 * x.value.grossRequirements.A // [0, 100]
 * x.value.grossRequirements.B // [0, 200]  ← 100 × 2
 * x.value.grossRequirements.C // [0, 600]  ← 200 × 3
 * x.value.lowLevelCodes       // { A: 0, B: 1, C: 2 }
 * ```
 */
export function explode(bom: BomRecord, demand: readonly ItemRequirements[]): Explosion {
  requireValidBom(bom)
  // Horizon = the longest driving series; shorter ones are zero-padded so every
  // output row is the same length and callers can zip them without checking.
  const horizon = requireValidRequirements('demand', demand)

  const grossRequirements: Record<string, number[]> = {}
  const ensure = (itemId: string): number[] => {
    const existing = grossRequirements[itemId]
    if (existing) return existing
    const fresh = new Array<number>(horizon).fill(0)
    grossRequirements[itemId] = fresh
    return fresh
  }

  const seeds: string[] = []
  for (const entry of demand) {
    seeds.push(entry.itemId)
    const row = ensure(entry.itemId)
    // `.entries()` rather than an index loop: every value is already known
    // finite (requireValidRequirements ran above), and iterating this way types
    // it as `number` without a cast or a `?? 0` that would look like the
    // hole-swallowing coalesce this function deliberately does not do.
    for (const [period, q] of entry.requirements.entries()) {
      // `+=`, not `=`: the same itemId may legitimately appear twice in the
      // driving demand (two order streams for one end item), and silently
      // dropping the first would understate the whole explosion beneath it.
      row[period] = (row[period] ?? 0) + q
    }
  }

  const lowLevelCodes = assignLowLevelCodes(bom, seeds)

  // Group the edges by parent so the pass touches each parent once.
  const edgesByParent = new Map<string, BomRecord>()
  for (const line of bom) {
    const list = edgesByParent.get(line.parentId)
    if (list) list.push(line)
    else edgesByParent.set(line.parentId, [line])
  }

  // Walk items in ascending low-level code. Every parent of an item has a
  // strictly smaller code (a longest path to a child is at least one more than
  // to any of its parents), so a parent's row is final before a child reads it.
  const order = Object.keys(lowLevelCodes).sort(
    (a, b) => (lowLevelCodes[a] ?? 0) - (lowLevelCodes[b] ?? 0),
  )
  let edgesApplied = 0
  for (const parent of order) {
    const edges = edgesByParent.get(parent)
    if (!edges) continue
    const parentRow = grossRequirements[parent]
    if (!parentRow) continue
    for (const edge of edges) {
      const childRow = ensure(edge.childId)
      for (let period = 0; period < horizon; period++) {
        childRow[period] = (childRow[period] ?? 0) + (parentRow[period] ?? 0) * edge.quantityPer
      }
      edgesApplied++
    }
  }

  const itemIds = Object.keys(grossRequirements)
  const maxLevel = itemIds.reduce((max, id) => Math.max(max, lowLevelCodes[id] ?? 0), 0)
  const totalsByItem = itemIds.map((id) => ({
    itemId: id,
    total: (grossRequirements[id] ?? []).reduce((sum, q) => sum + q, 0),
    level: lowLevelCodes[id] ?? 0,
  }))
  // Items present in the BOM that no driving demand reaches. They get no
  // requirements row at all (nothing requires them), so they are invisible in
  // `grossRequirements` — which makes them exactly the kind of dead branch a
  // planner wants told about rather than silently dropped.
  const unreachable = Object.keys(lowLevelCodes).filter((id) => grossRequirements[id] === undefined)

  const itemNarration =
    totalsByItem.length <= MAX_NARRATED_ITEMS
      ? totalsByItem
          .slice()
          .sort((a, b) => a.level - b.level || a.itemId.localeCompare(b.itemId))
          .map(
            (t) =>
              `'${t.itemId}' (low-level code ${t.level}) requires ${round(t.total)} over the horizon`,
          )
      : [
          `${totalsByItem.length} items across low-level codes 0..${maxLevel} (individual totals not narrated — over ${MAX_NARRATED_ITEMS} of them; read grossRequirements for the full picture)`,
        ]

  return explain(
    { grossRequirements, lowLevelCodes },
    {
      method: 'bom-explosion',
      inputs: {
        bomLines: bom.length,
        drivingItems: demand.length,
        items: itemIds.length,
        periods: horizon,
        maxLowLevelCode: maxLevel,
        edgesApplied,
      },
      reasoning: [
        `exploded ${demand.length} driving item(s) through ${bom.length} BOM line(s) into ${itemIds.length} item(s) over ${horizon} period(s)`,
        'each edge contributes grossRequirements[child][t] += quantityPer × grossRequirements[parent][t] — dependent demand lands in the SAME period as its parent; netting and the lead-time offset are applied later, by the netting grid',
        `items were processed in ascending low-level code (deepest ${maxLevel}), where a low-level code is the LONGEST path from an end item — this is what guarantees every parent contributed before its child was read, so a component used at two different depths is not understated`,
        ...itemNarration,
      ],
      citations: [
        'Orlicky, J. (1975), Material Requirements Planning, McGraw-Hill.',
        'Jacobs, F.R. & Chase, R.B. (2018), Operations and Supply Chain Management, 15th ed.',
      ],
      ...(unreachable.length > 0
        ? {
            warnings: [
              `${unreachable.length} item(s) in the bill of materials are unreachable from the driving demand — nothing above them is scheduled, so they have no requirements row: ${unreachable.slice(0, 8).join(', ')}${unreachable.length > 8 ? `, … (${unreachable.length} total)` : ''}`,
            ],
          }
        : {}),
    },
  )
}
