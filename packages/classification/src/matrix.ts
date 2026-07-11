/**
 * ABC-XYZ matrix — joins the value axis (ABC) with the variability axis (XYZ)
 * into nine cells, each with a concrete inventory-policy hint. This is the
 * payoff of running both classifications: it turns two labels into an action.
 */
import { type Explained, explain } from '@logistics-ts/core'
import type { AbcClassification } from './abc'
import type { XyzClassification } from './xyz'

/** A `${ABC}${XYZ}` cell label, e.g. `'AX'`. */
export type AbcXyzClass = 'AX' | 'AY' | 'AZ' | 'BX' | 'BY' | 'BZ' | 'CX' | 'CY' | 'CZ'

export interface AbcXyzCell {
  itemId: string
  abc: AbcClassification['class']
  xyz: XyzClassification['class']
  class: AbcXyzClass
  /** Recommended inventory policy for this cell. */
  policyHint: string
}

const POLICY: Record<AbcXyzClass, string> = {
  AX: 'high value, stable — tight control, low safety stock, automate reordering (JIT)',
  AY: 'high value, variable — tight control, moderate safety stock, forecast carefully',
  AZ: 'high value, erratic — manual review, buffer or make-to-order, avoid over-committing',
  BX: 'moderate value, stable — automate with standard safety stock',
  BY: 'moderate value, variable — standard control, moderate safety stock',
  BZ: 'moderate value, erratic — cautious stocking, periodic review',
  CX: 'low value, stable — simple rules, generous safety stock is cheap, bulk order',
  CY: 'low value, variable — simple rules, generous safety stock',
  CZ: 'low value, erratic — minimal stock or make-to-order; do not over-invest',
}

/**
 * Combines {@link abc} and {@link xyz} results into the nine-cell matrix. Items
 * present in only one of the two inputs are skipped and reported as a warning.
 *
 * @example
 * ```ts
 * const cells = abcXyzMatrix(abc(items).value, xyz(series).value).value
 * ```
 */
export function abcXyzMatrix(
  abcResult: readonly AbcClassification[],
  xyzResult: readonly XyzClassification[],
): Explained<AbcXyzCell[]> {
  const xyzById = new Map(xyzResult.map((x) => [x.itemId, x.class]))
  const warnings: string[] = []
  const cells: AbcXyzCell[] = []

  for (const a of abcResult) {
    const x = xyzById.get(a.itemId)
    if (x === undefined) {
      warnings.push(`item "${a.itemId}" has an ABC class but no XYZ class; skipped`)
      continue
    }
    const cls = `${a.class}${x}` as AbcXyzClass
    cells.push({ itemId: a.itemId, abc: a.class, xyz: x, class: cls, policyHint: POLICY[cls] })
  }

  const abcIds = new Set(abcResult.map((a) => a.itemId))
  for (const x of xyzResult) {
    if (!abcIds.has(x.itemId)) {
      warnings.push(`item "${x.itemId}" has an XYZ class but no ABC class; skipped`)
    }
  }

  return explain(cells, {
    method: 'abc-xyz-matrix',
    inputs: { abcItems: abcResult.length, xyzItems: xyzResult.length, matched: cells.length },
    reasoning: [
      'joined the value axis (ABC) with the variability axis (XYZ) by itemId',
      'each cell carries a recommended inventory policy',
    ],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}
