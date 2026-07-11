import { describe, expect, it } from 'vitest'
import { type AbcItem, abc } from './abc'

const ITEMS: AbcItem[] = [
  { itemId: 'A', volume: 100, unitValue: 50 }, // value 5000
  { itemId: 'B', volume: 500, unitValue: 1 }, //  value 500
  { itemId: 'C', volume: 10, unitValue: 100 }, // value 1000
  { itemId: 'D', volume: 1, unitValue: 1 }, //    value 1
]

const classOf = (result: { itemId: string; class: string }[], id: string) =>
  result.find((r) => r.itemId === id)?.class

describe('abc by value', () => {
  it('splits items by cumulative share of consumption value', () => {
    const { value } = abc(ITEMS)
    // Ranked by value: A(5000), C(1000), B(500), D(1); total 6501.
    expect(classOf(value, 'A')).toBe('A')
    expect(classOf(value, 'C')).toBe('A') // cumulative 0.769 before it
    expect(classOf(value, 'B')).toBe('B') // cumulative 0.923 before it
    expect(classOf(value, 'D')).toBe('C') // cumulative ~1.0 before it
  })

  it('returns shares that sum to 1 and a final cumulative share of 1', () => {
    const { value } = abc(ITEMS)
    const shareSum = value.reduce((s, r) => s + r.share, 0)
    expect(shareSum).toBeCloseTo(1, 10)
    expect(value.at(-1)?.cumulativeShare).toBeCloseTo(1, 10)
  })

  it('orders results from most to least important', () => {
    const { value } = abc(ITEMS)
    expect(value.map((r) => r.itemId)).toEqual(['A', 'C', 'B', 'D'])
  })
})

describe('abc by volume', () => {
  it('ranks by raw volume instead of value', () => {
    const { value } = abc(ITEMS, { by: 'volume' })
    // Ranked by volume: B(500), A(100), C(10), D(1); total 611.
    expect(value.map((r) => r.itemId)).toEqual(['B', 'A', 'C', 'D'])
    expect(classOf(value, 'B')).toBe('A')
  })

  it('does not require unitValue', () => {
    expect(() => abc([{ itemId: 'X', volume: 5 }], { by: 'volume' })).not.toThrow()
  })
})

describe('abc validation and options', () => {
  it('throws when classifying by value without unitValue', () => {
    expect(() => abc([{ itemId: 'X', volume: 5 }])).toThrow(/unitValue/)
  })

  it('honours custom cutoffs', () => {
    const { value } = abc(ITEMS, { cutoffs: [0.5, 0.9] })
    // A alone is 0.769 of value; with aMax 0.5 only A stays class A.
    expect(classOf(value, 'A')).toBe('A')
    expect(classOf(value, 'C')).toBe('B')
  })
})
