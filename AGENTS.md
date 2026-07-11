# AGENTS.md

Guidance for AI agents and contributors working in the `logistics-ts` monorepo.
This file grows with each milestone. Done so far: M0 scaffold, M1 core (data
model, loaders, time bucketization, numerics, synthetic data), M2 classification
(ABC, XYZ, FSN, ABC-XYZ matrix, SBC demand pattern).

## What this project is

A modular TypeScript supply-chain intelligence toolkit. Pure, dependency-light
algorithm packages (safety stock, reorder point, EOQ, ABC/XYZ classification,
demand forecasting) that applications and other agents build MRP/ERP/WMS/
inventory features on top of. Roadmap: [`plans/v0.1.md`](plans/v0.1.md).

## Repository map

```
packages/
  core/            @logistics-ts/core           — model, loaders, bucketize, numerics, synthetic, Explained<>
  forecasting/     @logistics-ts/forecasting    — forecasting methods + metrics (stub → M3)
  classification/  @logistics-ts/classification — ABC/XYZ/FSN/matrix/SBC demand pattern
  inventory/       @logistics-ts/inventory      — safety stock, ROP, EOQ, coverage, issues (stub → M4)
  logistics-ts/    logistics-ts                 — umbrella re-export (published entry point)
plans/             milestone plans
concept.md         original product concept
research.md        competitive / feasibility / algorithm research
```

## Dependency direction (enforced by `pnpm deps:check`)

Layers, most stable first — a package may import only from **lower** layers:

```
0  core            zero runtime dependencies
1  classification  -> core
2  forecasting     -> core, classification          (autoForecast routes via SBC)
3  inventory       -> core, classification, forecasting
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
