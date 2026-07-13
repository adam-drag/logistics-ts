/**
 * Teunter–Syntetos–Babai (TSB) method for intermittent demand. Unlike Croston,
 * it updates the demand **probability every period** — including zero periods —
 * so the forecast decays toward zero during a long run of no demand. That makes
 * it the obsolescence-aware choice for items that may be dying out (SBC lumpy
 * demand with a risk of going obsolete).
 *
 * @see Teunter, R.H., Syntetos, A.A. & Babai, M.Z. (2011). Intermittent demand:
 *   Linking forecasting to inventory obsolescence. European Journal of
 *   Operational Research, 214(3), 606–615.
 */
import { explain } from '@logistics-ts/core'
import { round } from './round'
import type { Forecast, ForecastResult } from './types'

export interface TsbOptions {
  /** Demand-size smoothing `α_z ∈ (0, 1)`. Default 0.1. */
  alphaDemand?: number
  /** Demand-probability smoothing `α_p ∈ (0, 1)`. Default 0.1. */
  alphaProbability?: number
  /** Periods ahead to forecast. Default 1. */
  horizon?: number
}

/**
 * Forecasts an intermittent series by the TSB method.
 *
 * Every period updates the probability `p̂ ← α_p·dₜ + (1−α_p)·p̂` (with `dₜ = 1`
 * if demand occurred, else `0`); on demand periods the size updates
 * `ẑ ← α_z·yₜ + (1−α_z)·ẑ`. Forecast is the flat rate `ŷ = p̂·ẑ` (units: demand
 * units per period). Initialisation follows `statsforecast`'s TSB (pinned by the
 * golden fixtures): `p̂ = d₀` (the first period's 0/1 demand indicator, then
 * updated every period from `t = 1`), and `ẑ = y_{t₀}` (the first non-zero
 * demand, smoothed over later demand periods). A series with no demand
 * forecasts `0` with a warning.
 *
 * @param series - Demand per period, oldest → newest, zero-filled. Non-empty.
 * @param options - Optional `alphaDemand`, `alphaProbability` (both default 0.1),
 *   and `horizon` (default 1).
 * @returns A {@link ForecastResult} ({@link Forecast} plus explanation); `params` carries p̂ and ẑ.
 *
 * @example
 * ```ts
 * // α_z=α_p=0.5 on [0,4,0,0,2]: p̂=0.5625, ẑ=3 → flat rate 1.6875.
 * tsb([0, 4, 0, 0, 2], { alphaDemand: 0.5, alphaProbability: 0.5 }).value.forecast // [1.6875]
 * ```
 */
export function tsb(series: readonly number[], options: TsbOptions = {}): ForecastResult {
  const { alphaDemand = 0.1, alphaProbability = 0.1, horizon = 1 } = options
  if (series.length === 0) throw new Error('tsb requires a non-empty series')
  if (alphaDemand <= 0 || alphaDemand >= 1)
    throw new Error(`alphaDemand must be in (0, 1) (got ${alphaDemand})`)
  if (alphaProbability <= 0 || alphaProbability >= 1)
    throw new Error(`alphaProbability must be in (0, 1) (got ${alphaProbability})`)
  if (!Number.isInteger(horizon) || horizon < 1)
    throw new Error(`horizon must be a positive integer (got ${horizon})`)

  const t0 = series.findIndex((v) => v > 0)
  const fitted: number[] = new Array(series.length).fill(Number.NaN)
  const warnings: string[] = []

  let value = 0
  let size = 0
  let prob = 0
  if (t0 === -1) {
    warnings.push('series has no demand; forecast is 0')
  } else {
    // statsforecast convention: p̂ starts at the first period's 0/1 indicator
    // and smooths every period; ẑ starts at the first non-zero demand and
    // smooths on later demand periods only.
    size = series[t0] as number
    prob = t0 === 0 ? 1 : 0
    for (let t = 1; t < series.length; t++) {
      // One-step forecast known before observing t — defined once ẑ exists.
      if (t > t0) fitted[t] = prob * size
      const y = series[t] as number
      const d = y > 0 ? 1 : 0
      if (d === 1 && t > t0) size = alphaDemand * y + (1 - alphaDemand) * size
      prob = alphaProbability * d + (1 - alphaProbability) * prob
    }
    value = prob * size
  }

  const forecast = Array.from({ length: horizon }, () => value)
  const result: Forecast = {
    forecast,
    fitted,
    params: { alphaDemand, alphaProbability, probability: round(prob), size: round(size) },
  }
  return explain(result, {
    method: 'tsb',
    inputs: {
      alphaDemand,
      alphaProbability,
      horizon,
      periods: series.length,
    },
    reasoning: [
      t0 === -1
        ? 'no demand observed → forecast 0'
        : `demand probability p̂=${round(prob)}, size ẑ=${round(size)} → rate p̂·ẑ=${round(value)}`,
      'probability updates every period, so long zero runs decay the forecast toward 0',
    ],
    citations: ['Teunter, Syntetos & Babai (2011), EJOR 214(3)'],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}
