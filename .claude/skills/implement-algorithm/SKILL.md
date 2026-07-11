---
description: The end-to-end recipe for adding or changing a pure algorithm export in a logistics-ts package (safety stock, a forecasting method, a classifier, a numeric primitive). Enforces the Explained<T> contract, TSDoc-with-citation convention, layered dependencies, and the tests-are-the-product bar.
when_to_use: Trigger when implementing any new function/export in packages/* — especially M3 forecasting (movingAverage, ses, holt, holtWinters, croston, sba, tsb, autoForecast, metrics) and M4 inventory (safetyStock, reorderPoint, eoq, coverage, issues) — or when editing an existing algorithm. Keywords "implement", "add method", "forecasting", "safety stock", "EOQ", "new export", "M3", "M4".
---

# Implementing an algorithm in logistics-ts

The library's value is **trustworthy, explainable maths**. A new export is not done
when it compiles — it is done when it is cited, explained, golden-tested, exported,
and `pnpm check` is green. Follow this order.

## 0. Locate the layer and read the plan

- Confirm which package the function belongs in and that its imports only reach
  **lower** layers (see `CLAUDE.md` → layering). `core` may import nothing.
- Read the relevant section of [`plans/v0.1.md`](../../../plans/v0.1.md) for the
  intended signature and [`research.md`](../../../research.md) for the formula,
  cutoffs, and citation. **Do not invent** formulas, cutoffs, or citations — they
  are specified there (King formula, SBC cutoffs 1.32/0.49, MASE, EOQ Harris 1913, …).

## 1. Match the established shape

Read a sibling that already does it well before writing — e.g.
[`packages/classification/src/abc.ts`](../../../packages/classification/src/abc.ts)
for a domain function, or
[`packages/core/src/numerics/stats.ts`](../../../packages/core/src/numerics/stats.ts)
for a primitive. Mirror its structure exactly:

- One file per algorithm (`ses.ts`), test beside it (`ses.test.ts`).
- Exported `interface`s for options and result rows; precise types, **no `any`**.
- `readonly` array params; guard invalid inputs with a thrown `Error` naming the item.

## 2. Decide: domain result or primitive?

- **Domain result** (a forecast, a classification, a safety-stock number) → must
  return `Explained<T>` built with `explain()`:
  ```ts
  import { type Explained, explain } from '@logistics-ts/core'

  return explain(value, {
    method: 'sba',                                   // stable machine id, kebab-case
    inputs: { alpha, periods: series.length },       // every number that fed it
    reasoning: [ /* human/agent bullets: what was done and why */ ],
    citations: ['Syntetos & Boylan (2005)'],         // real, from research.md
    ...(warnings ? { warnings } : {}),               // spread-guard optional props
  })
  ```
  `exactOptionalPropertyTypes` is on — add `warnings`/`citations` via the spread guard
  above, never as `warnings: undefined`.
- **Low-level primitive** (`mean`, `inverseNormalCdf`, a Nelder-Mead objective) →
  returns a **plain number**; no `Explained` wrapper. Export it for power users.

## 3. TSDoc every export (product feature, not decoration)

Each export needs: a one-line summary, the **formula**, **units**, parameter
**constraints**, a **`@see` literature citation** where one exists, and a runnable
**`@example`**. Agents read these `.d.ts` directly. Copy the density in `abc.ts`.

## 4. Wire it up

- Export the function and its types from the package `src/index.ts` (follow the
  existing grouped-export style).
- If this is the first import from a lower-layer sibling (e.g. inventory first using
  forecasting), add it to that package's `package.json` `dependencies` as
  `"@logistics-ts/<pkg>": "workspace:*"`, then `pnpm install`.

## 5. Test to the product bar

Invoke **`/verify-numerics`** for the full discipline. Minimum for any algorithm:

1. A **golden test** against an authoritative value — textbook worked example
   (cite it in the test name) or a checked-in statsforecast/stockpyl fixture, with
   tolerance-based comparison.
2. Edge cases the sibling tests cover: empty input, single period, all-zero demand
   (→ warning, not crash), NaN/negative guards.
3. A **property test** (fast-check) where a law holds — SS monotonic in service
   level, EOQ scale invariance, ABC shares sum to 1, non-negative forecasts.

Assert on the explanation too: `method`, key `inputs`, and any `warnings` — they are
part of the contract.

## 6. Verify green, then version

```bash
pnpm check        # lint + typecheck + build + test + deps:check — must pass
pnpm changeset    # consumer-visible change → describe it; packages are fixed-versioned
```

`deps:check` failing means you imported up/sideways a layer or added a dep to `core` —
fix the design, don't relax the rule. If unsure whether a maths dependency is
warranted, `/verify-numerics` has the decision procedure (hand-roll + golden test is
the default).

## Checklist

- [ ] Correct layer; imports only reach lower layers
- [ ] Signature/formula/citation taken from plans + research, not invented
- [ ] Domain result wrapped in `Explained<T>`; primitives return plain numbers
- [ ] TSDoc: summary, formula, units, constraints, `@see` citation, `@example`
- [ ] Exported from `src/index.ts`; new cross-package dep added to `package.json`
- [ ] Golden + edge + property tests; explanation asserted
- [ ] `pnpm check` green; changeset added
