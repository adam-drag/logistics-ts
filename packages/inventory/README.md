# @logistics-ts/inventory

[![npm version](https://img.shields.io/npm/v/@logistics-ts/inventory.svg)](https://www.npmjs.com/package/@logistics-ts/inventory)
[![license](https://img.shields.io/npm/l/@logistics-ts/inventory.svg)](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)

Inventory decision-support for [`logistics-ts`](https://www.npmjs.com/package/logistics-ts):
safety stock, reorder point / order-up-to level, EOQ/EPQ (with quantity
discounts), coverage, turnover, and a catalogue-wide issue analyser. Every
result returns `Explained<T>`.

## Install

```bash
npm i @logistics-ts/inventory
```

## What's in it

- **`safetyStock`** — the safety-stock buffer for a target cycle service
  level; `method: 'auto'` picks the right formula for whatever variability
  data you supply (demand only, lead time only, or both — King's combined
  formula).
- **`reorderPoint`** / **`orderUpToLevel`** — the reorder trigger, or the
  order-up-to level for periodic review.
- **`eoq`** / **`epq`** / **`eoqWithQuantityDiscounts`** — order-quantity
  sizing (classic EOQ, finite production rate, price breaks).
- **`coverage`** / **`turnover`** — days of inventory on hand / annual turns,
  always reported in calendar days regardless of demand-bucketing granularity.
- **`issues`** — one call that flags every item needing attention across a
  catalogue: `below-rop`, `below-safety-stock`,
  `stockout-risk-within-leadtime`, `overstocked`, `dead-stock`.

## Quick start

```ts
import { generateExampleData, mean, standardDeviation } from '@logistics-ts/core'
import { reorderPoint, safetyStock } from '@logistics-ts/inventory'

const { demand, leadTimes } = generateExampleData({ items: 1, periods: 24, seed: 4 })
const itemId = demand[0]!.itemId
const quantities = demand.filter((d) => d.itemId === itemId).map((d) => d.quantity)
const itemLeadTimes = leadTimes.filter((l) => l.itemId === itemId).map((l) => l.leadTimeDays)

const ss = safetyStock(
  {
    meanDemand: mean(quantities),
    meanLeadTime: mean(itemLeadTimes),
    demandStdDev: standardDeviation(quantities),
  },
  { method: 'auto', serviceLevel: 0.95 },
)

const rop = reorderPoint({
  meanDemand: mean(quantities),
  meanLeadTime: mean(itemLeadTimes),
  safetyStock: ss.value,
})

console.log(ss.value, ss.method, ss.reasoning)
console.log(rop.value) // reorder when on-hand stock drops to this level
```

`meanDemand` and `meanLeadTime` must share a period unit — `LeadTimeRecord`
is always in days, so convert it before combining with weekly/monthly demand
(the `issues` function below does this for you).

For the whole "flag everything that needs reordering" flow in one call:

```ts
import { issues } from '@logistics-ts/inventory'

const problems = issues(stock, demand, leadTimes, { serviceLevel: 0.95, granularity: 'month' })
```

## In the umbrella package

`@logistics-ts/inventory` is re-exported as the `inventory` namespace from
[`logistics-ts`](https://www.npmjs.com/package/logistics-ts), which also adds
a stateful `InventoryAnalyzer` convenience wrapper over this package's pure
functions. `@logistics-ts/inventory` depends on `@logistics-ts/core`,
`@logistics-ts/classification`, and `@logistics-ts/forecasting`.

## Links

- [Full docs, API map, and examples](https://github.com/adam-drag/logistics-ts)
- [Other `logistics-ts` packages](https://github.com/adam-drag/logistics-ts#packages)

## License

[MIT](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)
