/**
 * Input guards shared by {@link explode} and `planRequirements`. Internal — not
 * re-exported from the package index.
 *
 * Both entry points take the same two things: a BOM edge list, and a set of
 * period-indexed demand series keyed by item. They therefore have to reject the
 * same inputs, with the same message naming the same field. Keeping the guards
 * here rather than copying them is the point — the first version of
 * `planRequirements` carried a hand-trimmed copy of `explode`'s block and so
 * accepted a `NaN` `quantityPer` and read holes in the master schedule as zero
 * demand, producing a plausible-looking but wrong plan instead of an error.
 */
import type { BomRecord } from '@logistics-ts/core'
import { requireNonNegative } from '../lot-sizing/validate'
import type { ItemRequirements } from './types'

/**
 * Throws unless `bom` is an array of well-formed, non-self-referential BOM lines
 * with finite non-negative `quantityPer`.
 *
 * @param bom - The candidate edge list, from a possibly untyped JS caller.
 * @throws TypeError if the shape is wrong; RangeError if a line makes an item a
 *   component of itself.
 */
export function requireValidBom(bom: BomRecord): void {
  if (!Array.isArray(bom)) {
    throw new TypeError(`bom must be an array of BOM lines (got ${typeof bom})`)
  }
  for (const [index, line] of bom.entries()) {
    if (line === null || typeof line !== 'object') {
      throw new TypeError(`bom[${index}] must be a BOM line object (got ${typeof line})`)
    }
    if (typeof line.parentId !== 'string' || typeof line.childId !== 'string') {
      throw new TypeError(`bom[${index}] must have string parentId and childId`)
    }
    if (line.parentId === line.childId) {
      // The degenerate cycle. Caught here so the message names the item rather
      // than surfacing as a general "could not be levelled" further down.
      throw new RangeError(
        `bom[${index}] makes '${line.parentId}' a component of itself (parentId === childId)`,
      )
    }
    requireNonNegative(`bom[${index}].quantityPer`, line.quantityPer)
  }
}

/**
 * Throws unless `entries` is an array of well-formed {@link ItemRequirements}
 * whose every requirement is finite and non-negative, and returns the planning
 * horizon: the length of the longest series.
 *
 * Every entry inside a provided series is checked, so a hole (`[10, , 30]`) or a
 * non-number is rejected naming its item and period rather than being read as
 * zero demand. A series shorter than the horizon is *not* an error — shorter
 * series are zero-padded by the caller, which is a stated part of the contract.
 *
 * @param label - The caller's own parameter name (`'demand'`,
 *   `'masterSchedule'`), so the thrown message names the field the caller passed.
 * @param entries - The candidate demand series.
 * @returns The horizon in periods (`0` for no entries).
 * @throws TypeError on a malformed entry; Error on a bad requirement value.
 */
export function requireValidRequirements(
  label: string,
  entries: readonly ItemRequirements[],
): number {
  if (!Array.isArray(entries)) {
    throw new TypeError(`${label} must be an array of item requirements (got ${typeof entries})`)
  }
  let horizon = 0
  for (const [index, entry] of entries.entries()) {
    if (entry === null || typeof entry !== 'object') {
      throw new TypeError(`${label}[${index}] must be an object (got ${typeof entry})`)
    }
    if (typeof entry.itemId !== 'string') {
      throw new TypeError(`${label}[${index}].itemId must be a string`)
    }
    if (!Array.isArray(entry.requirements)) {
      throw new TypeError(
        `${label}[${index}].requirements must be an array (got ${typeof entry.requirements})`,
      )
    }
    for (let period = 0; period < entry.requirements.length; period++) {
      requireNonNegative(
        `${label}['${entry.itemId}'].requirements[${period}]`,
        entry.requirements[period],
      )
    }
    horizon = Math.max(horizon, entry.requirements.length)
  }
  return horizon
}
