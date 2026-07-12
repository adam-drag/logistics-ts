/**
 * Holt-Winters seasonal method (triple exponential smoothing), additive or
 * multiplicative. It smooths a level, a trend, and `m` seasonal indices, so the
 * forecast carries both the extrapolated trend and the repeating seasonal shape.
 * Additive suits roughly constant-amplitude seasonality; multiplicative suits
 * seasonality that scales with the level. Requires at least two full seasons.
 *
 * @see Hyndman, R.J. & Athanasopoulos, G. (2021). Forecasting: Principles and
 *   Practice, 3rd ed. (fpp3), §8.4.
 */
import { type Explained, explain, nelderMead } from '@logistics-ts/core'
import type { Forecast, ForecastResult } from './types'

export interface HoltWintersOptions {
  /** Length of one seasonal cycle `m ≥ 2` (e.g. 12 for monthly data). Required. */
  seasonLength: number
  /** `'additive'` (default) or `'multiplicative'` seasonality. */
  mode?: 'additive' | 'multiplicative'
  /** Level smoothing `α ∈ (0, 1)`. Fitted by SSE minimisation when omitted. */
  alpha?: number
  /** Trend smoothing `β ∈ (0, 1)`. Fitted by SSE minimisation when omitted. */
  beta?: number
  /** Seasonal smoothing `γ ∈ (0, 1)`. Fitted by SSE minimisation when omitted. */
  gamma?: number
  /** Periods ahead to forecast. Default 1. */
  horizon?: number
}

interface HwParams {
  alpha: number
  beta: number
  gamma: number
}

interface HwState {
  level: number
  trend: number
  /** Seasonal history of length `T + m`; `s_{t−m}` is at index `t`. */
  seasonals: number[]
  fitted: number[]
  sse: number
}

/** Runs the Holt-Winters recursion for fixed parameters. */
function run(series: readonly number[], m: number, multiplicative: boolean, p: HwParams): HwState {
  const seasonMean = (from: number): number => {
    let sum = 0
    for (let i = 0; i < m; i++) sum += series[from + i] as number
    return sum / m
  }
  // fpp3 heuristic initialisation from the first two seasons.
  const firstMean = seasonMean(0)
  const secondMean = seasonMean(m)
  let level = firstMean
  let trend = (secondMean - firstMean) / m
  const seasonals: number[] = []
  for (let i = 0; i < m; i++) {
    const y = series[i] as number
    seasonals.push(multiplicative ? y / firstMean : y - firstMean)
  }

  const fitted: number[] = []
  let sse = 0
  for (let t = 0; t < series.length; t++) {
    const sTm = seasonals[t] as number // s_{t−m}
    const predLevel = level + trend // l_{t−1} + b_{t−1}
    const oneStep = multiplicative ? predLevel * sTm : predLevel + sTm
    // Suppress the first (warm-up) season, whose seasonals came from the data.
    fitted.push(t < m ? Number.NaN : oneStep)
    if (t >= m) {
      const err = (series[t] as number) - oneStep
      sse += err * err
    }
    const y = series[t] as number
    const prevLevel = level
    level = multiplicative
      ? p.alpha * (y / sTm) + (1 - p.alpha) * predLevel
      : p.alpha * (y - sTm) + (1 - p.alpha) * predLevel
    trend = p.beta * (level - prevLevel) + (1 - p.beta) * trend
    const sNew = multiplicative
      ? p.gamma * (y / predLevel) + (1 - p.gamma) * sTm
      : p.gamma * (y - predLevel) + (1 - p.gamma) * sTm
    seasonals.push(sNew)
  }
  return { level, trend, seasonals, fitted, sse }
}

/**
 * Forecasts a seasonal series by the Holt-Winters method.
 *
 * Additive recursions (fpp3 §8.4): `lₜ = α(yₜ − s_{t−m}) + (1−α)(lₜ₋₁+bₜ₋₁)`,
 * `bₜ = β(lₜ − lₜ₋₁) + (1−β)bₜ₋₁`, `sₜ = γ(yₜ − lₜ₋₁ − bₜ₋₁) + (1−γ)s_{t−m}`;
 * forecast `ŷ_{T+h} = l_T + h·b_T + s_{T+h−m(⌊(h−1)/m⌋+1)}`. The multiplicative
 * form replaces the seasonal `±` with `×`/`÷`. States initialise from the first
 * two seasons. Omitted parameters are fitted by minimising in-sample SSE.
 *
 * @param series - Demand per period, oldest → newest. **Length ≥ 2·seasonLength.**
 *   Multiplicative mode requires all values strictly positive.
 * @param options - `seasonLength` (required), `mode`, `alpha`/`beta`/`gamma`, `horizon`.
 * @returns An {@link Explained} {@link Forecast}; `params` carries α, β, γ.
 *
 * @example
 * ```ts
 * // A period-3 additive series is reproduced and continued exactly.
 * holtWinters([10, 20, 30, 10, 20, 30], { seasonLength: 3, horizon: 3 }).value.forecast
 * // ≈ [10, 20, 30]
 * ```
 */
