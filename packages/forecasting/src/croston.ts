/**
 * Croston's method for intermittent demand. It forecasts a flat per-period
 * demand rate by separately smoothing the non-zero demand sizes and the
 * intervals between them, avoiding the downward bias that plain exponential
 * smoothing suffers on series full of zeros. Suits SBC intermittent/lumpy
 * patterns. Note the known upward bias of the ratio estimator — {@link sba}
 * corrects it and is the recommended intermittent default.
 *
 * @see Croston, J.D. (1972). Forecasting and stock control for intermittent
 *   demands. Operational Research Quarterly, 23(3), 289–303.
 */
import { type Explained, explain } from '@logistics-ts/core'
import { crostonRecursion } from './croston-base'
import type { Forecast, ForecastResult } from './types'

export interface CrostonOptions {
  /**
   * Smoothing constant `α ∈ (0, 1)` applied to both the size and interval
   * sub-series. Default 0.1, the classic low value Croston recommends; typical
   * range 0.1–0.3.
   */
  alpha?: number
  /** Periods ahead to forecast. Default 1. */
  horizon?: number
}

/**
 * Forecasts an intermittent series by Croston's method.
 *
 * Forecast: a flat per-period rate `ŷ = ẑ / q̂`, where `ẑ` is the SES-smoothed
 * non-zero demand size and `q̂` the SES-smoothed inter-demand interval (units:
 * demand units per period). A series with no demand forecasts `0` with a
 * warning.
 *
 * @param series - Demand per period, oldest → newest, zero-filled. Non-empty.
 * @param options - Optional `alpha` (default 0.1) and `horizon` (default 1).
 * @returns An {@link Explained} {@link Forecast}; `params` carries α, ẑ, q̂.
 *
 * @example
 * ```ts
 * // α=0.5 on [0,5,0,0,7]: ẑ=6, q̂=2.5 → flat rate 2.4.
 * croston([0, 5, 0, 0, 7], { alpha: 0.5 }).value.forecast // [2.4]
 * ```
 */
export function croston(series: readonly number[], options: CrostonOptions = {}): ForecastResult {
  return crostonForecast(series, options, 'croston', 1)
}

/**
 * Shared forecast builder for Croston and its bias-corrected SBA variant.
 *
 * @param correction - Multiplier on the base rate: `1` for Croston, `1 − α/2`
 *   for SBA.
 * @internal
 */
export function crostonForecast(
  series: readonly number[],
  options: CrostonOptions,
  method: 'croston' | 'sba',
  correction: number,
): ForecastResult {
  const { alpha = 0.1, horizon = 1 } = options
  if (series.length === 0) throw new Error(`${method} requires a non-empty series`)
  if (alpha <= 0 || alpha >= 1) throw new Error(`alpha must be in (0, 1) (got ${alpha})`)
  if (!Number.isInteger(horizon) || horizon < 1)
    throw new Error(`horizon must be a positive integer (got ${horizon})`)

  const { size, interval, rate, fitted, occurrences } = crostonRecursion(series, alpha)
  const warnings: string[] = []
  const baseRate = occurrences === 0 ? 0 : rate
  const value = correction * baseRate
  if (occurrences === 0) warnings.push('series has no demand; forecast is 0')
  else if (occurrences < 2)
    warnings.push(
      'only one demand occurrence; the interval estimate is the initial value, not smoothed',
    )

  const forecast = Array.from({ length: horizon }, () => value)
  const corrected = method === 'sba'
  const result: Forecast = {
    forecast,
    fitted: corrected ? fitted.map((r) => correction * r) : fitted,
    params: {
      alpha,
      size: occurrences === 0 ? 0 : round(size),
      interval: occurrences === 0 ? 0 : round(interval),
      ...(corrected ? { correction: round(correction) } : {}),
    },
  }
  return explain(result, {
    method,
    inputs: { alpha, horizon, occurrences, periods: series.length },
    reasoning: [
      occurrences === 0
        ? 'no demand observed → forecast 0'
        : `smoothed demand size ẑ=${round(size)}, interval q̂=${round(interval)} → base rate ${round(baseRate)}`,
      corrected
        ? `SBA bias correction ×(1 − α/2)=${round(correction)} → ${round(value)} per period`
        : `flat rate ${round(value)} per period across ${horizon} period${horizon === 1 ? '' : 's'}`,
    ],
    citations: corrected ? ['Syntetos & Boylan (2005), IJF 21(2)'] : ['Croston (1972), ORQ 23(3)'],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}

function round(x: number): number {
  return Number.isNaN(x) ? Number.NaN : Math.round(x * 1e6) / 1e6
}
