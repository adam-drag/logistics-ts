/**
 * Classical seasonal decomposition by moving averages. Splits a series into a
 * trend-cycle (a centered moving average of order `m`), a repeating seasonal
 * component, and a remainder — additively (`y = T + S + R`) or multiplicatively
 * (`y = T · S · R`). This is a descriptive tool for understanding a series, not
 * itself a forecaster; the trend is undefined (`NaN`) at the ends where the
 * moving average cannot be centered.
 *
 * @see Hyndman, R.J. & Athanasopoulos, G. (2021). Forecasting: Principles and
 *   Practice, 3rd ed. (fpp3), §3.4.
 */
import { type Explained, explain } from '@logistics-ts/core'
import { round } from './round'

export interface SeasonalDecomposeOptions {
  /** Length of one seasonal cycle `m ≥ 2`. Required. */
  seasonLength: number
  /** `'additive'` (default) or `'multiplicative'` decomposition. */
  mode?: 'additive' | 'multiplicative'
}

export interface SeasonalDecomposition {
  /** Trend-cycle from the centered moving average; `NaN` near both ends. */
  trend: number[]
  /** Seasonal component, one value per period, repeating with period `m`. */
  seasonal: number[]
  /** Remainder after removing trend and seasonal. `NaN` where trend is `NaN`. */
  remainder: number[]
  /** The `m` seasonal indices (sum to 0 additive; average to 1 multiplicative). */
  seasonalIndices: number[]
}

/**
 * Decomposes a seasonal series into trend, seasonal, and remainder components.
 *
 * The trend-cycle is a `2×m` centered moving average when `m` is even, or an
 * `m`-term centered average when odd. Seasonal indices average the detrended
 * series by position and are then centered (additive: subtract their mean so
 * they sum to 0; multiplicative: divide by their mean so they average 1).
 *
 * @param series - Values per period, oldest → newest. **Length ≥ 2·seasonLength.**
 *   Multiplicative mode requires strictly positive values.
 * @param options - `seasonLength` (required) and `mode` (default additive).
 * @returns An {@link Explained} {@link SeasonalDecomposition}.
 *
 * @example
 * ```ts
 * // trend 10,11,12,… + seasonal [-2,0,+2]:
 * seasonalDecompose([8, 11, 14, 11, 14, 17, 14, 17, 20], { seasonLength: 3 })
 *   .value.seasonalIndices // ≈ [-2, 0, 2]
 * ```
 */
export function seasonalDecompose(
  series: readonly number[],
  options: SeasonalDecomposeOptions,
): Explained<SeasonalDecomposition> {
  const { seasonLength: m, mode = 'additive' } = options
  if (!Number.isInteger(m) || m < 2)
    throw new Error(`seasonLength must be an integer ≥ 2 (got ${m})`)
  if (series.length < 2 * m)
    throw new Error(
      `seasonalDecompose needs at least two full seasons (${2 * m}; got ${series.length})`,
    )
  const multiplicative = mode === 'multiplicative'
  if (multiplicative && series.some((v) => v <= 0))
    throw new Error('multiplicative decomposition requires strictly positive values')

  const trend = centeredMovingAverage(series, m)

  // Detrend, then average by seasonal position over the periods where trend is defined.
  const detrended = series.map((y, t) => {
    const tr = trend[t] as number
    return Number.isNaN(tr) ? Number.NaN : multiplicative ? y / tr : y - tr
  })
  const bucketSums = new Array(m).fill(0)
  const bucketCounts = new Array(m).fill(0)
  detrended.forEach((d, t) => {
    if (!Number.isNaN(d)) {
      bucketSums[t % m] += d
      bucketCounts[t % m]++
    }
  })
  const rawIndices = bucketSums.map((s, i) =>
    bucketCounts[i] > 0 ? s / bucketCounts[i] : multiplicative ? 1 : 0,
  )
  // Center: additive indices sum to 0; multiplicative indices average to 1.
  const meanIndex = rawIndices.reduce((s, v) => s + v, 0) / m
  const seasonalIndices = rawIndices.map((v) => (multiplicative ? v / meanIndex : v - meanIndex))

  const seasonal = series.map((_, t) => seasonalIndices[t % m] as number)
  const remainder = series.map((y, t) => {
    const tr = trend[t] as number
    if (Number.isNaN(tr)) return Number.NaN
    const s = seasonal[t] as number
    return multiplicative ? y / (tr * s) : y - tr - s
  })

  return explain(
    { trend, seasonal, remainder, seasonalIndices },
    {
      method: multiplicative
        ? 'classical-decomposition-multiplicative'
        : 'classical-decomposition-additive',
      inputs: {
        seasonLength: m,
        periods: series.length,
        definedTrendPoints: trend.filter((v) => !Number.isNaN(v)).length,
      },
      reasoning: [
        `trend-cycle via ${m % 2 === 0 ? `2×${m}` : `${m}`}-term centered moving average`,
        `${mode} seasonal indices ${seasonalIndices.map((v) => round(v)).join(', ')}`,
        'remainder is the series with trend and seasonal removed',
      ],
      citations: ['Hyndman & Athanasopoulos (2021), fpp3 §3.4'],
    },
  )
}

/** Centered moving average of order `m` (2×m when even), `NaN` at the ends. */
function centeredMovingAverage(series: readonly number[], m: number): number[] {
  const n = series.length
  const out = new Array(n).fill(Number.NaN)
  const even = m % 2 === 0
  const half = Math.floor(m / 2)
  for (let t = half; t < n - half; t++) {
    let sum = 0
    if (even) {
      // 2×m MA: half weight on the two endpoints of the window of width m+1.
      sum += 0.5 * (series[t - half] as number) + 0.5 * (series[t + half] as number)
      for (let i = t - half + 1; i <= t + half - 1; i++) sum += series[i] as number
      out[t] = sum / m
    } else {
      for (let i = t - half; i <= t + half; i++) sum += series[i] as number
      out[t] = sum / m
    }
  }
  return out
}
