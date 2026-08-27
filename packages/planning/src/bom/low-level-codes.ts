/**
 * Low-level codes: the shared structural pass behind both {@link explode} and
 * `planRequirements`. Internal — not re-exported from the package index.
 *
 * The two callers accumulate different things (gross requirements vs. netted
 * planned order releases) but agree completely on the ORDER that accumulation
 * must happen in, so the levelling and cycle detection live here once.
 *
 * @see Orlicky, J. (1975). Material Requirements Planning, McGraw-Hill —
 *   low-level codes and the explosion process.
 */
import type { BomRecord } from '@logistics-ts/core'

/**
 * Assigns every item its **low-level code**: the length of the LONGEST path
 * from any end item down to it. Items with no parent in the BOM are `0`.
 *
 * Longest path, not shortest, is the whole point. When a component is consumed
 * at two different depths — say a fastener used directly by the finished
 * assembly *and* by a sub-assembly two levels down — the shortest path would
 * schedule it at the shallower level, before the deeper parent has contributed
 * its share, and the fastener's requirement would come out short. Taking the
 * longest path guarantees every parent is processed first.
 *
 * Runs Kahn's algorithm over the parent→child edges. A node still holding
 * unresolved parents when the queue empties is part of a cycle, which is how
 * cycle detection falls out of the same pass for free.
 *
 * @throws RangeError naming a concrete offending edge when the BOM is cyclic.
 */
export function assignLowLevelCodes(
  bom: BomRecord,
  seeds: readonly string[],
): Record<string, number> {
  const children = new Map<string, { childId: string; quantityPer: number }[]>()
  const parentCount = new Map<string, number>()
  const items = new Set<string>(seeds)

  for (const line of bom) {
    items.add(line.parentId)
    items.add(line.childId)
    const list = children.get(line.parentId)
    if (list) list.push(line)
    else children.set(line.parentId, [line])
    parentCount.set(line.childId, (parentCount.get(line.childId) ?? 0) + 1)
  }

  const code: Record<string, number> = {}
  const remaining = new Map<string, number>()
  const queue: string[] = []
  for (const item of items) {
    const parents = parentCount.get(item) ?? 0
    remaining.set(item, parents)
    if (parents === 0) {
      code[item] = 0
      queue.push(item)
    }
  }

  let processed = queue.length
  while (queue.length > 0) {
    // Shift is fine: a BOM is small relative to the cost of the work per node,
    // and processing order within a level does not affect the result.
    const parent = queue.shift() as string
    const parentCode = code[parent] ?? 0
    for (const edge of children.get(parent) ?? []) {
      // LONGEST path: keep the deepest level any parent forces this child to.
      code[edge.childId] = Math.max(code[edge.childId] ?? 0, parentCode + 1)
      const left = (remaining.get(edge.childId) ?? 0) - 1
      remaining.set(edge.childId, left)
      if (left === 0) {
        queue.push(edge.childId)
        processed++
      }
    }
  }

  if (processed < items.size) {
    // Everything still holding a parent is inside (or downstream of) a cycle.
    // Name a concrete edge between two of them — a bare "cycle detected" leaves
    // the caller to find it by hand in a BOM that may have thousands of rows.
    const stuck = new Set<string>()
    for (const [item, left] of remaining) if ((left ?? 0) > 0) stuck.add(item)
    const offending = bom.find((l) => stuck.has(l.parentId) && stuck.has(l.childId))
    const edge = offending
      ? `${offending.parentId} -> ${offending.childId}`
      : [...stuck].slice(0, 4).join(', ')
    throw new RangeError(
      `bill of materials is cyclic — an item cannot be a component of itself, directly or transitively. Offending edge: ${edge}. Items that could not be levelled: ${[...stuck].slice(0, 8).join(', ')}${stuck.size > 8 ? `, … (${stuck.size} total)` : ''}`,
    )
  }
  return code
}
