# @logistics-ts/classification

[![npm version](https://img.shields.io/npm/v/@logistics-ts/classification.svg)](https://www.npmjs.com/package/@logistics-ts/classification)
[![license](https://img.shields.io/npm/l/@logistics-ts/classification.svg)](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)

Inventory and demand classification for [`logistics-ts`](https://www.npmjs.com/package/logistics-ts):
ABC (value), XYZ (variability), FSN (movement), the ABC-XYZ policy matrix, and
the Syntetos–Boylan–Croston demand-pattern classifier that drives forecasting
method selection. Every classifier returns an `Explained<T>` result.

## Install

```bash
npm i @logistics-ts/classification
```

## What's in it

- **`abc`** — Pareto value classification (the "vital few").
- **`xyz`** — demand-variability classification from a bucketed series.
- **`fsn`** — fast / slow / non-moving split.
- **`abcXyzMatrix`** — combines ABC + XYZ into a policy-hinted cell per item.
- **`classifyDemandPattern`** — smooth / erratic / intermittent / lumpy
  (Syntetos–Boylan–Croston quadrant); this is what
  [`@logistics-ts/forecasting`](https://www.npmjs.com/package/@logistics-ts/forecasting)'s
  `autoForecast` routes on.

## Quick start

```ts
import { bucketize, generateExampleData } from '@logistics-ts/core'
import { abc, abcXyzMatrix, xyz } from '@logistics-ts/classification'

const { demand } = generateExampleData({ items: 6, seed: 2 })
const series = bucketize(demand, 'month')

const items = series.map((s) => ({
  itemId: s.itemId,
  volume: s.buckets.reduce((sum, b) => sum + b.quantity, 0),
  unitValue: demand.find((d) => d.itemId === s.itemId)?.unitPrice ?? 0,
}))

const abcResult = abc(items, { by: 'value' })
const xyzResult = xyz(series)
const matrix = abcXyzMatrix(abcResult.value, xyzResult.value)

console.log(matrix.value) // [{ itemId, class: 'AX'..'CZ', policyHint }, ...]
```

## In the umbrella package

`@logistics-ts/classification` is re-exported as the `classification`
namespace from [`logistics-ts`](https://www.npmjs.com/package/logistics-ts).
It depends only on `@logistics-ts/core`.

## Links

- [Full docs, API map, and examples](https://github.com/adam-drag/logistics-ts)
- [Other `logistics-ts` packages](https://github.com/adam-drag/logistics-ts#packages)

## License

[MIT](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)
