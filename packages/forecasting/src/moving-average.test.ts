import { describe, expect, it } from 'vitest'
import { movingAverage } from './moving-average'

describe('movingAverage', () => {
  it('forecasts the mean of the last `window` observations (hand-computed)', () => {
    // last 2 of [10,12,14,16] → (14+16)/2 = 15
    const { value } = movingAverage([10, 12, 14, 16], { window: 2 })
    expect(value.forecast).toEqual([15])
    expect(value.params.window).toBe(2)
  })

  it('repeats the flat mean across a multi-step horizon', () => {
    const { value } = movingAverage([2, 4, 6], { window: 3, horizon: 4 })
    expect(value.forecast).toEqual([4, 4, 4, 4]) // mean of all three
  })

  it('produces fitted values only once the window is warm', () => {
    const { value } = movingAverage([10, 20, 30, 40], { window: 2 })
    // fitted[t] = mean of the 2 obs ending at t-1
    expect(value.fitted[0]).toBeNaN()
    expect(value.fitted[1]).toBeNaN()
    expect(value.fitted[2]).toBeCloseTo(15, 10) // (10+20)/2
    expect(value.fitted[3]).toBeCloseTo(25, 10) // (20+30)/2
  })

  it('with window 1 reduces to the naive (last-value) forecast', () => {
    expect(movingAverage([5, 9, 7], { window: 1 }).value.forecast).toEqual([7])
  })

  it('validates window and horizon', () => {
    expect(() => movingAverage([1, 2], { window: 3 })).toThrow(/exceeds series length/)
    expect(() => movingAverage([1, 2], { window: 0 })).toThrow(/positive integer/)
    expect(() => movingAverage([1, 2], { window: 1, horizon: 0 })).toThrow(/positive integer/)
  })

  it('records method and citation in the explanation', () => {
    const r = movingAverage([1, 2, 3], { window: 2 })
    expect(r.method).toBe('moving-average')
    expect(r.citations?.[0]).toMatch(/fpp3/)
  })
})
