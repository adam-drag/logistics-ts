---
name: inventory-analysis
description: Analyse an inventory catalogue with logistics-ts — classify SKUs by value and variability (ABC-XYZ), measure stock coverage and turnover, and flag issues (below reorder point, overstocked, dead stock). Use when building inventory dashboards, stock-health reports, or MRP/ERP review screens.
---

# Inventory analysis with logistics-ts

`logistics-ts` is a dependency-light TypeScript supply-chain toolkit. Every result
is **explainable** — a value plus the `method`, `inputs`, `reasoning`, and
`citations` behind it (`Explained<T>`).

Install: `npm i logistics-ts` (or scoped: `@logistics-ts/core`,
`@logistics-ts/classification`, `@logistics-ts/inventory`).

This skill covers classifying and health-checking a catalogue. Two ways to drive
it: the **`InventoryAnalyzer`** convenience wrapper (holds one dataset, best for a
dashboard) or the **pure functions** (tree-shakeable, best for a pipeline).

## The data

Three record types from `@logistics-ts/core` (see the `forecast-and-replenish`
skill for loading/mapping): `DemandRecord`, `StockRecord`, `LeadTimeRecord`. To
try it with no data, use `core.generateExampleData({ items, periods, seed })`.

## Option A — `InventoryAnalyzer` (dashboard style)

```ts
import { InventoryAnalyzer } from 'logistics-ts'

const analyzer = new InventoryAnalyzer({ demand, stock, leadTimes })

const matrix   = analyzer.abcXyz({ granularity: 'month' })      // policy matrix
const coverage = analyzer.coverage({ granularity: 'month' })    // days of inventory
const turnover = analyzer.turnover({ granularity: 'month' })    // turns + DIO
const issues   = analyzer.issues({ serviceLevel: 0.95, granularity: 'month' })
```

The wrapper holds no source of truth — each method returns the underlying pure
function's own `Explained` result unchanged, and does the day↔period unit
conversion for lead times internally.

## Option B — pure functions (pipeline style)

```ts
import { core, classification, inventory } from 'logistics-ts'

const series = core.bucketize(demand, 'month')

// ABC needs per-item { itemId, volume, unitValue? } — aggregate it from demand
// (this is exactly what InventoryAnalyzer.abcXyz does internally).
const volumeByItem = new Map<string, number>()
const unitValueByItem = new Map<string, number>()
for (const record of demand) {
  volumeByItem.set(record.itemId, (volumeByItem.get(record.itemId) ?? 0) + record.quantity)
  if (record.unitPrice !== undefined) unitValueByItem.set(record.itemId, record.unitPrice)
}
const items = [...volumeByItem.entries()].map(([itemId, volume]) => {
  const unitValue = unitValueByItem.get(itemId)
  return unitValue !== undefined ? { itemId, volume, unitValue } : { itemId, volume }
})

const abc = classification.abc(items, { by: 'value' })
const xyz = classification.xyz(series)
const matrix = classification.abcXyzMatrix(abc.value, xyz.value)

const coverage = inventory.coverage(stock, demand, { granularity: 'month' })
const turnover = inventory.turnover(stock, demand, { granularity: 'month' })
const issues   = inventory.issues(stock, demand, leadTimes, { serviceLevel: 0.95, granularity: 'month' })
```

## What each output tells you

- **`abcXyzMatrix`** — one `AbcXyzCell` per item with `class` (`AX`…`CZ`) and a
  `policyHint`. ABC = value axis (the vital few), XYZ = demand-variability axis.
  `AX` items (high value, stable) warrant tight control and low safety stock; `CZ`
  (low value, erratic) → make-to-order. Drive stocking policy off the cell.
- **`coverage`** — `daysOfInventory` per item, in **calendar days** regardless of
  the bucketing `granularity`. `Infinity`/large = slow-moving or dead.
- **`turnover`** — `turnoverRatio` (annual turns) and `daysInventoryOutstanding`
  (calendar days). Low turns tie up cash.
- **`issues`** — per-item `flags`: `below-rop`, `below-safety-stock`,
  `stockout-risk-within-leadtime`, `overstocked`, `dead-stock`. This is the
  "what needs action today" list; sort/group by flag for a review screen.

## Building a stock-health screen

1. `issues(...)` → the action list (reorder / investigate overstock / write off).
2. `abcXyz(...)` → segment the action list by policy class so A-items surface first.
3. `coverage(...)` / `turnover(...)` → the supporting metrics per row.

Every returned object carries `.reasoning` and `.citations` — surface them in a
tooltip/detail pane so users (and agents) can see why an item was flagged.

## Gotchas

- **`granularity` must be consistent** across `abcXyz`/`coverage`/`turnover`/
  `issues` for one view — it sets the demand period. Coverage/turnover always
  report **days** in the output, but the input bucketing must match how you reason
  about demand.
- **`dead-stock`** requires stock on hand **and** no demand at all (FSN class N) —
  an item that simply sells slowly is `overstocked`, not dead.
- **Explanations are the product.** Don't discard `.reasoning`/`.citations`; they
  are why this library exists.

## Runnable reference

See `examples/inventory-analysis.ts` in the repo (`pnpm example:inventory-analysis`).
