/**
 * XYZ classification — groups items by demand variability, measured as the
 * coefficient of variation (CV) of demand across periods. X-items have stable,
 * predictable demand; Z-items are erratic and hard to forecast.
 *
 * Pair with {@link abc} (see {@link abcXyzMatrix}) to set inventory policy: the
 * value axis says how much control an item deserves, the variability axis says
 * how much buffer it needs.
 */
import {
  coefficientOfVariation,
  type DemandSeries,
  type Explained,
  explain,
} from '@logistics-ts/core'

export interface XyzOptions {
  /**
   * CV cutoffs `[xMax, yMax]` separating X|Y and Y|Z. Defaults to `[0.5, 1.0]`.
   * Cutoffs are convention; tune them to your catalogue.
   */
  cutoffs?: [number, number]
}

export interface XyzClassification {
  itemId: string
  class: 'X' | 'Y' | 'Z'
  /** Coefficient of variation of the item's per-period demand. */
  coefficientOfVariation: number
}

/**
 * Classifies bucketed demand series into X/Y/Z by coefficient of variation.
 * Feed the dense, zero-filled output of {@link bucketize} so the CV reflects the
 * true period-to-period variability.
 *
 * An item with no demand (undefined CV) is classified `Z` with a warning.
 */
export function xyz(
  series: readonly DemandSeries[],
  options: XyzOptions = {},
): Explained<XyzClassification[]> {
  const { cutoffs = [0.5, 1.0] } = options
  const [xMax, yMax] = cutoffs

  const warnings: string[] = []
  const counts = { X: 0, Y: 0, Z: 0 }

  const result: XyzClassification[] = series.map((s) => {
    const quantities = s.buckets.map((b) => b.quantity)
    const cv = coefficientOfVariation(quantities)
    let cls: XyzClassification['class']
    if (Number.isNaN(cv)) {
      // CV is undefined either because there is no demand at all, or because
      // there are fewer than two periods to measure variability across. These
      // are different situations; classify Z conservatively but say which.
      cls = 'Z'
      const hasDemand = quantities.some((q) => q > 0)
      warnings.push(
        hasDemand
          ? `item "${s.itemId}" has fewer than two periods; CV is undefined, classified Z`
          : `item "${s.itemId}" has no demand; classified Z`,
      )
    } else {
      cls = cv < xMax ? 'X' : cv < yMax ? 'Y' : 'Z'
    }
    counts[cls]++
    return { itemId: s.itemId, class: cls, coefficientOfVariation: cv }
  })

  return explain(result, {
    method: 'xyz-coefficient-of-variation',
    inputs: { items: series.length, xMax, yMax },
    reasoning: [
      `X < ${xMax} CV (stable), Y < ${yMax} (variable), Z ≥ ${yMax} (erratic)`,
      `${counts.X} X-items, ${counts.Y} Y-items, ${counts.Z} Z-items`,
    ],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}