export function holtWinters(
  series: readonly number[],
  options: HoltWintersOptions,
): ForecastResult {
  const { seasonLength: m, mode = 'additive', horizon = 1 } = options
  if (!Number.isInteger(m) || m < 2)
    throw new Error(`seasonLength must be an integer ≥ 2 (got ${m})`)
  if (series.length < 2 * m)
    throw new Error(
      `holtWinters needs at least two full seasons (${2 * m} points; got ${series.length})`,
    )
  if (!Number.isInteger(horizon) || horizon < 1)
    throw new Error(`horizon must be a positive integer (got ${horizon})`)
  const multiplicative = mode === 'multiplicative'
  if (multiplicative && series.some((v) => v <= 0))
    throw new Error('multiplicative Holt-Winters requires strictly positive values')
  checkUnit('alpha', options.alpha)
  checkUnit('beta', options.beta)
  checkUnit('gamma', options.gamma)

  const p = fitParams(series, m, multiplicative, options)
  const { level, trend, seasonals, fitted } = run(series, m, multiplicative, p)

  const T = series.length
  const forecast: number[] = []
  for (let h = 1; h <= horizon; h++) {
    const seasonal = seasonals[T + ((h - 1) % m)] as number
    const base = level + h * trend
    forecast.push(multiplicative ? base * seasonal : base + seasonal)
  }

  const value: Forecast = {
    forecast,
    fitted,
    params: { alpha: p.alpha, beta: p.beta, gamma: p.gamma },
  }
  return explain(value, {
    method: multiplicative ? 'holt-winters-multiplicative' : 'holt-winters-additive',
    inputs: {
      alpha: round(p.alpha),
      beta: round(p.beta),
      gamma: round(p.gamma),
      seasonLength: m,
      horizon,
      periods: series.length,
    },
    reasoning: [
      `${describeFit(options)} → α=${round(p.alpha)}, β=${round(p.beta)}, γ=${round(p.gamma)}`,
      `${mode} seasonality with period ${m}; final level ${round(level)}, trend ${round(trend)}/period`,
      'forecast extends the trend and reapplies the fitted seasonal indices',
    ],
    citations: ['Hyndman & Athanasopoulos (2021), fpp3 §8.4'],
  })
}

/** Fits whichever of α/β/γ are omitted by minimising SSE. */
function fitParams(
  series: readonly number[],
  m: number,
  multiplicative: boolean,
  options: HoltWintersOptions,
): HwParams {
  const logistic = (t: number): number => 1 / (1 + Math.exp(-t))
  const free: ('alpha' | 'beta' | 'gamma')[] = []
  if (options.alpha === undefined) free.push('alpha')
  if (options.beta === undefined) free.push('beta')
  if (options.gamma === undefined) free.push('gamma')

  const build = (theta: readonly number[]): HwParams => {
    let i = 0
    const next = (): number => logistic(theta[i++] as number)
    return {
      alpha: options.alpha ?? next(),
      beta: options.beta ?? next(),
      gamma: options.gamma ?? next(),
    }
  }
  if (free.length === 0) return build([])
  const result = nelderMead(
    (theta) => run(series, m, multiplicative, build(theta)).sse,
    free.map(() => 0),
    {
      maxIterations: 1000,
    },
  )
  return build(result.x)
}

function describeFit(options: HoltWintersOptions): string {
  const supplied =
    options.alpha !== undefined && options.beta !== undefined && options.gamma !== undefined
  return supplied ? 'supplied parameters' : 'fitted parameters by minimising in-sample SSE'
}

function checkUnit(name: string, v: number | undefined): void {
  if (v !== undefined && (v <= 0 || v >= 1)) throw new Error(`${name} must be in (0, 1) (got ${v})`)
}

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6
}
