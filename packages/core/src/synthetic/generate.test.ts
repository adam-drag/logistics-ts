import { describe, expect, it } from 'vitest'
import { loadDemand } from '../table/loader'
import { bucketize } from '../time/bucketize'
import { generateExampleData } from './generate'

describe('generateExampleData', () => {
  it('is deterministic for a given seed', () => {
    const a = generateExampleData({ seed: 42 })
    const b = generateExampleData({ seed: 42 })
    expect(a).toEqual(b)
  })

  it('varies with the seed', () => {
    const a = generateExampleData({ seed: 1 })
    const b = generateExampleData({ seed: 2 })
    expect(a).not.toEqual(b)
  })

  it('produces the requested number of items with stock and lead times', () => {
    const { demand, stock, leadTimes } = generateExampleData({ items: 8, periods: 12 })
    const ids = new Set(demand.map((d) => d.itemId))
    expect(ids.size).toBe(8)
    expect(stock).toHaveLength(8)
    expect(leadTimes).toHaveLength(8 * 5)
    expect(demand.every((d) => d.quantity > 0 && Number.isInteger(d.quantity))).toBe(true)
    expect(demand.every((d) => typeof d.unitPrice === 'number')).toBe(true)
  })

  it('emits demand every period for a smooth profile', () => {
    const { demand } = generateExampleData({ items: 1, periods: 24, profile: 'smooth' })
    expect(demand).toHaveLength(24)
  })

  it('leaves gaps for an intermittent profile', () => {
    const { demand } = generateExampleData({ items: 1, periods: 24, profile: 'intermittent' })
    expect(demand.length).toBeLessThan(24)
    expect(demand.length).toBeGreaterThan(0)
  })

  it('generates data that loads and bucketizes cleanly', () => {
    const { demand } = generateExampleData({ items: 3, periods: 12, profile: 'smooth' })
    const { records, issues } = loadDemand(demand)
    expect(issues).toEqual([])
    const series = bucketize(records, 'month')
    expect(series).toHaveLength(3)
    // A dense profile yields one bucket per period after zero-fill.
    expect(series.every((s) => s.buckets.length === 12)).toBe(true)
  })
})
