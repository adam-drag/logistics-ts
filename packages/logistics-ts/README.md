# logistics-ts

[![npm version](https://img.shields.io/npm/v/logistics-ts.svg)](https://www.npmjs.com/package/logistics-ts)
[![license](https://img.shields.io/npm/l/logistics-ts.svg)](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)

> Explainable supply-chain algorithms for TypeScript: safety stock, reorder
> point, EOQ, ABC/XYZ classification, and demand forecasting (including
> intermittent-demand Croston/SBA/TSB) — dependency-light, and built for both
> humans and AI agents to read and trust.

> [!WARNING]
> **Under active development — pre-1.0.** The public API is not yet stable.

## Why

Every team building an MRP/ERP/inventory app re-implements the same
supply-chain mathematics — safety stock, reorder points, EOQ, demand
classification, intermittent-demand forecasting. `logistics-ts` provides those
algorithms as small, well-typed, dependency-free packages so you can stop
maintaining them yourself.

Every result is **explainable**: instead of a bare number, functions return
the value alongside the method used, the inputs, and the reasoning:

```ts
{ value: 42, method: 'king-combined', inputs: {...}, reasoning: [...], citations: [...] }
```

That's true for both humans auditing a number and AI agents building on top of
the library.

## Install

```bash
npm i logistics-ts
```

This umbrella package re-exports everything under namespaces. Prefer the
scoped packages — [`@logistics-ts/core`](https://www.npmjs.com/package/@logistics-ts/core),
[`@logistics-ts/classification`](https://www.npmjs.com/package/@logistics-ts/classification),
[`@logistics-ts/forecasting`](https://www.npmjs.com/package/@logistics-ts/forecasting),
[`@logistics-ts/inventory`](https://www.npmjs.com/package/@logistics-ts/inventory) —
when you want the smallest install and best tree-shaking. ESM-only; requires
Node ≥ 20 (also runs in the browser, edge, and Lambda).

## Quick start

```ts
import { core, forecasting, inventory } from 'logistics-ts'

// No data yet? Generate a reproducible synthetic catalogue.
const { demand, leadTimes } = core.generateExampleData({ items: 5, seed: 42 })

// Dense, zero-filled monthly series for one item.
const series = core.bucketize(demand, 'month')[0]
const quantities = series.buckets.map((b) => b.quantity)

// Forecast next month — autoForecast classifies the demand pattern,
// backtests candidate methods, and picks the best by MASE.
const f = forecasting.autoForecast(quantities, { horizon: 1 })
console.log(f.value.forecast[0], f.method, f.reasoning)

// Size a safety stock (95% cycle service level) — 'auto' uses whatever
// variability data you supply (here demand only).
const ss = inventory.safetyStock(
  { meanDemand: core.mean(quantities), meanLeadTime: 1, demandStdDev: core.standardDeviation(quantities) },
  { method: 'auto', serviceLevel: 0.95 },
)
console.log(ss.value, ss.reasoning, ss.citations)
```

Every returned object is an `Explained<T>`: `{ value, method, inputs,
reasoning, citations?, warnings? }`. Read `.value` for the number; read the
rest to explain, audit, or debug it.

For the whole "flag everything that needs reordering across a catalogue" flow
in one call, see [`inventory.issues`](https://github.com/adam-drag/logistics-ts/tree/main/packages/inventory)
and the runnable [`examples/`](https://github.com/adam-drag/logistics-ts/tree/main/examples)
in the repo.

## For AI agents

This library is built to be consumed by coding agents. Beyond the rich TSDoc
on every export:

- **[`llms.txt`](https://github.com/adam-drag/logistics-ts/blob/main/llms.txt)** —
  the entry point: what the library is, the API map, and links to everything below.
- **[`AGENTS.md`](https://github.com/adam-drag/logistics-ts/blob/main/AGENTS.md)** —
  a "which function for which problem" decision table and the full gotchas list.
- **Shipped skills** (in this package's `skills/` directory, included in the
  npm tarball) — [`forecast-and-replenish`](https://github.com/adam-drag/logistics-ts/blob/main/packages/logistics-ts/skills/forecast-and-replenish/SKILL.md)
  and [`inventory-analysis`](https://github.com/adam-drag/logistics-ts/blob/main/packages/logistics-ts/skills/inventory-analysis/SKILL.md)
  are end-to-end recipes.
- **[`examples/`](https://github.com/adam-drag/logistics-ts/tree/main/examples)** —
  three runnable scripts in the repo.

## Packages

| Package | Responsibility |
|---------|----------------|
| [`@logistics-ts/core`](https://www.npmjs.com/package/@logistics-ts/core) | Types, column store, data loading, shared numerics, the `Explained` result wrapper |
| [`@logistics-ts/forecasting`](https://www.npmjs.com/package/@logistics-ts/forecasting) | Moving average, exponential smoothing, Croston/SBA/TSB, auto method selection |
| [`@logistics-ts/classification`](https://www.npmjs.com/package/@logistics-ts/classification) | ABC, XYZ, FSN, ABC-XYZ matrix, demand-pattern (SBC) classification |
| [`@logistics-ts/inventory`](https://www.npmjs.com/package/@logistics-ts/inventory) | Safety stock, reorder point, EOQ/EPQ, coverage, turnover, issue analysis |
| `logistics-ts` (this package) | Umbrella package: re-exports everything under namespaces, adds `InventoryAnalyzer`, ships agent skills |

Dependency direction is enforced in CI as a strict layered order — each
package may import only from lower layers:

```
core  →  classification  →  forecasting  →  inventory  →  logistics-ts
```

`core` has zero runtime dependencies; `forecasting`'s auto method selection
routes through `classification` (SBC demand patterns); `inventory`'s auto
safety stock builds on both.

## Links

- [Repository](https://github.com/adam-drag/logistics-ts)
- [Issues](https://github.com/adam-drag/logistics-ts/issues)
- [Contributor guide (`AGENTS.md`)](https://github.com/adam-drag/logistics-ts/blob/main/AGENTS.md)

## License

[MIT](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)
