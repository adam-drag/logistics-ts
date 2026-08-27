# AGENTS.md

Guidance for AI agents and contributors working in the `logistics-ts` monorepo.
All six packages are published on npm at **0.2.0**. Done so far: M0 scaffold,
M1 core (data model, loaders, time bucketization, numerics, synthetic data),
M2 classification (ABC, XYZ, FSN, ABC-XYZ matrix, SBC demand pattern),
M3 forecasting (MA, SES, Holt ±damped, Holt-Winters add/mult, Croston/SBA/TSB,
seasonal decomposition, rolling-origin backtest, MASE-selected autoForecast,
accuracy metrics), M4 inventory (safety stock family + auto, reorder
point/order-up-to-level, EOQ/EPQ/quantity discounts, coverage, turnover, issue
analyser; umbrella `InventoryAnalyzer`), M5 agent surface & release (shipped
`skills/`, runnable `examples/`, `llms.txt`, consumer README, this API map),
M6 fill-rate / Type-2 service (`fillRate`, `safetyStockForFillRate`,
`serviceMetrics`), M7 `@logistics-ts/planning` with the six lot-sizing rules and
the Wagner-Whitin optimum, M8 `mrpGrid` single-item time-phased netting,
M9 multi-level MRP (`explode`, `planRequirements`), and M10 MRP ingest
(`loadBom`, `loadMasterSchedule`, `toMasterSchedule`) plus
`InventoryAnalyzer.plan()` and the `mrp-planning` skill.

Out of scope, deliberately: capacity planning (CRP), scheduling and routings;
multi-echelon inventory optimisation; stochastic lot-sizing; persistence and MRP
run-mode orchestration.

## What this project is

A modular TypeScript supply-chain intelligence toolkit. Pure, dependency-light
algorithm packages (safety stock, reorder point, EOQ, ABC/XYZ classification,
demand forecasting) that applications and other agents build MRP/ERP/WMS/
inventory features on top of.

Planning docs (`plans/`, `research.md`) are private and gitignored — they are not
in this repo. If a task needs a decision recorded only there, ask.

## API map — which function for which problem

Import from the umbrella (`import { core, forecasting, classification, inventory,
planning, InventoryAnalyzer } from 'logistics-ts'`) or the scoped packages directly. Every
domain function returns `Explained<T>` (`.value` + `.method` + `.inputs` +
`.reasoning` + optional `.citations`/`.warnings`).

| I want to… | Use | Package |
|---|---|---|
| Map CSV/DB rows onto canonical records | `loadDemand` / `loadStock` / `loadLeadTimes` / `loadBom` / `loadMasterSchedule` | core |
| Make a dense, zero-filled per-item series | `bucketize(demand, 'day'\|'week'\|'month')` | core |
| Generate a synthetic dataset for a demo | `generateExampleData({ items, periods, seed })` | core |
| Know if demand is smooth/erratic/intermittent/lumpy | `classifyDemandPattern(series)` | classification |
| Rank items by value (Pareto) | `abc(items, { by: 'value' })` | classification |
| Rank items by demand variability | `xyz(series)` | classification |
| Fast/slow/non-moving split | `fsn(series)` | classification |
| Value × variability policy matrix | `abcXyzMatrix(abc.value, xyz.value)` | classification |
| Forecast without picking a method | `autoForecast(series, { horizon })` | forecasting |
| Forecast with a specific method | `movingAverage`/`ses`/`holt`/`holtWinters`/`croston`/`sba`/`tsb` | forecasting |
| Score forecast accuracy | `mae`/`rmse`/`mape`/`smape`/`mase`/`bias` (prefer `mase`) | forecasting |
| Size a safety-stock buffer | `safetyStock(input, { method: 'auto', serviceLevel })` | inventory |
| Compute the reorder / order-up-to level | `reorderPoint` / `orderUpToLevel` | inventory |
| Compute an order quantity | `eoq` / `epq` / `eoqWithQuantityDiscounts` | inventory |
| Days of inventory / turnover | `coverage` / `turnover` | inventory |
| One "what needs attention" list | `issues(stock, demand, leadTimes, { serviceLevel })` | inventory |
| Hit a target fill rate (Type-2 service, β) | `fillRate` / `safetyStockForFillRate` / `serviceMetrics` | inventory |
| Size lots over a demand vector | `lotSize(demand, { rule })` — or a rule directly (`wagnerWhitin` is the optimum) | planning |
| Net demand against stock and open orders | `mrpGrid({ grossRequirements, onHand, scheduledReceipts, leadTimePeriods })` | planning |
| Explode a BOM into dependent gross requirements | `explode(bom, demand)` | planning |
| Turn a dated MPS into aligned period series | `toMasterSchedule(records, 'week', { start })` | planning |
| Run a full multi-level MRP from an MPS + BOM | `planRequirements({ bom, masterSchedule, items, periods })` | planning |
| Run an MRP using stock/lead times you already hold | `analyzer.plan({ bom, masterSchedule, granularity })` | logistics-ts |
| Run several analyses over one held dataset | `new InventoryAnalyzer({ demand, stock, leadTimes })` | logistics-ts |

For end-to-end recipes see the shipped skills in
[`packages/logistics-ts/skills/`](packages/logistics-ts/skills/) and the runnable
[`examples/`](examples/).

## Gotchas (the same list agents consuming the library get)

- **Zero-fill is mandatory** for forecasting/classification — feed `bucketize`
  output, not a compacted nonzero-only list; ADI/CV² and the ES recursions are
  wrong otherwise.
