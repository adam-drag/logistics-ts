/**
 * Forecast-accuracy metrics. Each compares an `actual` series against a
 * `forecast` of the same length and returns an {@link Explained} scalar so that
 * a caller (or an AI agent) sees not just the score but the convention, the
 * sample size, and any caveat — MAPE's undefined-at-zero behaviour in
 * particular. The error convention throughout is `eᵢ = actualᵢ − forecastᵢ`
 * (a positive mean error means the forecast ran low).
 *
 * @see Hyndman, R.J. & Koehler, A.B. (2006). Another look at measures of
 *   forecast accuracy. International Journal of Forecasting, 22(4), 679–688.
 */
import { type Explained, explain } from '@logistics-ts/core'

/** Validates that two series line up and are non-empty. */
function requirePaired(actual: readonly number[], forecast: readonly number[]): void {
  if (actual.length === 0) throw new Error('metric requires a non-empty actual series')
  if (actual.length !== forecast.length)
    throw new Error(
      `actual and forecast must have equal length (got ${actual.length} and ${forecast.length})`,
    )
}

/** Absolute errors `|actualᵢ − forecastᵢ|`. */
function absErrors(actual: readonly number[], forecast: readonly number[]): number[] {
  return actual.map((a, i) => Math.abs(a - (forecast[i] as number)))
}

