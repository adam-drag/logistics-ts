/**
 * Trend detection: is this series going up, going down, or neither?
 *
 * The naive version of this is one line — fit a slope, check its sign — and it
 * is wrong in two ways that matter in an inventory UI.
 *
 * **A raw slope is not comparable between items.** A slope is in units per
 * period, so a threshold like `slope > 0.1` means something completely
 * different for an item averaging 5,000 a day and one averaging 0.5 a day. The
 * first is flat by any sensible reading and the second has doubled. A label
 * that is applied per item and then read down a column has to be scale-free, so
 * {@link trend} gates on the slope **relative to the level of the series**.
 *
 * **Every real series has a nonzero slope.** Fit a line to pure noise and you
 * get a slope, with a sign, every time. Reporting its sign as a direction means
 * reporting noise as a trend for roughly half the flat items in a catalogue.
 * So the slope must also be distinguishable from zero, which is a `t` test on
 * the regression coefficient with `n − 2` degrees of freedom.
 *
 * A direction is therefore reported only when the slope is **both material and
 * significant**. Either gate alone produces a label that looks informative and
 * is not. Both gates are reported separately on the result, so a caller that
 * disagrees with the defaults can apply its own rule to the evidence rather
 * than re-deriving it.
 *
 * @see Hyndman, R.J. & Athanasopoulos, G. (2021). Forecasting: Principles and
 *   Practice, 3rd ed. (fpp3), ch. 7 (time series regression).
 */
import {
  type Explained,
  explain,
  mean,
  type TConfidenceLevel,
  tCriticalTwoTailed,
} from '@logistics-ts/core'
import { round } from './round'

/** Which way the series is going, once both gates are applied. */
export type TrendDirection = 'increasing' | 'decreasing' | 'flat'

export interface TrendOptions {
  /**
   * Confidence for the significance gate. One of 0.90, 0.95, 0.99. Default
   * 0.95. Raising it makes `direction` harder to move off `flat`.
   */
  confidenceLevel?: TConfidenceLevel
  /**
   * How large the per-period slope must be, as a fraction of the mean level, to
   * count as material. Default `0.01`, i.e. the series must be moving by at
   * least 1% of its own average per period.
   *
   * **This is a convention, not a derivation.** There is no statistical result
   * that says 1% is the line between "worth acting on" and "noise" — that
   * depends on the business, and a catalogue of fast movers may well want 0.005
   * while a slow-moving spares catalogue wants 0.05. The default is set low
   * enough to catch a real drift over a planning horizon and high enough to
   * ignore rounding, and it is exposed precisely so it can be overridden.
   */
  minRelativeSlope?: number
}

/** The evidence behind a {@link TrendDirection}, wrapped by {@link TrendResult}. */
export interface Trend {
  /** OLS slope in units per period. Positive means rising. */
  slope: number
  /** OLS intercept, i.e. the fitted value at period index 0. */
  intercept: number
  /** Standard error of the slope. `0` when the fit is exact. */
  slopeStdError: number
  /**
   * `slope / slopeStdError`. `±Infinity` when the fit is exact (zero residual
   * variance), which is a real, if degenerate, certainty rather than an error;
   * a warning is attached when it happens.
   */
  tStatistic: number
  /** Two-tailed critical value the `tStatistic` was compared against. */
  tCritical: number
  /** Mean of `|y|`, the scale the slope is measured against. */
  level: number
  /** `slope / level`: the fraction of the mean level gained or lost per period. */
  relativeSlope: number
  /** Fraction of variance the straight line explains. `1` for an exact fit. */
  rSquared: number
  /** `|relativeSlope| ≥ minRelativeSlope`: large enough to act on. */
  material: boolean
  /** `|tStatistic| ≥ tCritical`: distinguishable from zero at `confidenceLevel`. */
  significant: boolean
  /** `flat` unless the slope is **both** material and significant. */
  direction: TrendDirection
}

/** A trend verdict paired with the evidence and reasoning behind it. */
export type TrendResult = Explained<Trend>

/**
 * Detects the direction of a demand series by ordinary least squares, gated on
 * both materiality and statistical significance.
 *
 * Fits `y = intercept + slope · t` with `t = 0 … n−1`, then:
 * - `slopeStdError = √( (SSE / (n−2)) / Σ(t − t̄)² )`
 * - `tStatistic = slope / slopeStdError`, compared against the two-tailed
 *   critical value at `n − 2` degrees of freedom
 * - `relativeSlope = slope / mean(|y|)`, compared against `minRelativeSlope`
 *
 * `direction` is `increasing` or `decreasing` only when both comparisons pass,
 * and `flat` otherwise. Units: `slope` is in input units per period, and the
 * period is whatever you bucketed at — pass a series from `bucketize` so that
 * "per period" means one calendar period rather than one transaction.
 *
 * @param series - Demand per period, oldest → newest, dense and zero-filled.
 *   **At least 3 points**, since the slope's standard error needs `n − 2 ≥ 1`
 *   degrees of freedom. All values must be finite.
 * @param options - Optional `confidenceLevel` and `minRelativeSlope`.
 * @returns A {@link TrendResult}: the direction plus every number behind it.
 * @throws Error when the series is too short or carries a non-finite value.
 *
 * @example
 * ```ts
 * // A clean upward ramp: 5% of the mean level per period, easily significant.
 * trend([10, 12, 14, 16, 18, 20, 22, 24]).value.direction  // 'increasing'
 *
 * // Noise around a constant level. The fitted slope is not exactly zero, but
 * // it is neither material nor distinguishable from zero.
 * trend([20, 18, 22, 19, 21, 20, 22, 18]).value.direction  // 'flat'
 * ```
 */
