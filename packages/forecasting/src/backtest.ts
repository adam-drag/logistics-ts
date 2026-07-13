/**
 * Rolling-origin backtesting (time-series cross-validation). Repeatedly trains a
 * forecaster on an expanding prefix of the series and scores its `h`-step-ahead
 * forecast against the held-out actual, stepping the origin forward. This is the
 * honest way to compare forecasting methods and is what {@link autoForecast}
 * uses to choose one. Aggregated error is reported as MAE, RMSE, and MASE.
 *
 * @see Hyndman, R.J. & Athanasopoulos, G. (2021). Forecasting: Principles and
 *   Practice, 3rd ed. (fpp3), §5.10 (time-series cross-validation).
 */
import { type Explained, explain } from '@logistics-ts/core'
import { mae as maeMetric, mase as maseMetric, rmse as rmseMetric } from './metrics'
import { round } from './round'

/** Produces `horizon` point forecasts from a training prefix. */
export type Forecaster = (train: readonly number[], horizon: number) => number[]

export interface BacktestOptions {
  /** Steps ahead scored at each origin (the `h`-step error). Default 1. */
  horizon?: number
  /**
   * Size of the smallest training prefix. Defaults to leaving up to 10 origins:
   * `max(2, T − horizon − 9)`.
   */
  minTrain?: number
  /** Origin step between successive evaluations. Default 1. */
  step?: number
  /** Seasonal period `m` for the MASE scale. Default 1. */
  seasonality?: number
}

export interface BacktestResult {
  /** Held-out actual at each scored origin. */
  actuals: number[]
  /** `h`-step-ahead forecast at each scored origin. */
  forecasts: number[]
  /** Number of origins evaluated. */
  origins: number
  /** Mean absolute error across origins. */
  mae: number
  /** Root mean squared error across origins. */
  rmse: number
  /** Mean absolute scaled error (scaled by the full-series seasonal-naive MAE). */
  mase: number
}

/**
 * Backtests a forecaster over a series by rolling-origin evaluation.
 *
 * For each origin `o` (training length) from `minTrain` upward in steps of
 * `step`, the forecaster is trained on `series[0..o)` and its `h`-step forecast
 * is compared to `series[o + h − 1]`. MASE scales the resulting MAE by the
 * whole series' seasonal-naive in-sample MAE.
 *
 * @param series - The full series, oldest → newest.
 * @param forecaster - Maps `(train, horizon)` to `horizon` point forecasts.
 * @param options - Horizon, minimum training size, step, and MASE seasonality.
 * @returns An {@link Explained} {@link BacktestResult}.
 *
 * @example
 * ```ts
 * // one-step naive (last value) backtest
 * backtest([1, 2, 3, 4, 5, 6], (t, h) => Array(h).fill(t.at(-1))).value.mae
 * ```
 */
export function backtest(
  series: readonly number[],
  forecaster: Forecaster,
  options: BacktestOptions = {},
): Explained<BacktestResult> {
  const { horizon = 1, step = 1, seasonality = 1 } = options
  if (!Number.isInteger(horizon) || horizon < 1)
    throw new Error(`horizon must be a positive integer (got ${horizon})`)
  if (!Number.isInteger(step) || step < 1)
    throw new Error(`step must be a positive integer (got ${step})`)
  const minTrain = options.minTrain ?? Math.max(2, series.length - horizon - 9)
  if (minTrain < 1) throw new Error('minTrain must be at least 1')
  if (minTrain + horizon > series.length)
    throw new Error(
      `series too short: minTrain ${minTrain} + horizon ${horizon} exceeds length ${series.length}`,
    )

  const actuals: number[] = []
  const forecasts: number[] = []
  for (let o = minTrain; o + horizon - 1 < series.length; o += step) {
    const train = series.slice(0, o)
    const fc = forecaster(train, horizon)
    const point = fc[horizon - 1]
    if (point === undefined || !Number.isFinite(point)) continue // skip origins the method can't score
    forecasts.push(point)
    actuals.push(series[o + horizon - 1] as number)
  }
  if (actuals.length === 0)
    throw new Error(
      'no scorable origins produced a finite forecast; check the forecaster or minTrain',
    )

  const mae = maeMetric(actuals, forecasts).value
  const rmse = rmseMetric(actuals, forecasts).value
  const mase = maseMetric(actuals, forecasts, series, { seasonality }).value

  return explain(
    { actuals, forecasts, origins: actuals.length, mae, rmse, mase },
    {
      method: 'rolling-origin-backtest',
      inputs: {
        horizon,
        minTrain,
        step,
        origins: actuals.length,
        mae: round(mae),
        mase: round(mase),
      },
      reasoning: [
        `evaluated ${actuals.length} rolling origins at horizon ${horizon}`,
        `MAE ${round(mae)}, RMSE ${round(rmse)}, MASE ${round(mase)}`,
      ],
      citations: ['Hyndman & Athanasopoulos (2021), fpp3 §5.10'],
    },
  )
}
