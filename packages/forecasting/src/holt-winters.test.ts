import { describe, expect, it } from 'vitest'
import { holtWinters } from './holt-winters'

describe('holtWinters additive — exact on a purely periodic series', () => {
  // A no-trend, no-noise period-3 series is reproduced and continued exactly by
  // the recursion for any α,β,γ (init makes the states a fixed point).
  const series = [10, 20, 30, 10, 20, 30, 10, 20, 30]

  it('reproduces the seasonal pattern after warm-up', () => {
    const { value } = holtWinters(series, { seasonLength: 3, alpha: 0.3, beta: 0.1, gamma: 0.2 })
    // fitted for the second+ seasons matches the series
    expect(value.fitted[3]).toBeCloseTo(10, 6)
    expect(value.fitted[4]).toBeCloseTo(20, 6)
    expect(value.fitted[5]).toBeCloseTo(30, 6)
  })

  it('forecasts the continuation, wrapping the season for horizon > m', () => {
    const { value } = holtWinters(series, {
      seasonLength: 3,
      alpha: 0.3,
      beta: 0.1,
      gamma: 0.2,
      horizon: 6,
    })
    for (let i = 0; i < 6; i++)
      expect(value.forecast[i]).toBeCloseTo([10, 20, 30, 10, 20, 30][i]!, 6)
  })
})

describe('holtWinters multiplicative — exact on a periodic series', () => {
  const series = [10, 20, 30, 10, 20, 30, 10, 20, 30]

  it('reproduces and continues the pattern via seasonal factors', () => {
    const result = holtWinters(series, {
      seasonLength: 3,
      mode: 'multiplicative',
      alpha: 0.4,
      beta: 0.1,
      gamma: 0.3,
      horizon: 3,
    })
    expect(result.value.forecast[0]).toBeCloseTo(10, 6)
    expect(result.value.forecast[1]).toBeCloseTo(20, 6)
    expect(result.value.forecast[2]).toBeCloseTo(30, 6)
    expect(result.method).toBe('holt-winters-multiplicative')
  })

  it('rejects non-positive values', () => {
    expect(() =>
      holtWinters([0, 1, 2, 0, 1, 2], { seasonLength: 3, mode: 'multiplicative' }),
    ).toThrow(/strictly positive/)
  })
})

describe('holtWinters trend + seasonality', () => {
  it('forecasts an upward-trending seasonal series above the last cycle', () => {
    // level rises by ~3/period, plus additive season [-5,0,+5]
    const series = [5, 10, 15, 8, 13, 18, 11, 16, 21, 14, 19, 24]
    const result = holtWinters(series, { seasonLength: 3, horizon: 3 })
    // next season should exceed the most recent one elementwise (trend up)
    expect(result.value.forecast[0]).toBeGreaterThan(14)
    expect(result.value.forecast[2]).toBeGreaterThan(24)
    expect(result.reasoning[0]).toMatch(/fitted/)
  })
})

describe('holtWinters validation', () => {
  it('requires two full seasons and a valid seasonLength/horizon', () => {
    expect(() => holtWinters([1, 2, 3], { seasonLength: 3 })).toThrow(/two full seasons/)
    expect(() => holtWinters([1, 2, 3, 4], { seasonLength: 1 })).toThrow(/≥ 2/)
    expect(() => holtWinters([1, 2, 3, 4], { seasonLength: 2, horizon: 0 })).toThrow(
      /positive integer/,
    )
    expect(() => holtWinters([1, 2, 3, 4], { seasonLength: 2, alpha: 1 })).toThrow(/alpha/)
  })
})