function mean(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

/**
 * Mean absolute error: `MAE = (1/n) Σ|aᵢ − fᵢ|`. Same units as the series;
 * robust to outliers relative to RMSE. Lower is better.
 *
 * @param actual - Realised values.
 * @param forecast - Predicted values, aligned to `actual`.
 *
 * @example
 * ```ts
 * mae([10, 12, 14], [11, 11, 15]).value // 1
 * ```
 */
export function mae(actual: readonly number[], forecast: readonly number[]): Explained<number> {
  requirePaired(actual, forecast)
  const value = mean(absErrors(actual, forecast))
  return explain(value, {
    method: 'mae',
    inputs: { n: actual.length },
    reasoning: [`mean of ${actual.length} absolute errors = ${round(value)}`],
    citations: ['Hyndman & Koehler (2006), IJF 22(4)'],
  })
}

/**
 * Root mean squared error: `RMSE = √((1/n) Σ(aᵢ − fᵢ)²)`. Same units as the
 * series; penalises large errors more heavily than {@link mae}. Lower is better.
 *
 * @example
 * ```ts
 * rmse([10, 12, 14], [11, 11, 15]).value // 1
 * ```
 */
export function rmse(actual: readonly number[], forecast: readonly number[]): Explained<number> {
  requirePaired(actual, forecast)
  const value = Math.sqrt(mean(actual.map((a, i) => (a - (forecast[i] as number)) ** 2)))
  return explain(value, {
    method: 'rmse',
    inputs: { n: actual.length },
    reasoning: [`root mean of ${actual.length} squared errors = ${round(value)}`],
    citations: ['Hyndman & Koehler (2006), IJF 22(4)'],
  })
}

/**
 * Mean absolute percentage error: `MAPE = (100/n') Σ|aᵢ − fᵢ| / |aᵢ|`, in
 * percent. **Undefined where an actual is zero**: those terms are excluded and
 * a warning is emitted; if every actual is zero the result is `NaN`. Prefer
 * {@link mase} for intermittent demand.
 *
 * @example
 * ```ts
 * mape([100, 200], [110, 180]).value // 10
 * ```
 */
export function mape(actual: readonly number[], forecast: readonly number[]): Explained<number> {
  requirePaired(actual, forecast)
  const terms: number[] = []
  let zeros = 0
  actual.forEach((a, i) => {
    if (a === 0) {
      zeros++
      return
    }
    terms.push(Math.abs((a - (forecast[i] as number)) / a))
  })
  const warnings: string[] = []
  if (zeros > 0)
    warnings.push(
      `${zeros} of ${actual.length} actuals are zero; MAPE is undefined there and those terms were excluded — prefer MASE for intermittent demand`,
    )
  const value = terms.length === 0 ? Number.NaN : 100 * mean(terms)
  return explain(value, {
    method: 'mape',
    inputs: { n: actual.length, used: terms.length },
    reasoning: [
      terms.length === 0
        ? 'every actual is zero; MAPE is undefined'
        : `mean absolute percentage error over ${terms.length} non-zero actuals = ${round(value)}%`,
    ],
    citations: ['Hyndman & Koehler (2006), IJF 22(4)'],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}

/**
 * Symmetric MAPE: `sMAPE = (100/n) Σ 2|aᵢ − fᵢ| / (|aᵢ| + |fᵢ|)`, in percent,
 * ranging 0–200%. Bounded even when actuals are zero (a term where both actual
 * and forecast are zero contributes 0). Still asymmetric in practice; reported
 * for comparability with `statsforecast`.
 *
 * @example
 * ```ts
 * smape([100, 200], [110, 180]).value // ≈ 6.13
 * ```
 */
export function smape(actual: readonly number[], forecast: readonly number[]): Explained<number> {
  requirePaired(actual, forecast)
  const terms = actual.map((a, i) => {
    const f = forecast[i] as number
    const denom = Math.abs(a) + Math.abs(f)
    return denom === 0 ? 0 : (2 * Math.abs(a - f)) / denom
  })
  const value = 100 * mean(terms)
  return explain(value, {
    method: 'smape',
    inputs: { n: actual.length },
    reasoning: [`symmetric MAPE over ${actual.length} points = ${round(value)}% (0–200% scale)`],
    citations: ['Hyndman & Koehler (2006), IJF 22(4)'],
  })
}

export interface MaseOptions {
  /**
   * Seasonal period `m` for the in-sample naive benchmark. Default 1
   * (naive-1: `yₜ − yₜ₋₁`). Use e.g. 12 for monthly seasonal data.
   */
  seasonality?: number
}

/**
 * Mean absolute scaled error: `MASE = MAE / Q`, where the scale
 * `Q = (1/(N − m)) Σ_{t=m+1}^{N} |yₜ − yₜ₋ₘ|` is the mean absolute error of the
 * seasonal-naive forecast on the **in-sample** training series `y`. Scale-free
 * and defined for intermittent demand, so it is the metric `autoForecast` ranks
 * on. `MASE < 1` beats in-sample naive; `> 1` is worse. `NaN` (with a warning)
 * when the training series is constant, making `Q = 0`.
 *
 * @param actual - Realised out-of-sample values.
 * @param forecast - Forecast aligned to `actual`.
 * @param insample - The training series the forecast was fitted on.
 * @param options - Seasonal period `m` (default 1).
 *
 * @example
 * ```ts
 * // In-sample naive MAE Q = 1; test MAE = 1 → MASE = 1.
 * mase([10, 12], [11, 11], [10, 11, 12, 13]).value // 1
 * ```
 */
export function mase(
  actual: readonly number[],
  forecast: readonly number[],
  insample: readonly number[],
  options: MaseOptions = {},
): Explained<number> {
  requirePaired(actual, forecast)
  const { seasonality = 1 } = options
  if (!Number.isInteger(seasonality) || seasonality < 1)
    throw new Error(`seasonality must be a positive integer (got ${seasonality})`)
  if (insample.length <= seasonality)
    throw new Error(
      `in-sample series needs more than seasonality=${seasonality} points to scale MASE (got ${insample.length})`,
    )

  let naiveSum = 0
  for (let t = seasonality; t < insample.length; t++)
    naiveSum += Math.abs((insample[t] as number) - (insample[t - seasonality] as number))
  const scale = naiveSum / (insample.length - seasonality)

  const testMae = mean(absErrors(actual, forecast))
  const warnings: string[] = []
  const value = scale === 0 ? Number.NaN : testMae / scale
  if (scale === 0)
    warnings.push('in-sample series is constant under the seasonal-naive lag; MASE scale is zero')

  return explain(value, {
    method: 'mase',
    inputs: { n: actual.length, seasonality, scale: round(scale), testMae: round(testMae) },
    reasoning: [
      `in-sample seasonal-naive (m=${seasonality}) MAE = ${round(scale)}`,
      scale === 0
        ? 'scale is zero → MASE undefined'
        : `test MAE ${round(testMae)} / scale ${round(scale)} = ${round(value)}`,
    ],
    citations: ['Hyndman & Koehler (2006), IJF 22(4)'],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}

/**
 * Forecast bias as mean error `(1/n) Σ(aᵢ − fᵢ)` (positive = forecast runs low),
 * with a **tracking signal** `Σeᵢ / MAE` reported alongside in the explanation.
 * A tracking signal outside roughly ±4 conventionally flags a persistently
 * biased forecast that should be re-fitted.
 *
 * @example
 * ```ts
 * bias([10, 12, 14], [8, 10, 12]).value // 2 (forecast consistently 2 low)
 * ```
 */
export function bias(actual: readonly number[], forecast: readonly number[]): Explained<number> {
  requirePaired(actual, forecast)
  const errors = actual.map((a, i) => a - (forecast[i] as number))
  const value = mean(errors)
  const mad = mean(errors.map(Math.abs))
  const sumError = errors.reduce((s, e) => s + e, 0)
  const trackingSignal = mad === 0 ? 0 : sumError / mad
  const warnings: string[] = []
  if (Math.abs(trackingSignal) > 4)
    warnings.push(
      `tracking signal ${round(trackingSignal)} exceeds ±4; the forecast appears persistently biased`,
    )
  return explain(value, {
    method: 'bias',
    inputs: { n: actual.length, trackingSignal: round(trackingSignal) },
    reasoning: [
      `mean error = ${round(value)} (${value >= 0 ? 'forecast runs low' : 'forecast runs high'})`,
      `tracking signal ΣE/MAE = ${round(trackingSignal)}`,
    ],
    citations: ['Silver, Pyke & Thomas (2017)'],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}

function round(x: number): number {
  return Number.isNaN(x) ? Number.NaN : Math.round(x * 1e6) / 1e6
}
