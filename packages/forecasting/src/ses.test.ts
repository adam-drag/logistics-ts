import { describe, expect, it } from 'vitest'
import { ses } from './ses'

describe('ses with fixed alpha (hand-computed)', () => {
  // l0=10; l1=.5*12+.5*10=11; l2=.5*14+.5*11=12.5
  const { value } = ses([10, 12, 14], { alpha: 0.5 })

  it('smooths to the final level and forecasts it flat', () => {
    expect(value.forecast).toEqual([12.5])
    expect(value.params.alpha).toBeCloseTo(0.5, 10)
  })

  it('fits one-step values as the prior level', () => {
    expect(value.fitted[0]).toBeNaN() // no forecast for the first point
    expect(value.fitted[1]).toBeCloseTo(10, 10) // l0
    expect(value.fitted[2]).toBeCloseTo(11, 10) // l1
  })

  it('repeats the level across the horizon', () => {
    expect(ses([10, 12, 14], { alpha: 0.5, horizon: 3 }).value.forecast).toEqual([12.5, 12.5, 12.5])
  })
})

describe('ses fitted alpha', () => {
  it('minimises in-sample SSE better than the interval endpoints', () => {
    const series = [3, 5, 2, 8, 4, 9, 6, 10, 7, 12]
    const sse = (a: number): number => {
      let level = series[0] as number
      let s = 0
      for (let t = 1; t < series.length; t++) {
        s += (series[t]! - level) ** 2
        level = a * series[t]! + (1 - a) * level
      }
      return s
    }
    const fittedAlpha = ses(series).value.params.alpha as number
    expect(fittedAlpha).toBeGreaterThan(0)
    expect(fittedAlpha).toBeLessThan(1)
    expect(sse(fittedAlpha)).toBeLessThanOrEqual(Math.min(sse(0.02), sse(0.98)))
  })

  it('drives a trending series toward a high alpha (tracks recent level)', () => {
    // A steadily rising series is fit best by weighting the most recent point.
    const alpha = ses([1, 2, 3, 4, 5, 6, 7, 8]).value.params.alpha as number
    expect(alpha).toBeGreaterThan(0.5)
  })
})

describe('ses edge cases and contract', () => {
  it('a single observation forecasts itself', () => {
    const { value } = ses([42], { alpha: 0.3 })
    expect(value.forecast).toEqual([42])
    expect(value.fitted).toEqual([Number.NaN])
  })

  it('rejects empty series, out-of-range alpha, and bad horizon', () => {
    expect(() => ses([])).toThrow(/non-empty/)
    expect(() => ses([1, 2], { alpha: 0 })).toThrow(/\(0, 1\)/)
    expect(() => ses([1, 2], { alpha: 1 })).toThrow(/\(0, 1\)/)
    expect(() => ses([1, 2], { horizon: -1 })).toThrow(/positive integer/)
  })

  it('reports whether alpha was fitted or supplied', () => {
    expect(ses([1, 2, 3], { alpha: 0.4 }).reasoning[0]).toMatch(/supplied/)
    expect(ses([1, 2, 3]).reasoning[0]).toMatch(/fitted/)
  })
})
