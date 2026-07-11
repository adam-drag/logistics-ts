# CLAUDE.md — logistics-ts

Operational guide for Claude Code working in this repo. For the full contributor
reference (repository map, milestone log, conventions rationale) read
[`AGENTS.md`](AGENTS.md); for scope and design decisions read
[`plans/v0.1.md`](plans/v0.1.md) and [`research.md`](research.md). This file is the
short version: what to load, the rules you must not break, and how to ship a change.

## What this is

A modular, **dependency-light TypeScript supply-chain toolkit**: pure algorithm
packages (safety stock, reorder point, EOQ, ABC/XYZ classification, demand
forecasting) that other apps build MRP/ERP/WMS features on. The differentiator is
that **every decision-support result is explainable** — a value plus the method,
inputs, reasoning, and citations behind it — because the primary consumers are both
humans and AI agents reading the types and TSDoc directly.

pnpm monorepo. ESM-only, TypeScript strict. Status: M0 scaffold, M1 core, M2
classification done. **Next: M3 forecasting, M4 inventory** (both are stubs today).

## Session start

Invoke the `/self-improve` skill at the start of every session. It loads the
accumulated list of reviewer-caught anti-patterns into context so past mistakes are
never repeated, whatever the session's task.

## Packages & layering

```
core            @logistics-ts/core            model, loaders, bucketize, numerics, synthetic, Explained<>
classification  @logistics-ts/classification  ABC/XYZ/FSN/matrix/SBC          -> core
forecasting     @logistics-ts/forecasting      MA/SES/Holt/HW/Croston/SBA/TSB/auto  -> core, classification  (M3 stub)
inventory       @logistics-ts/inventory        safety stock/ROP/EOQ/coverage/issues -> core, classification, forecasting  (M4 stub)
logistics-ts    logistics-ts                  umbrella re-export + InventoryAnalyzer + ships skills/
```

A package imports only from **lower** layers — never sideways or up. `core` stays a
**zero-runtime-dependency leaf**. Adding a lower-layer import means adding it to that
package's `package.json` `dependencies` (`workspace:*`). Enforced by
`pnpm deps:check` ([`.dependency-cruiser.cjs`](.dependency-cruiser.cjs)).

## Non-negotiable invariants

1. **Every domain result returns `Explained<T>`** (via `explain()` from core) — value
   + `method` + `inputs` + `reasoning[]` + optional `citations`/`warnings`. Never
   return a bare number from a safety-stock / forecast / classification function.
   Exception: low-level numeric primitives (`mean`, `variance`, `inverseNormalCdf`, …)
   return plain numbers — they are raw building blocks.
2. **`core` has zero runtime dependencies.** A numeric primitive that is simple and
   verifiable is hand-rolled and pinned with **golden tests** against authoritative
   values. Reach for a dependency only when the maths is genuinely tricky *and* a
   trusted library is also **accurate** — verify accuracy first (`simple-statistics`'
   `probit` was rejected for being off by ~0.003). See the `verify-numerics` skill.
3. **Pure, tree-shakeable functions.** Stateful wrappers (`InventoryAnalyzer`) live
   only in the umbrella package and wrap the pure functions; they hold no state of record.
4. **TSDoc on every export**: formula, units, parameter constraints, a literature
   citation where one exists, and an `@example`. Agents read these directly — this is
   a product feature, not decoration.
5. **No `any`** (biome errors on it). Prefer precise types; `noUncheckedIndexedAccess`
   and `exactOptionalPropertyTypes` are on — respect them.
6. Dates are **calendar dates, never instants**: epoch-day integers internally, ISO
   strings at the boundary. No date library.
7. Cross-package imports resolve to **source** in dev via `exports`→`src`;
   `publishConfig.exports` swaps to `dist` at publish. Do **not** add tsconfig `paths` —
   it breaks the dts build.

## Workflow

```bash
pnpm install
pnpm check        # lint + typecheck + build + test + deps:check — exactly what CI runs
pnpm test:watch   # vitest watch while developing
pnpm lint:fix     # biome autofix
```

Run `pnpm check` before opening a PR. CI runs it on Node 20/22/24. Add a
**changeset** (`pnpm changeset`) for any consumer-visible change — all packages are
fixed-versioned together in 0.x.

## Conventions to match

- Test files sit beside source as `*.test.ts` (vitest, `describe`/`it`). Tests that
  encode a reference value name their source in a comment (z-table point, textbook
  example, statsforecast fixture).
- biome formatting: 2-space indent, single quotes, no semicolons, trailing commas,
  100-col width. Let `pnpm lint:fix` handle it — don't hand-format.
- One `tsup.config.ts` per package; siblings kept `external` (never bundled).
- Import the result wrapper as `import { type Explained, explain } from '@logistics-ts/core'`.

## Skills (invoke with `/`)

| Skill | Use when |
|-------|----------|
| `/self-improve` | At session start; when PR/review/Copilot feedback is presented; after deep work in an under-documented area |
| `/implement-algorithm` | Adding or changing an algorithm export in any package (the M3/M4 core task) |
| `/verify-numerics` | Writing golden/textbook/property tests, or deciding hand-roll vs. dependency for maths |

## When PR or review feedback is presented

Whenever the user shares PR comments, Copilot findings, or reviewer feedback, invoke
`/self-improve` immediately. It assesses validity, fixes with a red-green test for
numeric/behavioral bugs, does root-cause analysis, and self-patches the skill or docs
so the same class of mistake can't recur — don't silently fix comments without
capturing the root cause.

## Anti-patterns

1. Never return a bare number from a domain function — wrap it in `Explained<T>`.
2. Never add a runtime dependency to `core`, or import "up"/sideways a layer.
3. Never invent a citation, a MathJS-style unit, or a formula you can't cite — say so and stop.
4. Never add `tsconfig` `paths` for cross-package resolution (breaks dts).
5. Never trust a maths library's accuracy without a golden check against authoritative values.
6. Never skip the `@example` / formula / citation TSDoc on an export — agents depend on it.
7. Never hand-format to fight biome; run `pnpm lint:fix`.
