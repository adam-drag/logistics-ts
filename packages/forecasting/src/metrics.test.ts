import { describe, expect, it } from 'vitest'
import { bias, mae, mape, mase, rmse, smape } from './metrics'

describe('mae / rmse', () => {
  it('computes mean absolute and root-mean-squared error', () => {
    // errors: -1, +1, -1 → |e| = 1,1,1; e² = 1,1,1
    expect(mae([10, 12, 14], [11, 11, 15]).value).toBeCloseTo(1, 10)
    expect(rmse([10, 12, 14], [11, 11, 15]).value).toBeCloseTo(1, 10)
  })

  it('rmse penalises a single large error more than mae', () => {
    const a = [0, 0, 0, 0]
    const f = [0, 0, 0, 4]
    expect(mae(a, f).value).toBeCloseTo(1, 10) // (0+0+0+4)/4
    expect(rmse(a, f).value).toBeCloseTo(2, 10) // sqrt(16/4)
  })

  it('rejects mismatched lengths and empty input', () => {
    expect(() => mae([1, 2], [1]).value).toThrow(/equal length/)
    expect(() => mae([], []).value).toThrow(/non-empty/)
  })
})

describe('mape', () => {
  it('reports percentage error over non-zero actuals', () => {
    // |−10|/100 = .1, |20|/200 = .1 → 10%
    expect(mape([100, 200], [110, 180]).value).toBeCloseTo(10, 10)
  })

  it('excludes zero actuals and warns', () => {
    const r = mape([0, 100], [5, 110])
    expect(r.value).toBeCloseTo(10, 10) // only the 100 term counts
    expect(r.warnings?.[0]).toMatch(/zero/)
    expect(r.inputs.used).toBe(1)
  })

  it('returns NaN when every actual is zero', () => {
    expect(mape([0, 0], [1, 2]).value).toBeNaN()
  })
})

describe('smape', () => {
  it('is bounded and symmetric-ish (statsforecast convention, 0–200%)', () => {
    // 2*10/(100+110)=0.0952; 2*20/(200+180)=0.1053; mean*100 ≈ 10.02
    expect(smape([100, 200], [110, 180]).value).toBeCloseTo(10.0250626566, 6)
  })

  it('treats a both-zero point as a perfect (0%) term', () => {
    expect(smape([0, 100], [0, 100]).value).toBeCloseTo(0, 10)
  })
})

describe('mase', () => {
  it('scales test MAE by the in-sample naive-1 MAE (Hyndman & Koehler 2006)', () => {
    // insample naive diffs |1|,|1|,|1| → Q=1; test MAE = 1 → MASE = 1
    expect(mase([10, 12], [11, 11], [10, 11, 12, 13]).value).toBeCloseTo(1, 10)
  })

  it('is below 1 when the forecast beats in-sample naive', () => {
    // Q = 1 (steady +1 series); perfect forecast → MASE 0
    expect(mase([14, 15], [14, 15], [10, 11, 12, 13]).value).toBeCloseTo(0, 10)
  })

  it('supports a seasonal denominator', () => {
    // m=2: diffs over lag-2 of [2,4,2,4,2,4]: |2-2|... all 0 → scale 0 → NaN + warn
    const r = mase([2, 4], [3, 3], [2, 4, 2, 4, 2, 4], { seasonality: 2 })
    expect(r.value).toBeNaN()
    expect(r.warnings?.[0]).toMatch(/scale is zero|constant/)
  })

  it('validates seasonality against the in-sample length', () => {
    expect(() => mase([1], [1], [5], { seasonality: 1 }).value).toThrow(/more than/)
    expect(() => mase([1], [1], [1, 2, 3], { seasonality: 0 }).value).toThrow(/positive integer/)
  })
})

describe('bias', () => {
  it('is positive when the forecast runs low, with a tracking signal', () => {
    const r = bias([10, 12, 14], [8, 10, 12])
    expect(r.value).toBeCloseTo(2, 10)
    expect(r.inputs.trackingSignal).toBeCloseTo(3, 10) // ΣE=6, MAE=2
  })

  it('warns when the tracking signal exceeds ±4 (persistent bias)', () => {
    // all errors +1 → ΣE=5, MAE=1 → TS=5
    const r = bias([1, 1, 1, 1, 1], [0, 0, 0, 0, 0])
    expect(r.warnings?.[0]).toMatch(/tracking signal/)
  })
})
