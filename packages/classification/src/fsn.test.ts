import type { DemandSeries } from '@logistics-ts/core'
import { describe, expect, it } from 'vitest'
import { fsn } from './fsn'

const series = (itemId: string, quantities: number[]): DemandSeries => ({
  itemId,
  granularity: 'month',
  buckets: quantities.map((quantity, i) => ({
    period: `2026-${String(i + 1).padStart(2, '0')}`,
    quantity,
  })),
})

const byId = (result: { itemId: string; class: string; movementRatio: number }[], id: string) =>
  result.find((r) => r.itemId === id)

describe('fsn', () => {
  it('classifies by movement frequency', () => {
    const { value } = fsn([
      series('fast', [1, 1, 1, 0]), //  ratio 0.75 → F
      series('slow', [1, 0, 0, 0]), //  ratio 0.25 → S
      series('dead', [0, 0, 0, 0]), //  ratio 0    → N
    ])
    expect(byId(value, 'fast')?.class).toBe('F')
    expect(byId(value, 'slow')?.class).toBe('S')
    expect(byId(value, 'dead')?.class).toBe('N')
    expect(byId(value, 'fast')?.movementRatio).toBeCloseTo(0.75, 10)
  })

  it('honours a custom fast cutoff', () => {
    const { value } = fsn([series('mid', [1, 1, 0, 0])], { fastCutoff: 0.6 })
    // ratio 0.5 < 0.6 → S
    expect(byId(value, 'mid')?.class).toBe('S')
  })
})
