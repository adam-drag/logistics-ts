import { describe, expect, it } from 'vitest'
import { seasonalDecompose } from './seasonal-decompose'

describe('seasonalDecompose additive (constructed, exact recovery)', () => {
  // trend 10,11,12,... (linear) + seasonal [-2,0,+2] repeating, no noise
  const m = 3
  const series = Array.from({ length: 9 }, (_, t) => {
    const trend = 10 + t
    const seasonal = [-2, 0, 2][t % m] as number
    return trend + seasonal
  })

  it('recovers the seasonal indices (sum to zero)', () => {
    const { value } = seasonalDecompose(series, { seasonLength: m })
    expect(value.seasonalIndices[0]).toBeCloseTo(-2, 6)
    expect(value.seasonalIndices[1]).toBeCloseTo(0, 6)
    expect(value.seasonalIndices[2]).toBeCloseTo(2, 6)
    expect(value.seasonalIndices.reduce((s, v) => s + v, 0)).toBeCloseTo(0, 10)
  })

  it('recovers the linear trend in the interior and leaves ~zero remainder', () => {
    const { value } = seasonalDecompose(series, { seasonLength: m })
    // interior trend point t=4 should equal 10+4 = 14
    expect(value.trend[4]).toBeCloseTo(14, 6)
    expect(value.trend[0]).toBeNaN() // ends undefined
    for (let t = 1; t < 8; t++) expect(value.remainder[t]).toBeCloseTo(0, 6)
  })
})

describe('seasonalDecompose multiplicative', () => {
  it('recovers seasonal factors that average to 1', () => {
    const m = 4
    // level 100 growing by 5, seasonal factors [0.8,1.0,1.2,1.0]
    const factors = [0.8, 1.0, 1.2, 1.0]
    const series = Array.from({ length: 12 }, (_, t) => (100 + 5 * t) * (factors[t % m] as number))
    const { value } = seasonalDecompose(series, { seasonLength: m, mode: 'multiplicative' })
    const avg = value.seasonalIndices.reduce((s, v) => s + v, 0) / m
    expect(avg).toBeCloseTo(1, 6)
    expect(value.seasonalIndices[2]! / value.seasonalIndices[0]!).toBeCloseTo(1.2 / 0.8, 4)
  })

  it('rejects non-positive values', () => {
    expect(() =>
      seasonalDecompose([0, 1, 2, 3, 0, 1, 2, 3], { seasonLength: 4, mode: 'multiplicative' }),
    ).toThrow(/strictly positive/)
  })
})

describe('seasonalDecompose validation', () => {
  it('requires two seasons and m ≥ 2', () => {
    expect(() => seasonalDecompose([1, 2, 3], { seasonLength: 3 })).toThrow(/two full seasons/)
    expect(() => seasonalDecompose([1, 2, 3, 4], { seasonLength: 1 })).toThrow(/≥ 2/)
  })
})
