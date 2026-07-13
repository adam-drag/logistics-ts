/**
 * Syntetos–Boylan Approximation (SBA) — Croston's method scaled by `(1 − α/2)`
 * to remove the well-known positive bias of the size/interval ratio estimator.
 * It is the recommended default for intermittent and lumpy demand, giving lower
 * error than Croston across the SBC intermittent/lumpy quadrants.
 *
 * @see Syntetos, A.A. & Boylan, J.E. (2005). The accuracy of intermittent demand
 *   estimates. International Journal of Forecasting, 21(2), 303–314.
 */
import { type CrostonOptions, crostonForecast } from './croston'
import type { ForecastResult } from './types'

export type { CrostonOptions as SbaOptions }

/**
 * Forecasts an intermittent series by the Syntetos–Boylan Approximation.
 *
 * Forecast: `ŷ = (1 − α/2)·(ẑ / q̂)` — the Croston rate with a multiplicative
 * bias correction (units: demand units per period). A series with no demand
 * forecasts `0` with a warning.
 *
 * @param series - Demand per period, oldest → newest, zero-filled. Non-empty.
 * @param options - Optional `alpha` (default 0.1) and `horizon` (default 1).
 * @returns An {@link Explained} {@link Forecast}; `params.correction` is `1 − α/2`.
 *
 * @example
 * ```ts
 * // α=0.5 on [0,5,0,0,7]: Croston rate 2.4 × (1 − 0.25) = 1.8.
 * sba([0, 5, 0, 0, 7], { alpha: 0.5 }).value.forecast // [1.8]
 * ```
 */
export function sba(series: readonly number[], options: CrostonOptions = {}): ForecastResult {
  const alpha = options.alpha ?? 0.1
  return crostonForecast(series, options, 'sba', 1 - alpha / 2)
}
