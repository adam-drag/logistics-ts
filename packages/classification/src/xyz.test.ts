import type { DemandSeries } from '@logistics-ts/core'
import { describe, expect, it } from 'vitest'
import { xyz } from './xyz'

const series = (itemId: string, quantities: number[]): DemandSeries => ({
  itemId,
  granularity: 'month',
  buckets: quantities.map((quantity, i) => ({
    period: `2026-${String(i + 1).padStart(2, '0')}`,
    quantity,
  })),
})

const classOf = (result: { itemId: string; class: string }[], id: string) =>
  result.find((r) => r.itemId === id)?.class

describe('xyz', () => {
  it('classifies by coefficient of variation of per-period demand', () => {
    const { value } = xyz([
      series('stable', [10, 10, 10, 10]), // CV 0     → X
      series('variable', [10, 20, 0, 10]), // CV ~0.82 → Y
      series('erratic', [0, 0, 30, 0]), //    CV 2      → Z
    ])
    expect(classOf(value, 'stable')).toBe('X')
    expect(classOf(value, 'variable')).toBe('Y')
    expect(classOf(value, 'erratic')).toBe('Z')
  })

  it('classifies an item with no demand as Z and warns', () => {
    const { value, warnings } = xyz([series('dead', [0, 0, 0])])
    expect(classOf(value, 'dead')).toBe('Z')
    expect(warnings?.[0]).toMatch(/no demand/i)
  })

  it('distinguishes a single-period item (undefined CV) from a no-demand item', () => {
    const { value, warnings } = xyz([series('new', [10])])
    expect(classOf(value, 'new')).toBe('Z')
    // The item HAS demand, so the warning must not claim otherwise.
    expect(warnings?.[0]).toMatch(/fewer than two periods/i)
    expect(warnings?.[0]).not.toMatch(/no demand/i)
  })

  it('returns an empty result for empty input without throwing', () => {
    expect(xyz([]).value).toEqual([])
  })

  it('honours custom cutoffs', () => {
    const { value } = xyz([series('variable', [10, 20, 0, 10])], { cutoffs: [0.9, 1.5] })
    // CV ~0.82 is now below xMax 0.9 → X.
    expect(classOf(value, 'variable')).toBe('X')
  })
})
