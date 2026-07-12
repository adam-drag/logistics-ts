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

// Result types
export type { Forecast, ForecastResult } from './types'

// Methods
export { type MovingAverageOptions, movingAverage } from './moving-average'
export { type SesOptions, ses } from './ses'
export { type HoltOptions, holt } from './holt'
export { type HoltWintersOptions, holtWinters } from './holt-winters'
export { type CrostonOptions, croston } from './croston'
export { type SbaOptions, sba } from './sba'
export { type TsbOptions, tsb } from './tsb'
export {
  type SeasonalDecomposeOptions,
  type SeasonalDecomposition,
  seasonalDecompose,
} from './seasonal-decompose'

// Auto selection + backtesting
export { type AutoForecastOptions, autoForecast } from './auto'
export {
  type Forecaster,
  type BacktestOptions,
  type BacktestResult,
  backtest,
} from './backtest'

// Accuracy metrics
export { type MaseOptions, mae, rmse, mape, smape, mase, bias } from './metrics'
