# @logistics-ts/forecasting

[![npm version](https://img.shields.io/npm/v/@logistics-ts/forecasting.svg)](https://www.npmjs.com/package/@logistics-ts/forecasting)
[![license](https://img.shields.io/npm/l/@logistics-ts/forecasting.svg)](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)

Demand forecasting for [`logistics-ts`](https://www.npmjs.com/package/logistics-ts):
moving average, exponential smoothing (SES, Holt ±damped, Holt-Winters),
intermittent-demand methods (Croston/SBA/TSB), seasonal decomposition,
rolling-origin backtesting, accuracy metrics, and `autoForecast`, which
classifies the series and picks the lowest-MASE method for you. Every method
returns an `Explained<T>` `Forecast`.

## Install

```bash
npm i @logistics-ts/forecasting
```

## What's in it

- **`autoForecast`** — classifies the demand pattern (smooth / erratic /
  intermittent / lumpy), backtests the candidate methods for that quadrant,
  and returns the lowest-MASE one. You don't pick the method.
- **Point methods**: `movingAverage`, `ses`, `holt` (±damped), `holtWinters`
  (additive/multiplicative) for smooth/erratic demand; `croston`, `sba`, `tsb`
  for intermittent/lumpy demand.
- **`seasonalDecompose`** — classical additive/multiplicative decomposition.
- **`backtest`** — rolling-origin backtesting for any `Forecaster`.
- **Metrics**: `mae`, `rmse`, `mape`, `smape`, `mase`, `bias` — prefer `mase`
  for intermittent series (`mape` is undefined at zero demand).

## Quick start

```ts
import { bucketize, generateExampleData } from '@logistics-ts/core'
import { autoForecast } from '@logistics-ts/forecasting'

const { demand } = generateExampleData({ items: 1, periods: 24, seed: 3 })
const series = bucketize(demand, 'month')[0]
const quantities = series.buckets.map((b) => b.quantity)

const f = autoForecast(quantities, { horizon: 3 })
console.log(f.value.forecast) // number[] — next 3 periods
console.log(f.method)         // e.g. 'auto-holt' — the winning method
console.log(f.reasoning)      // why it was chosen (pattern, candidates, MASE scores)
```

Feed `bucketize`'s dense, zero-filled output — not a compacted list of
nonzero-only sales — or the intermittent-demand statistics (ADI, CV²) and
exponential-smoothing recursions will be wrong.

## In the umbrella package

`@logistics-ts/forecasting` is re-exported as the `forecasting` namespace
from [`logistics-ts`](https://www.npmjs.com/package/logistics-ts). It depends
on `@logistics-ts/core` and `@logistics-ts/classification` (`autoForecast`
routes by demand-pattern classification).

## Links

- [Full docs, API map, and examples](https://github.com/adam-drag/logistics-ts)
- [Other `logistics-ts` packages](https://github.com/adam-drag/logistics-ts#packages)

## License

[MIT](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)