- **Unit agreement.** `meanDemand` and `meanLeadTime` must share a period unit.
  `LeadTimeRecord.leadTimeDays` is always in days; when demand is bucketed by
  week/month, convert lead time before calling `safetyStock`/`reorderPoint`
  directly. `issues`/`InventoryAnalyzer` do this conversion for you.
- **`coverage`/`turnover` output is always calendar days**, independent of the
  input `granularity`; the field name means what it says.
- **Cycle service level ≠ fill rate.** `serviceLevel` (in `(0, 1)`) controls the
  per-cycle no-stockout probability, not the fraction of demand filled.
- **MAPE is undefined at zero demand** — use `mase` for intermittent series;
  `autoForecast` already selects by MASE.
- **Sample vs population std.** `standardDeviation`/`variance` default to sample
  (n−1); pass `population: true` for the biased form.
- **Everything is pure.** No stored state, no mutation; `InventoryAnalyzer` is a
  thin façade, not a store.

## Repository map

```
packages/
  core/            @logistics-ts/core           — model, loaders, bucketize, numerics, synthetic, Explained<>
  forecasting/     @logistics-ts/forecasting    — MA/SES/Holt/HW, Croston/SBA/TSB, decompose, backtest, autoForecast, metrics
  classification/  @logistics-ts/classification — ABC/XYZ/FSN/matrix/SBC demand pattern
  inventory/       @logistics-ts/inventory      — safety stock, ROP, EOQ, fill rate, coverage, turnover, issues
  planning/        @logistics-ts/planning       — lot-sizing family (L4L/FOQ/POQ/Silver-Meal/LUC/Wagner-Whitin) + mrpGrid
  logistics-ts/    logistics-ts                 — umbrella re-export + InventoryAnalyzer; ships skills/
    skills/        forecast-and-replenish, inventory-analysis — agent skills in the published tarball
examples/          runnable end-to-end scripts (tsx) driven by generateExampleData()
llms.txt           agent entry point (llmstxt.org): API map + doc links

plans/, concept.md and research.md are PRIVATE and gitignored — not in the repo.
```

## Dependency direction (enforced by `pnpm deps:check`)

Layers, most stable first — a package may import only from **lower** layers:

```
0  core            zero runtime dependencies
1  classification  -> core
2  forecasting     -> core, classification          (autoForecast routes via SBC)
3  inventory       -> core, classification, forecasting
3.5 planning       -> core, inventory                (may import classification/forecasting; declares neither)
4  logistics-ts    -> all of the above (umbrella)
```

`core` must stay a leaf with **zero runtime dependencies**. Never introduce a
cycle or import "upward" a layer (e.g. classification must not import
forecasting or inventory). A package declares a lower-layer dependency in its
`package.json` when it first imports from it. The rules live in
[`.dependency-cruiser.cjs`](.dependency-cruiser.cjs).

## Conventions

- **ESM-only**, TypeScript strict. No `any`; prefer precise types.
- **Every domain result is wrapped in `Explained<T>`** (from `@logistics-ts/core`):
  value + `method` + `inputs` + `reasoning[]` + optional `citations`/`warnings`.
  This is the core differentiator — a *decision-support output* (safety stock, a
  forecast, a classification) must never be returned as a bare number. This does
  **not** apply to low-level numeric primitives (`mean`, `variance`,
  `inverseNormalCdf`, …): those are raw building blocks, exported for power users,
  and intentionally return plain numbers.
- **Pure, tree-shakeable functions.** Stateful convenience wrappers (e.g. an
  `InventoryAnalyzer` class) live only in the umbrella package and wrap the pure
  functions; they never hold the source of truth.
- **TSDoc on every export**: formula, units, parameter constraints, a literature
  citation where one exists, and an `@example`. Agents read these directly.
- Cross-package imports resolve to **source** in dev via the `exports`→`src`
  pattern; `publishConfig.exports` swaps to `dist` at publish time. Do not add
  `tsconfig` `paths` for this — it breaks the dts build.
- **`core` stays zero-runtime-dependency.** A numeric primitive that is simple
  and verifiable is hand-rolled and pinned with golden tests against authoritative
  values (e.g. `inverseNormalCdf` is tested at 15 z-table points across both
  tails). Reach for a dependency only when the maths is genuinely tricky *and* a
  trusted library is also **accurate** — verify accuracy first (`simple-statistics`'
  `probit`, for instance, is off by ~0.003 and was rejected on those grounds).

## Local workflow

```bash
pnpm install
pnpm check        # lint + typecheck + build + test + deps:check (what CI runs)
```

Run `pnpm check` before opening a PR. CI runs the same on Node 20/22/24.

## Tooling

- Build: **tsup** (esbuild + dts), one config per package, siblings kept external.
- Test: **vitest** (`packages/*/src/**/*.test.ts`).
- Lint/format: **biome**.
- Versioning/publish: **changesets** (packages fixed-versioned together in 0.x).
  `pnpm changeset` on any consumer-visible PR. On push to `main`,
  `.github/workflows/release.yml` opens/updates a "Version Packages" PR via
  `changesets/action`; merging that PR runs `pnpm release` (build + `changeset
  publish`) and publishes to npm using the `NPM_TOKEN` repo secret. No manual
  `npm publish` needed.
- Examples: **tsx** (`pnpm examples`, or `pnpm example:quickstart` etc.); the
  `examples/` workspace typechecks as part of `pnpm check`.
