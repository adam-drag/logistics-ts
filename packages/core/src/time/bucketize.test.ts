import { describe, expect, it } from 'vitest'
import type { DemandRecord } from '../model'
import { bucketize } from './bucketize'

const qty = (s: { buckets: { quantity: number }[] }) => s.buckets.map((b) => b.quantity)

describe('bucketize by day', () => {
  it('produces a dense series with zero-filled gaps', () => {
    const records: DemandRecord[] = [
      { itemId: 'A', date: '2026-01-01', quantity: 5 },
      { itemId: 'A', date: '2026-01-03', quantity: 7 },
    ]
    const [series] = bucketize(records, 'day')
    expect(series?.buckets.map((b) => b.period)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03'])
    expect(qty(series!)).toEqual([5, 0, 7])
  })
})

describe('bucketize by month', () => {
  it('sums within a month and zero-fills empty months', () => {
    const records: DemandRecord[] = [
      { itemId: 'A', date: '2026-01-15', quantity: 3 },
      { itemId: 'A', date: '2026-01-20', quantity: 2 },
      { itemId: 'A', date: '2026-03-10', quantity: 4 },
    ]
    const [series] = bucketize(records, 'month')
    expect(series?.buckets.map((b) => b.period)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(qty(series!)).toEqual([5, 0, 4])
  })
})

describe('bucketize by week', () => {
  it('assigns demand to its ISO week (labelled by the Monday) and zero-fills', () => {
    const records: DemandRecord[] = [
      { itemId: 'A', date: '2026-01-07', quantity: 3 }, // week of Mon 2026-01-05
      { itemId: 'A', date: '2026-01-21', quantity: 4 }, // week of Mon 2026-01-19
    ]
    const [series] = bucketize(records, 'week')
    expect(series?.buckets.map((b) => b.period)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
    expect(qty(series!)).toEqual([3, 0, 4])
  })
})

describe('bucketize ranges and items', () => {
  it('honours an explicit common calendar range with leading/trailing zeros', () => {
    const records: DemandRecord[] = [{ itemId: 'A', date: '2026-02-01', quantity: 9 }]
    const [series] = bucketize(records, 'month', { start: '2026-01-01', end: '2026-04-30' })
    expect(series?.buckets.map((b) => b.period)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ])
    expect(qty(series!)).toEqual([0, 9, 0, 0])
  })

  it('throws when the explicit range is reversed (start after end)', () => {
    const records: DemandRecord[] = [{ itemId: 'A', date: '2026-02-01', quantity: 9 }]
    expect(() => bucketize(records, 'month', { start: '2026-04-01', end: '2026-01-01' })).toThrow(
      /must not be after/i,
    )
  })

  it('returns one independent, itemId-sorted series per item', () => {
    const records: DemandRecord[] = [
      { itemId: 'B', date: '2026-01-01', quantity: 1 },
      { itemId: 'A', date: '2026-01-01', quantity: 2 },
    ]
    const result = bucketize(records, 'day')
    expect(result.map((s) => s.itemId)).toEqual(['A', 'B'])
  })

  it('returns an empty array for no records', () => {
    expect(bucketize([], 'day')).toEqual([])
  })
})
