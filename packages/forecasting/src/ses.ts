/**
 * Simple exponential smoothing (SES) — a flat-forecast method that weights past
 * observations with geometrically decaying weights. It models a level but no
 * trend or seasonality, so the forecast is the final smoothed level repeated
 * across the horizon. Best for SBC smooth or erratic series without trend.
 *
 * @see Hyndman, R.J. & Athanasopoulos, G. (2021). Forecasting: Principles and
 *   Practice, 3rd ed. (fpp3), §8.1.
 */
import { type Explained, explain, nelderMead } from '@logistics-ts/core'
import type { Forecast, ForecastResult } from './types'

export interface SesOptions {
  /**
   * Smoothing parameter `α ∈ (0, 1)`. Higher reacts faster to recent change.
   * Omit to fit `α` by minimising the in-sample sum of squared one-step errors
   * via Nelder–Mead.
   */
  alpha?: number
  /** Periods ahead to forecast. Default 1. */
  horizon?: number
}

/** Runs the SES recursion and returns the level path and SSE for a given α. */
function smooth(series: readonly number[], alpha: number): { levels: number[]; sse: number } {
  // Textbook initialisation: the level starts at the first observation.
  const levels: number[] = [series[0] as number]
  let sse = 0
  for (let t = 1; t < series.length; t++) {
    const prev = levels[t - 1] as number
    const y = series[t] as number
    sse += (y - prev) ** 2 // one-step error uses the pre-update level
    levels.push(alpha * y + (1 - alpha) * prev)
  }
  return { levels, sse }
}

/**
 * Forecasts a series by simple exponential smoothing.
 *
 * Recursion: `lₜ = α·yₜ + (1 − α)·lₜ₋₁`, initialised at `l₀ = y₀`; the one-step
 * fitted value for period `t` is `lₜ₋₁`, and `ŷ_{T+h} = l_T` for every `h`.
 * When `alpha` is omitted it is chosen to minimise `Σ(yₜ − lₜ₋₁)²`. Units follow
 * the input series.
 *
 * @param series - Demand per period, oldest → newest, zero-filled. Non-empty.
 * @param options - Optional fixed `alpha` and `horizon` (default 1).
 * @returns An {@link Explained} {@link Forecast}; `params.alpha` is the α used.
 *
 * @example
 * ```ts
 * // Fixed α = 0.5, l₀ = 10: l₁ = 11, l₂ = 12.5 → flat forecast 12.5.
 * ses([10, 12, 14], { alpha: 0.5 }).value.forecast // [12.5]
 * ```
 */
export function ses(series: readonly number[], options: SesOptions = {}): ForecastResult {
  const { horizon = 1 } = options
  if (series.length === 0) throw new Error('ses requires a non-empty series')
  if (!Number.isInteger(horizon) || horizon < 1)
    throw new Error(`horizon must be a positive integer (got ${horizon})`)
  if (options.alpha !== undefined && (options.alpha <= 0 || options.alpha >= 1))
    throw new Error(`alpha must be in (0, 1) (got ${options.alpha})`)

  const fitted = options.alpha === undefined
  // Optimise α on a logistic transform so Nelder–Mead stays unconstrained while
  // α is confined to (0, 1); start at θ = 0 ⇒ α = 0.5.
  const alpha = fitted ? fitAlpha(series) : (options.alpha as number)

  const { levels } = smooth(series, alpha)
  const level = levels[levels.length - 1] as number
  const fittedValues = series.map((_, t) => (t === 0 ? Number.NaN : (levels[t - 1] as number)))
  const forecast = Array.from({ length: horizon }, () => level)

  const value: Forecast = { forecast, fitted: fittedValues, params: { alpha } }
  return explain(value, {
    method: 'ses',
    inputs: { alpha: round(alpha), horizon, periods: series.length },
    reasoning: [
      fitted
        ? `fitted α = ${round(alpha)} by minimising in-sample SSE`
        : `supplied α = ${round(alpha)}`,
      `final smoothed level ${round(level)} repeated flat across ${horizon} period${horizon === 1 ? '' : 's'}`,
    ],
    citations: ['Hyndman & Athanasopoulos (2021), fpp3 §8.1'],
  })
}

/** Fits α ∈ (0,1) minimising SSE via a logistic reparameterisation. */
function fitAlpha(series: readonly number[]): number {
  const toAlpha = (theta: number): number => 1 / (1 + Math.exp(-theta))
  const result = nelderMead((x) => smooth(series, toAlpha(x[0] as number)).sse, [0], {
    maxIterations: 500,
  })
  return toAlpha(result.x[0] as number)
}

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6
}
