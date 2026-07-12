import { describe, expect, it } from 'vitest'
import { autoForecast } from './auto'

describe('autoForecast routing', () => {
  it('routes an intermittent series to the intermittent family', () => {
    const series = [0, 0, 4, 0, 0, 6, 0, 3, 0, 0, 5, 0, 0, 4, 0, 6]
    const r = autoForecast(series, { horizon: 2 })
    expect(['auto-sba', 'auto-croston', 'auto-tsb']).toContain(r.method)
    expect(r.inputs.pattern).toMatch(/intermittent|lumpy/)
    expect(r.value.forecast).toHaveLength(2)
    // reasoning explains the quadrant and the candidate scores
    expect(r.reasoning[0]).toMatch(/SBC pattern/)
    expect(r.reasoning[1]).toMatch(/MASE/)
  })

  it('routes a smooth frequent series to the exponential-smoothing family', () => {
    const series = [10, 11, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15]
    const r = autoForecast(series)
    expect(['auto-ses', 'auto-holt', 'auto-holt-damped']).toContain(r.method)
    expect(r.inputs.candidates).toMatch(/ses/)
  })

  it('adds Holt-Winters to the candidate set when seasonLength fits', () => {
    // strong seasonal, frequent demand, enough history for 2 seasons
    const factors = [-4, 0, 4]
    const series = Array.from({ length: 18 }, (_, t) => 20 + 0.5 * t + (factors[t % 3] as number))
    const r = autoForecast(series, { seasonLength: 3, horizon: 3 })
    expect(r.inputs.candidates).toMatch(/holt-winters/)
    expect(r.value.forecast).toHaveLength(3)
  })
})

describe('autoForecast selection and explanation', () => {
  it('picks the lowest-MASE candidate and records winningMase', () => {
    const series = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] // clean upward trend
    const r = autoForecast(series)
    expect(r.inputs.selected).toBe(r.method.replace('auto-', ''))
    expect(typeof r.inputs.winningMase).toBe('number')
    // a trend should favour Holt over flat SES
    expect(r.method).toMatch(/holt/)
  })

  it('carries the winning method reasoning and merged citations', () => {
    const r = autoForecast([0, 0, 3, 0, 0, 5, 0, 2, 0, 0, 4, 0])
    expect(r.reasoning.some((line) => line.startsWith('['))).toBe(true) // [winner] ...
    expect(r.citations?.length).toBeGreaterThan(1)
  })
})

describe('autoForecast edge cases', () => {
  it('falls back to the pattern default and warns on a too-short series', () => {
    const r = autoForecast([3, 4]) // too short for any rolling origin
    expect(r.warnings?.some((w) => /too short|default/.test(w))).toBe(true)
  })

  it('validates inputs', () => {
    expect(() => autoForecast([])).toThrow(/non-empty/)
    expect(() => autoForecast([1, 2, 3], { horizon: 0 })).toThrow(/positive integer/)
    expect(() => autoForecast([1, 2, 3], { seasonLength: 1 })).toThrow(/≥ 2/)
  })
})
