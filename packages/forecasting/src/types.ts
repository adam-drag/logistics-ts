/**
 * Shared result types for the forecasting package. Every forecasting method
 * consumes a dense, zero-filled demand series (oldest → newest) and returns an
 * {@link Explained} {@link Forecast}: the point forecasts, the one-step-ahead
 * fitted values over history, and the fitted/chosen parameters.
 *
 * Forecasts are returned as a plain `number[]` indexed by horizon step (1..h),
 * not as calendar-labelled points: the numeric core is deliberately decoupled
 * from calendar handling, which lives in `@logistics-ts/core`'s `bucketize`.
 * Zip the forecast with future buckets when calendar labels are needed.
 */
import type { Explained } from '@logistics-ts/core'

/** The value payload of a forecast, wrapped by {@link ForecastResult}. */
export interface Forecast {
  /**
   * `h`-step-ahead point forecasts, index 0 being one period ahead of the last
   * observation. Length equals the requested `horizon`.
   */
  forecast: number[]
  /**
   * One-step-ahead fitted values aligned to the input series (same length).
   * Positions with no defined fitted value (e.g. before the model has warmed
   * up) are `NaN`, so that accuracy metrics can skip them explicitly.
   */
  fitted: number[]
  /** The parameters that produced the forecast (fitted or supplied), by name. */
  params: Record<string, number>
}

/** A forecast paired with its machine-readable explanation. */
export type ForecastResult = Explained<Forecast>
