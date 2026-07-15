# @logistics-ts/core

[![npm version](https://img.shields.io/npm/v/@logistics-ts/core.svg)](https://www.npmjs.com/package/@logistics-ts/core)
[![license](https://img.shields.io/npm/l/@logistics-ts/core.svg)](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)

Foundational layer of [`logistics-ts`](https://www.npmjs.com/package/logistics-ts):
canonical record types, CSV/DB-row loaders, time bucketization, shared
numerics, the `Explained<T>` result wrapper, and synthetic demo data. **Zero
runtime dependencies.**

## Install

```bash
npm i @logistics-ts/core
```

## What's in it

- **Records**: `DemandRecord`, `StockRecord`, `LeadTimeRecord`, plus
  `loadDemand`/`loadStock`/`loadLeadTimes` to map arbitrary rows onto them.
- **`bucketize`**: turns raw demand into a dense, zero-filled per-item time
  series — the shape every forecasting/classification function expects.
- **Numerics**: `mean`, `standardDeviation`, `variance`,
  `coefficientOfVariation`, `averageDemandInterval`, `inverseNormalCdf`,
  `normalCdf`/`normalPdf`, `nelderMead` — hand-rolled and golden-tested
  against authoritative values, not a wrapped stats library.
- **`generateExampleData`**: a reproducible synthetic `{ demand, stock,
  leadTimes }` catalogue, for demos and tests.
- **`Explained<T>` / `explain()`**: the result-wrapper contract used across
  every `logistics-ts` package — `{ value, method, inputs, reasoning,
  citations?, warnings? }`.

## Quick start

```ts
import { bucketize, generateExampleData, mean, standardDeviation } from '@logistics-ts/core'

const { demand } = generateExampleData({ items: 3, seed: 1 })
const series = bucketize(demand, 'month')[0]
const quantities = series.buckets.map((b) => b.quantity)

console.log(mean(quantities), standardDeviation(quantities))
```

## In the umbrella package

`@logistics-ts/core` is re-exported as the `core` namespace from
[`logistics-ts`](https://www.npmjs.com/package/logistics-ts). Install this
scoped package directly when you only need the data model and numerics — no
forecasting, classification, or inventory logic.

## Links

- [Full docs, API map, and examples](https://github.com/adam-drag/logistics-ts)
- [Other `logistics-ts` packages](https://github.com/adam-drag/logistics-ts#packages)

## License

[MIT](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)
