/**
 * @logistics-ts/forecasting — demand forecasting methods and accuracy metrics.
 *
 * Point-forecasting methods for the SBC demand quadrants: moving average and
 * exponential smoothing (SES, Holt ±damped, Holt-Winters) for smooth/erratic
 * series, and Croston/SBA/TSB for intermittent/lumpy series; plus classical
 * seasonal decomposition, rolling-origin backtesting, accuracy metrics, and
 * `autoForecast`, which classifies the series and picks the lowest-MASE method.
 * Every forecasting method returns an `Explained` {@link Forecast}.
 */

// Auto selection + backtesting
export { type AutoForecastOptions, autoForecast } from './auto'
export {
  type BacktestOptions,
  type BacktestResult,
  backtest,
  type Forecaster,
} from './backtest'
export { type CrostonOptions, croston } from './croston'
export { type HoltOptions, holt } from './holt'
export { type HoltWintersOptions, holtWinters } from './holt-winters'
// Accuracy metrics
export { bias, type MaseOptions, mae, mape, mase, rmse, smape } from './metrics'
// Methods
export { type MovingAverageOptions, movingAverage } from './moving-average'
export { type SbaOptions, sba } from './sba'
export {
  type SeasonalDecomposeOptions,
  type SeasonalDecomposition,
  seasonalDecompose,
} from './seasonal-decompose'
export { type SesOptions, ses } from './ses'
export { type TsbOptions, tsb } from './tsb'
// Result types
export type { Forecast, ForecastResult } from './types'
