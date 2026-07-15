/**
 * Holt's linear trend method (double exponential smoothing), with an optional
 * damped trend. It smooths a level and a trend, so the forecast grows linearly
 * with the horizon — or, when damped, flattens toward a horizontal asymptote as
 * the trend contribution decays by `φ` each step. Suits SBC smooth/erratic
 * series that trend but have no seasonality.
 *
 * @see Hyndman, R.J. & Athanasopoulos, G. (2021). Forecasting: Principles and
 *   Practice, 3rd ed. (fpp3), §8.2 (Holt) and §8.3 (damped trend).
 */
import { explain, nelderMead } from '@logistics-ts/core'
import { round } from './round'
import type { Forecast, ForecastResult } from './types'

export interface HoltOptions {
  /** Level smoothing `α ∈ (0, 1)`. Fitted by SSE minimisation when omitted. */
  alpha?: number
  /** Trend smoothing `β ∈ (0, 1)`. Fitted by SSE minimisation when omitted. */
  beta?: number
  /**
   * Damping `φ ∈ (0, 1]`. Ignored unless `damped` is set. Fitted (in `(0, 1)`)
   * when `damped` is true and `phi` is omitted.
   */
  phi?: number
  /** Damp the trend so long-horizon forecasts flatten. Default false (φ = 1). */
  damped?: boolean
  /** Periods ahead to forecast. Default 1. */
  horizon?: number
}

interface HoltParams {
  alpha: number
  beta: number
  phi: number
}

interface HoltState {
  level: number
  trend: number
  fitted: number[]
  sse: number
}

/** Runs the Holt recursion for fixed parameters, returning final state + SSE. */
function run(series: readonly number[], p: HoltParams): HoltState {
  // Initialise level at the first observation and trend from the first step.
  let level = series[0] as number
  let trend = (series[1] as number) - (series[0] as number)
  const fitted: number[] = [Number.NaN]
  let sse = 0
  for (let t = 1; t < series.length; t++) {
    const oneStep = level + p.phi * trend // forecast for period t before update
    fitted.push(oneStep)
    const err = (series[t] as number) - oneStep
    sse += err * err
    const prevLevel = level
    level = p.alpha * (series[t] as number) + (1 - p.alpha) * oneStep
    trend = p.beta * (level - prevLevel) + (1 - p.beta) * p.phi * trend
  }
  return { level, trend, fitted, sse }
}

/**
 * Forecasts a trending series by Holt's method.
 *
 * Recursions: `lₜ = α·yₜ + (1−α)(lₜ₋₁ + φ·bₜ₋₁)`,
 * `bₜ = β(lₜ − lₜ₋₁) + (1−β)φ·bₜ₋₁`; forecast
 * `ŷ_{T+h} = l_T + (Σ_{i=1}^{h} φⁱ)·b_T` (so `l_T + h·b_T` when undamped, φ = 1).
 * States initialise at `l = y₀`, `b = y₁ − y₀`. Omitted parameters are fitted by
 * minimising in-sample SSE. Units follow the input series.
 *
 * @param series - Demand per period, oldest → newest. **At least 2 points.**
 * @param options - Optional `alpha`/`beta`/`phi`, `damped`, and `horizon`.
 * @returns A {@link ForecastResult} ({@link Forecast} plus explanation); `params` carries α, β, φ.
 *
 * @example
 * ```ts
 * // α=β=0.5, undamped: from [10,12,15,16] the 2-step forecast is [18.4375, 20.5].
 * holt([10, 12, 15, 16], { alpha: 0.5, beta: 0.5, horizon: 2 }).value.forecast
 * ```
 */
export function holt(series: readonly number[], options: HoltOptions = {}): ForecastResult {
  const { damped = false, horizon = 1 } = options
  if (series.length < 2) throw new Error('holt requires at least 2 observations')
  if (!Number.isInteger(horizon) || horizon < 1)
    throw new Error(`horizon must be a positive integer (got ${horizon})`)
  checkUnit('alpha', options.alpha)
  checkUnit('beta', options.beta)
  if (options.phi !== undefined && (options.phi <= 0 || options.phi > 1))
    throw new Error(`phi must be in (0, 1] (got ${options.phi})`)

  const p = fitParams(series, options, damped)
  const { level, trend, fitted } = run(series, p)

  // Geometric damping sum Σφⁱ, i=1..h (= h when φ = 1).
  let damp = 0
  const forecast: number[] = []
  for (let h = 1; h <= horizon; h++) {
    damp += p.phi ** h
    forecast.push(level + damp * trend)
  }

  const value: Forecast = {
    forecast,
    fitted,
    params: { alpha: p.alpha, beta: p.beta, phi: p.phi },
  }
  return explain(value, {
    method: damped ? 'holt-damped' : 'holt',
    inputs: {
      alpha: round(p.alpha),
      beta: round(p.beta),
      phi: round(p.phi),
      horizon,
      periods: series.length,
    },
    reasoning: [
      `${describeFit(options, damped)} → α=${round(p.alpha)}, β=${round(p.beta)}${damped ? `, φ=${round(p.phi)}` : ''}`,
      `final level ${round(level)}, trend ${round(trend)} per period`,
      damped
        ? `damped: trend contribution decays by φ=${round(p.phi)} each step, flattening long forecasts`
        : `linear: forecast extends the trend at ${round(trend)}/period`,
    ],
    citations: ['Hyndman & Athanasopoulos (2021), fpp3 §8.2–8.3'],
  })
}

/** Fits whichever of α/β/φ are omitted by minimising SSE; φ free only if damped. */
function fitParams(series: readonly number[], options: HoltOptions, damped: boolean): HoltParams {
  const logistic = (t: number): number => 1 / (1 + Math.exp(-t))
  // Build the list of free parameters and a builder mapping θ → HoltParams.
  const free: ('alpha' | 'beta' | 'phi')[] = []
  if (options.alpha === undefined) free.push('alpha')
  if (options.beta === undefined) free.push('beta')
  if (damped && options.phi === undefined) free.push('phi')

  // A parameter is either supplied or free — `next()` consumes θ in the same
  // order the free list was built (α, β, φ).
  const build = (theta: readonly number[]): HoltParams => {
    let i = 0
    const next = (): number => logistic(theta[i++] as number)
    return {
      alpha: options.alpha ?? next(),
      beta: options.beta ?? next(),
      phi: !damped ? 1 : (options.phi ?? next()),
    }
  }
  if (free.length === 0) return build([])
  const result = nelderMead(
    (theta) => run(series, build(theta)).sse,
    free.map(() => 0),
    {
      maxIterations: 800,
    },
  )
  return build(result.x)
}

function describeFit(options: HoltOptions, damped: boolean): string {
  const supplied =
    options.alpha !== undefined &&
    options.beta !== undefined &&
    (!damped || options.phi !== undefined)
  return supplied ? 'supplied parameters' : 'fitted parameters by minimising in-sample SSE'
}

function checkUnit(name: string, v: number | undefined): void {
  if (v !== undefined && (v <= 0 || v >= 1)) throw new Error(`${name} must be in (0, 1) (got ${v})`)
}