export function trend(series: readonly number[], options: TrendOptions = {}): TrendResult {
  const { confidenceLevel = 0.95, minRelativeSlope = 0.01 } = options

  if (series.length < 3) {
    throw new Error(
      `trend requires at least 3 observations (got ${series.length}) — the slope's standard ` +
        'error needs n − 2 ≥ 1 degrees of freedom, and a line through 2 points always fits ' +
        'exactly, so no direction could be distinguished from noise',
    )
  }
  for (let i = 0; i < series.length; i++) {
    if (!Number.isFinite(series[i] as number)) {
      throw new Error(`trend: series[${i}] must be finite (got ${series[i]})`)
    }
  }
  if (!Number.isFinite(minRelativeSlope) || minRelativeSlope < 0) {
    throw new Error(
      `trend: minRelativeSlope must be finite and non-negative (got ${minRelativeSlope})`,
    )
  }

  const n = series.length
  const xBar = (n - 1) / 2
  const yBar = mean(series)

  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const dx = i - xBar
    sxx += dx * dx
    sxy += dx * ((series[i] as number) - yBar)
  }

  const slope = sxy / sxx
  const intercept = yBar - slope * xBar

  let sse = 0
  let sst = 0
  for (let i = 0; i < n; i++) {
    const y = series[i] as number
    const residual = y - (intercept + slope * i)
    sse += residual * residual
    const centred = y - yBar
    sst += centred * centred
  }

  const degreesOfFreedom = n - 2
  const slopeStdError = Math.sqrt(sse / degreesOfFreedom / sxx)
  // An exact fit leaves no residual variance. slope/0 is ±Infinity, which is
  // the truthful answer (the line is certain), and 0/0 for a constant series is
  // NaN, which is not — so a flat series is pinned to 0 rather than left to
  // produce a NaN that would leak into every comparison below.
  const tStatistic = slopeStdError === 0 ? (slope === 0 ? 0 : slope / 0) : slope / slopeStdError
  const tCritical = tCriticalTwoTailed(degreesOfFreedom, confidenceLevel)
  // R² is 1 − SSE/SST, which is 0/0 for a constant series. SSE = 0 means the
  // line reproduces the data exactly, so the fit explains everything there was
  // to explain, and 1 is the right report in both exact-fit cases.
  const rSquared = sse === 0 ? 1 : 1 - sse / sst

  // Scale the slope against the mean of |y| rather than the mean, so a series
  // that dips negative cannot flip the SIGN of relativeSlope away from the
  // sign of the slope. For a demand series the two are the same number.
  const level = mean(series.map(Math.abs))
  const relativeSlope = level === 0 ? 0 : slope / level

  const material = Math.abs(relativeSlope) >= minRelativeSlope
  const significant = Math.abs(tStatistic) >= tCritical
  const direction: TrendDirection =
    material && significant ? (slope > 0 ? 'increasing' : 'decreasing') : 'flat'

  const warnings: string[] = []
  if (level === 0) {
    warnings.push(
      'every observation is zero, so there is no level to measure a slope against — reported flat, on no evidence of anything',
    )
  } else if (sse === 0 && slope === 0) {
    warnings.push(
      'the series is constant, so the slope is exactly zero and the significance test is degenerate — reported flat, which is correct but carries no information about the future',
    )
  } else if (sse === 0) {
    warnings.push(
      `the straight line reproduces the series exactly, leaving zero residual variance, so the t statistic is infinite and the trend is reported as significant by definition — real demand is never this clean, so check the series is observed data rather than something already fitted or interpolated`,
    )
  }
  if (material && !significant) {
    warnings.push(
      `the slope is ${round(Math.abs(relativeSlope) * 100)}% of the mean level per period, which clears the materiality bar, but it is not distinguishable from zero at ${confidenceLevel} confidence over ${n} periods — reported flat, and more history would settle it`,
    )
  }
  if (significant && !material) {
    warnings.push(
      `the slope is statistically solid but tiny: ${round(Math.abs(relativeSlope) * 100)}% of the mean level per period, below the ${round(minRelativeSlope * 100)}% materiality bar — reported flat because it is unlikely to change a planning decision, not because it is absent`,
    )
  }
  if (degreesOfFreedom < 3) {
    warnings.push(
      `only ${n} periods, so the test has ${degreesOfFreedom} degree(s) of freedom and a critical value of ${tCritical} — the bar for calling a direction is very high and a genuine trend will often be missed`,
    )
  }

  const value: Trend = {
    slope,
    intercept,
    slopeStdError,
    tStatistic,
    tCritical,
    level,
    relativeSlope,
    rSquared,
    material,
    significant,
    direction,
  }

  return explain(value, {
    method: 'ols-trend',
    inputs: {
      periods: n,
      confidenceLevel,
      minRelativeSlope,
    },
    reasoning: [
      `least squares of demand on period index over ${n} periods: slope ${round(slope)} unit(s) per period, intercept ${round(intercept)}, R² ${round(rSquared)}`,
      `materiality: |${round(relativeSlope)}| of the mean level ${round(level)} per period vs a ${round(minRelativeSlope)} bar → ${material ? 'material' : 'not material'}`,
      `significance: |t| = ${round(Math.abs(tStatistic))} vs the two-tailed critical value ${tCritical} at ${degreesOfFreedom} degrees of freedom and ${confidenceLevel} confidence → ${significant ? 'significant' : 'not significant'}`,
      `direction ${direction}: a direction is reported only when the slope is both material and significant, because a raw slope sign labels noise as a trend and a raw slope size is not comparable between items`,
    ],
    citations: ['Hyndman & Athanasopoulos (2021), fpp3 ch. 7'],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}
