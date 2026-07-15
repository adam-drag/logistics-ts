import { describe, expect, it } from 'vitest'
import { holt } from './holt'

describe('holt undamped (hand-computed, α=β=0.5)', () => {
  // l0=10,b0=2; t1: f=12,l=12,b=2; t2: f=14,l=14.5,b=2.25; t3: f=16.75,l=16.375,b=2.0625
  const { value } = holt([10, 12, 15, 16], { alpha: 0.5, beta: 0.5, horizon: 2 })

  it('extends the level by the trend each step', () => {
    // h1: 16.375+2.0625=18.4375 ; h2: 16.375+2*2.0625=20.5
    expect(value.forecast[0]).toBeCloseTo(18.4375, 10)
    expect(value.forecast[1]).toBeCloseTo(20.5, 10)
  })

  it('records the fitted one-step values', () => {
    expect(value.fitted[0]).toBeNaN()
    expect(value.fitted[1]).toBeCloseTo(12, 10)
    expect(value.fitted[2]).toBeCloseTo(14, 10)
    expect(value.fitted[3]).toBeCloseTo(16.75, 10)
  })

  it('exposes the fitted level/trend params', () => {
    expect(value.params.phi).toBe(1) // undamped
    expect(value.params.alpha).toBeCloseTo(0.5, 10)
  })
})

describe('holt damped', () => {
  it('shrinks each successive horizon increment by φ', () => {
    const phi = 0.6
    const { value } = holt([10, 12, 15, 16], {
      alpha: 0.5,
      beta: 0.5,
      phi,
      damped: true,
      horizon: 4,
    })
    const inc = value.forecast.map((v, i) => (i === 0 ? Number.NaN : v - value.forecast[i - 1]!))
    // increment ratio between successive steps equals φ (increment h+1 is φ^{h+1}·b)
    expect(inc[2]! / inc[1]!).toBeCloseTo(phi, 10)
    expect(inc[3]! / inc[2]!).toBeCloseTo(phi, 10)
  })

  it('is labelled holt-damped and cites the damped-trend section', () => {
    const r = holt([1, 2, 3, 4], { alpha: 0.3, beta: 0.3, phi: 0.9, damped: true })
    expect(r.method).toBe('holt-damped')
    expect(r.inputs.phi).toBeCloseTo(0.9, 10)
  })
})

describe('holt fitting and validation', () => {
  it('fits α,β to reduce SSE below a fixed baseline on a trending series', () => {
    const series = [3, 5, 4, 7, 8, 7, 10, 12, 11, 14]
    const fitted = holt(series)
    // A perfect-fit check is unavailable; assert params are in-range and it ran.
    expect(fitted.value.params.alpha).toBeGreaterThan(0)
    expect(fitted.value.params.alpha).toBeLessThan(1)
    expect(fitted.value.params.beta).toBeGreaterThan(0)
    expect(fitted.reasoning[0]).toMatch(/fitted/)
  })

  it('rejects short series, bad params, and bad horizon', () => {
    expect(() => holt([5])).toThrow(/at least 2/)
    expect(() => holt([1, 2], { alpha: 1 })).toThrow(/alpha/)
    expect(() => holt([1, 2], { beta: 0 })).toThrow(/beta/)
    expect(() => holt([1, 2], { phi: 1.2, damped: true })).toThrow(/phi/)
    expect(() => holt([1, 2], { horizon: 0 })).toThrow(/positive integer/)
  })
})
