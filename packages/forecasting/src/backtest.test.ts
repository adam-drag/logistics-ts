import { describe, expect, it } from 'vitest'
import { backtest } from './backtest'
import { ses } from './ses'

describe('backtest rolling-origin', () => {
  it('scores a naive (last-value) forecaster with hand-checkable errors', () => {
    // naive one-step on 1..6, minTrain 2: origins predict 3,4,5,6 from 2,3,4,5
    const naive = (t: readonly number[], h: number): number[] => new Array(h).fill(t.at(-1))
    const { value } = backtest([1, 2, 3, 4, 5, 6], naive, { minTrain: 2 })
    expect(value.origins).toBe(4)
    expect(value.forecasts).toEqual([2, 3, 4, 5])
    expect(value.actuals).toEqual([3, 4, 5, 6])
    expect(value.mae).toBeCloseTo(1, 10) // every one-step error is +1
    // in-sample naive MAE over 1..6 is 1 → MASE = 1
    expect(value.mase).toBeCloseTo(1, 10)
  })

  it('evaluates the h-step-ahead forecast when horizon > 1', () => {
    const naive = (t: readonly number[], h: number): number[] => new Array(h).fill(t.at(-1))
    // horizon 2 on 1..6, minTrain 2: predict actual[o+1] from last train value
    const { value } = backtest([1, 2, 3, 4, 5, 6], naive, { minTrain: 2, horizon: 2 })
    expect(value.actuals).toEqual([4, 5, 6]) // 2-step-ahead targets
    expect(value.mae).toBeCloseTo(2, 10) // naive is 2 low at 2-step
  })

  it('skips origins where the forecaster returns NaN', () => {
    const flaky = (t: readonly number[], h: number): number[] =>
      t.length < 4 ? new Array(h).fill(Number.NaN) : new Array(h).fill(t.at(-1))
    const { value } = backtest([1, 2, 3, 4, 5, 6], flaky, { minTrain: 2 })
    expect(value.origins).toBe(2) // only trains of length 4 and 5 score
  })

  it('works with a real forecaster (SES) end to end', () => {
    const series = [10, 11, 9, 12, 10, 13, 11, 14]
    const r = backtest(series, (t, h) => ses(t, { horizon: h }).value.forecast, { minTrain: 3 })
    expect(r.value.origins).toBeGreaterThan(0)
    expect(Number.isFinite(r.value.mase)).toBe(true)
    expect(r.method).toBe('rolling-origin-backtest')
  })

  it('validates horizon/step and impossible windows', () => {
    expect(() => backtest([1, 2, 3], () => [1], { horizon: 0 })).toThrow(/positive integer/)
    expect(() => backtest([1, 2, 3], () => [1], { minTrain: 3, horizon: 2 })).toThrow(/too short/)
  })
})
