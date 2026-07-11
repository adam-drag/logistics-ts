import { describe, expect, it } from 'vitest'
import type { AbcClassification } from './abc'
import { abcXyzMatrix } from './matrix'
import type { XyzClassification } from './xyz'

const abcResult: AbcClassification[] = [
  { itemId: 'hero', class: 'A', metric: 5000, share: 0.8, cumulativeShare: 0.8 },
  { itemId: 'filler', class: 'C', metric: 10, share: 0.01, cumulativeShare: 1 },
  { itemId: 'orphan', class: 'B', metric: 500, share: 0.19, cumulativeShare: 0.99 },
]

const xyzResult: XyzClassification[] = [
  { itemId: 'hero', class: 'X', coefficientOfVariation: 0.1 },
  { itemId: 'filler', class: 'Z', coefficientOfVariation: 2 },
  // 'orphan' has no XYZ class; an extra item has no ABC class.
  { itemId: 'ghost', class: 'Y', coefficientOfVariation: 0.7 },
]

describe('abcXyzMatrix', () => {
  it('joins the two axes and assigns a policy hint per cell', () => {
    const { value } = abcXyzMatrix(abcResult, xyzResult)
    const hero = value.find((c) => c.itemId === 'hero')
    expect(hero?.class).toBe('AX')
    expect(hero?.policyHint).toMatch(/high value, stable/i)

    const filler = value.find((c) => c.itemId === 'filler')
    expect(filler?.class).toBe('CZ')
    expect(filler?.policyHint).toMatch(/make-to-order|minimal stock/i)
  })

  it('skips and warns about items missing one of the two classifications', () => {
    const { value, warnings } = abcXyzMatrix(abcResult, xyzResult)
    expect(value.map((c) => c.itemId).sort()).toEqual(['filler', 'hero'])
    expect(warnings?.some((w) => w.includes('orphan'))).toBe(true)
    expect(warnings?.some((w) => w.includes('ghost'))).toBe(true)
  })

  it('returns an empty result for empty inputs without throwing', () => {
    expect(abcXyzMatrix([], []).value).toEqual([])
  })
})
