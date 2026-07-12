import { describe, expect, it } from 'vitest'
import { croston } from './croston'
import { sba } from './sba'

describe('croston (hand-computed, α=0.5)', () => {
  // demands at idx1(5), idx4(7): t0=1 → z=5,q=2; Δ=3 → z=6, q=2.5; rate=2.4
  const { value } = croston([0, 5, 0, 0, 7], { alpha: 0.5 })

  it('forecasts the flat size/interval rate', () => {
    expect(value.forecast).toEqual([2.4])
    expect(value.params.size).toBeCloseTo(6, 10)
    expect(value.params.interval).toBeCloseTo(2.5, 10)
  })

  it('exposes a one-step fitted rate that starts at the first demand', () => {
    expect(value.fitted[0]).toBeNaN()
    expect(value.fitted[1]).toBeNaN() // rate undefined until first demand processed
    expect(value.fitted[2]).toBeCloseTo(2.5, 10) // rate after first demand
    expect(value.fitted[4]).toBeCloseTo(2.5, 10)
  })

  it('repeats the flat rate across the horizon', () => {
    expect(croston([0, 5, 0, 0, 7], { alpha: 0.5, horizon: 3 }).value.forecast).toEqual([
      2.4, 2.4, 2.4,
    ])
  })
})

describe('sba = croston × (1 − α/2)', () => {
  it('applies the Syntetos–Boylan bias correction', () => {
    // Croston rate 2.4, α=0.5 → factor 0.75 → 1.8
    const { value } = sba([0, 5, 0, 0, 7], { alpha: 0.5 })
    expect(value.forecast[0]).toBeCloseTo(1.8, 10)
    expect(value.params.correction).toBeCloseTo(0.75, 10)
  })

  it('is strictly below Croston for the same series (positive-bias removal)', () => {
    const series = [0, 3, 0, 0, 0, 9, 0, 4, 0, 0, 6]
    const c = croston(series, { alpha: 0.2 }).value.forecast[0] as number
    const s = sba(series, { alpha: 0.2 }).value.forecast[0] as number
    expect(s).toBeLessThan(c)
    expect(s).toBeCloseTo(0.9 * c, 10) // factor 1 − 0.2/2
  })
})

describe('croston/sba edge cases', () => {
  it('forecasts zero with a warning when there is no demand', () => {
    const r = croston([0, 0, 0], { alpha: 0.3 })
    expect(r.value.forecast).toEqual([0])
    expect(r.warnings?.[0]).toMatch(/no demand/)
  })

  it('warns on a single demand occurrence', () => {
    const r = sba([0, 0, 5, 0], { alpha: 0.3 })
    expect(r.warnings?.some((w) => /one demand/.test(w))).toBe(true)
  })

  it('validates alpha and horizon', () => {
    expect(() => croston([1], { alpha: 0 })).toThrow(/alpha/)
    expect(() => croston([1], { alpha: 1 })).toThrow(/alpha/)
    expect(() => croston([], {})).toThrow(/non-empty/)
    expect(() => sba([1], { horizon: 0 })).toThrow(/positive integer/)
  })
})
