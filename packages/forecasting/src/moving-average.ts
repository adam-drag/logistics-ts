/**
 * Simple moving-average forecast. The forecast for every future period is the
 * arithmetic mean of the last `window` observations; because it carries no trend
 * or seasonality, that flat mean is repeated across the whole horizon. Suitable
 * only for series without trend or seasonality (SBC *smooth*).
 *
 * @see Hyndman, R.J. & Athanasopoulos, G. (2021). Forecasting: Principles and
 *   Practice, 3rd ed. (fpp3), §3.3.
 */
import { type Explained, explain } from '@logistics-ts/core'
import type { Forecast, ForecastResult } from './types'

export interface MovingAverageOptions {
  /** Number of trailing observations to average. Must satisfy `1 ≤ window ≤ series.length`. */
  window: number
  /** Periods ahead to forecast. Default 1. */
  horizon?: number
}

/**
 * Forecasts a series by the mean of its last `window` observations.
 *
 * Formula: `ŷ_{T+h} = (1/w) Σ_{i=T-w+1}^{T} yᵢ` for every `h`. Fitted value at
 * period `t` (for `t ≥ w`) is the mean of the `w` observations ending at `t−1`.
 * Units follow the input series.
 *
 * @param series - Demand per period, oldest → newest, zero-filled.
 * @param options - `window` (required) and `horizon` (default 1).
 * @returns An {@link Explained} {@link Forecast}; `params.window` records the window.
 *
 * @example
 * ```ts
 * movingAverage([10, 12, 14, 16], { window: 2, horizon: 1 }).value.forecast // [15]
 * ```
 */
export function movingAverage(
  series: readonly number[],
  options: MovingAverageOptions,
): ForecastResult {
  const { window, horizon = 1 } = options
  if (!Number.isInteger(window) || window < 1)
    throw new Error(`window must be a positive integer (got ${window})`)
  if (window > series.length)
    throw new Error(`window ${window} exceeds series length ${series.length}`)
  if (!Number.isInteger(horizon) || horizon < 1)
    throw new Error(`horizon must be a positive integer (got ${horizon})`)

  const avgEndingBefore = (t: number): number => {
    let sum = 0
    for (let i = t - window; i < t; i++) sum += series[i] as number
    return sum / window
  }

  // One-step fitted value: defined once w prior observations exist.
  const fitted = series.map((_, t) => (t < window ? Number.NaN : avgEndingBefore(t)))
  const level = avgEndingBefore(series.length)
  const forecast = Array.from({ length: horizon }, () => level)

  const value: Forecast = { forecast, fitted, params: { window } }
  return explain(value, {
    method: 'moving-average',
    inputs: { window, horizon, periods: series.length },
    reasoning: [
      `averaged the last ${window} of ${series.length} observations → ${round(level)}`,
      `repeated flat across ${horizon} period${horizon === 1 ? '' : 's'} (no trend/seasonality modelled)`,
    ],
    citations: ['Hyndman & Athanasopoulos (2021), fpp3 §3.3'],
  })
}

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6
}
