---
'@logistics-ts/forecasting': minor
---

M3 forecasting: implement the full method set on `@logistics-ts/forecasting`.

- **Point methods** — `movingAverage`, `ses` (Nelder–Mead-fitted α), `holt`
  (±damped), `holtWinters` (additive/multiplicative), and the intermittent
  family `croston`, `sba`, `tsb`.
- **Decomposition** — `seasonalDecompose` (classical MA-based, additive/multiplicative).
- **Auto selection** — `autoForecast` routes via SBC demand-pattern
  classification and picks the lowest-MASE candidate by rolling-origin
  `backtest`.
- **Accuracy metrics** — `mae`, `rmse`, `mape` (zero-demand warning), `smape`,
  `mase`, `bias` (with tracking signal).

Every forecasting method returns an `Explained<Forecast>` (point forecasts,
one-step fitted values, fitted parameters) with formula/citation TSDoc and
golden tests. Adds a `workspace:*` dependency on `@logistics-ts/classification`.
