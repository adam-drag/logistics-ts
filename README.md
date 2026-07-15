# logistics-ts

> A modular TypeScript supply-chain intelligence toolkit — forecasting, safety
> stock, ABC/XYZ classification, and replenishment primitives for building MRP,
> ERP, WMS, and inventory applications. Dependency-light and AI-agent-friendly.

> [!WARNING]
> **Under active development — pre-1.0.** The public API is not yet stable.

## Why

Every company building an MRP/ERP/inventory app re-implements the same
supply-chain mathematics — safety stock, reorder points, EOQ, demand
classification, intermittent-demand forecasting. `logistics-ts` provides those
algorithms as small, well-typed, explainable, dependency-free packages so you
can stop maintaining them yourself.

Every result is **explainable**: instead of a bare number, functions return the
value alongside the method used, the inputs, and the reasoning — for humans and
for AI agents building on top of the library.

## Install

```bash
npm i logistics-ts
```

The umbrella package re-exports everything under namespaces. Prefer the scoped
packages (`@logistics-ts/core`, `@logistics-ts/classification`,
`@logistics-ts/forecasting`, `@logistics-ts/inventory`) when you want the smallest
install and best tree-shaking. ESM-only; requires Node ≥ 20 (also runs in the
browser, edge, and Lambda).

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

Every returned object is an `Explained<T>`: `{ value, method, inputs, reasoning,
citations?, warnings? }`. Read `.value` for the number; read the rest to explain,
audit, or debug it.

For the whole "flag everything that needs reordering across a catalogue" flow in
one call, see [`inventory.issues`](packages/inventory) and the runnable
[`examples/`](examples/).

## For AI agents

This library is built to be consumed by coding agents. Beyond the rich TSDoc on
every export:

- **[`llms.txt`](llms.txt)** — the entry point: what the library is, the API map,
  and links to everything below.
- **[`AGENTS.md`](AGENTS.md)** — a "which function for which problem" decision
  table and the full gotchas list.
- **Shipped skills** — [`forecast-and-replenish`](packages/logistics-ts/skills/forecast-and-replenish/SKILL.md)
  and [`inventory-analysis`](packages/logistics-ts/skills/inventory-analysis/SKILL.md)
  are end-to-end recipes included in the published npm tarball.
- **[`examples/`](examples/)** — three runnable scripts (`pnpm example:quickstart`,
  `pnpm example:forecast-replenish`, `pnpm example:inventory-analysis`).

## Packages

| Package | Responsibility |
|---------|----------------|
| [`@logistics-ts/core`](packages/core) | Types, column store, data loading, shared numerics, the `Explained` result wrapper |
| [`@logistics-ts/forecasting`](packages/forecasting) | Moving average, exponential smoothing, Croston/SBA/TSB, auto method selection |
| [`@logistics-ts/classification`](packages/classification) | ABC, XYZ, FSN, ABC-XYZ matrix, demand-pattern (SBC) classification |
| [`@logistics-ts/inventory`](packages/inventory) | Safety stock, reorder point, EOQ/EPQ, coverage, turnover, issue analysis |
| [`logistics-ts`](packages/logistics-ts) | Umbrella package: re-exports everything under namespaces, adds `InventoryAnalyzer`, ships agent skills |

Dependency direction is enforced in CI as a strict layered order — each package
may import only from lower layers:

```
core  →  classification  →  forecasting  →  inventory  →  logistics-ts
```

`core` has zero runtime dependencies; `forecasting`'s auto method selection
routes through `classification` (SBC demand patterns); `inventory`'s auto safety
stock builds on both.

## Development

Requires Node ≥ 20 and pnpm.

```bash
pnpm install
pnpm build        # build every package (tsup)
pnpm test         # run the vitest suite
pnpm typecheck    # tsc --noEmit per package
pnpm lint         # biome
pnpm deps:check   # enforce dependency direction (dependency-cruiser)
pnpm check        # all of the above
```

See [`AGENTS.md`](AGENTS.md) for the repository map and conventions.

## License

[MIT](LICENSE)
