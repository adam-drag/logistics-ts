---
name: forecast-and-replenish
description: Build a demand-forecasting and replenishment flow with logistics-ts — turn raw sales/demand history into per-item forecasts, safety stock, reorder points, and a prioritised list of items to reorder. Use when building MRP/ERP/inventory features that answer "how much will we sell, and when do we reorder?".
---

# Forecast and replenish with logistics-ts

`logistics-ts` is a dependency-light TypeScript supply-chain toolkit. Every result
is **explainable**: a value plus the `method`, `inputs`, `reasoning`, and
`citations` behind it (the `Explained<T>` shape) — so both humans and agents can
audit any number the library produces.

Install: `npm i logistics-ts` (or the scoped packages `@logistics-ts/core`,
`@logistics-ts/forecasting`, `@logistics-ts/inventory` for smaller installs).

This skill covers the end-to-end replenishment flow:

```
raw records → load → bucketize → classify demand → autoForecast
            → safety stock → reorder point → issue flags
```

## 1. Get your data into the canonical record shapes

Everything speaks three record types from `@logistics-ts/core`:

```ts
type DemandRecord   = { itemId: string; date: string | Date; quantity: number; unitPrice?: number; locationId?: string }
type StockRecord    = { itemId: string; quantity: number; unitCost?: number; locationId?: string; timestamp?: string | Date }
type LeadTimeRecord = { itemId: string; leadTimeDays: number; date?: string | Date }
```

Map arbitrary rows (CSV, DB) onto them with the loaders, which collect actionable
issues instead of throwing:

```ts
import { core } from 'logistics-ts'
const { records, issues } = core.loadDemand(rows, {
  itemId: 'sku', date: 'txn_date', quantity: 'qty', // your column → canonical field
})
if (issues.length) console.warn('load issues:', issues)
```

No data yet? `core.generateExampleData({ items, periods, profile, seed })` returns a
reproducible `{ demand, stock, leadTimes }` catalogue — ideal for a demo.

## 2. Bucketize demand into a dense, zero-filled series

Forecasting and demand classification need one value per period **including the
zero periods** (this is essential for intermittent-demand statistics):

```ts
const series = core.bucketize(demand, 'month') // or 'day' | 'week'
// series: { itemId, granularity, buckets: { period, quantity }[] }[]
const quantities = series[0].buckets.map((b) => b.quantity)
```

## 3. Classify the demand pattern (optional but informative)

```ts
import { classification } from 'logistics-ts'
const pattern = classification.classifyDemandPattern(quantities).value.pattern
// 'smooth' | 'erratic' | 'intermittent' | 'lumpy'  (Syntetos–Boylan–Croston)
```

## 4. Forecast — let `autoForecast` choose the method

`autoForecast` classifies the series, backtests the candidate methods suited to
that quadrant (SES/Holt/Holt-Winters for smooth/erratic; Croston/SBA/TSB for
intermittent/lumpy), and returns the lowest-MASE one. You don't pick the method.

```ts
import { forecasting } from 'logistics-ts'
const f = forecasting.autoForecast(quantities, { horizon: 3 })
f.value.forecast // number[] — next 3 periods
f.method         // e.g. 'auto-sba' — the winning method
f.reasoning      // why it was chosen (pattern, candidates, MASE scores)
```

## 5. Size safety stock and the reorder point

Pick the safety-stock formula with `method: 'auto'` — it uses whatever variability
data you have (both σ's → King's combined formula; one → the matching
single-source formula). **Units must agree**: lead time is recorded in *days*, so
if you bucketed demand by month, convert lead time to months before combining.

```ts
import { inventory, core } from 'logistics-ts'
const { mean, standardDeviation } = core
const DAYS_PER_MONTH = 365 / 12
const lt = leadTimes.filter((l) => l.itemId === itemId).map((l) => l.leadTimeDays / DAYS_PER_MONTH)

const ss = inventory.safetyStock(
  {
    meanDemand: mean(quantities),
    meanLeadTime: mean(lt),
    demandStdDev: standardDeviation(quantities),
    leadTimeStdDev: standardDeviation(lt),
    series: quantities, // lets 'auto' warn if the pattern is intermittent/lumpy
  },
  { method: 'auto', serviceLevel: 0.95 }, // cycle service level, in (0, 1)
)

const rop = inventory.reorderPoint({
  meanDemand: mean(quantities),
  meanLeadTime: mean(lt),
  safetyStock: ss.value,
})
// Reorder when on-hand stock ≤ rop.value.
```

For order sizing use `inventory.eoq({ annualDemand, orderCost, holdingCostPerUnit })`
(plus `epq` for finite production rate and `eoqWithQuantityDiscounts` for price
breaks).

## 6. One call for "what needs attention": `issues`

Rather than wiring the above per item, `inventory.issues` composes safety stock,
reorder point, coverage, and FSN into per-item flags across the whole catalogue:

```ts
const problems = inventory.issues(stock, demand, leadTimes, {
  serviceLevel: 0.95,
  granularity: 'month', // MUST match how you think about demand periods
})
for (const item of problems.value.filter((i) => i.flags.length)) {
  console.log(item.itemId, item.flags) // 'below-rop' | 'below-safety-stock' |
}                                       // 'stockout-risk-within-leadtime' |
                                        // 'overstocked' | 'dead-stock'
```

## Gotchas

- **Zero-fill matters.** Always feed `bucketize` output (dense, zero-filled) to
  forecasting/classification — not a compacted list of nonzero sales.
- **Unit agreement.** `meanDemand` and `meanLeadTime` must share a period unit.
  `issues`/`InventoryAnalyzer` handle the day↔period conversion for you; when you
  call `safetyStock`/`reorderPoint` directly, convert lead-time days yourself.
- **Cycle service level ≠ fill rate.** `serviceLevel` controls the probability a
  cycle doesn't stock out, not the fraction of demand filled. It must be in `(0, 1)`.
- **Prefer MASE over MAPE.** For intermittent demand MAPE is undefined at zeros;
  `autoForecast` already selects by MASE. If you compute metrics yourself, use
  `forecasting.mase`.
- **Mutations are not a thing.** All functions are pure; there is no stored state.

## Runnable reference

See `examples/forecast-and-replenish.ts` in the repo for this exact flow end to end
(`pnpm example:forecast-replenish`).
