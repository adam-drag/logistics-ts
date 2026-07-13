---
description: The numeric-correctness discipline for logistics-ts — how to golden-test against authoritative values, reproduce textbook examples, write fast-check property tests, and decide hand-roll-vs-dependency for a piece of maths. Trust in the numbers is the product.
when_to_use: Trigger when writing or reviewing tests for any algorithm or numeric primitive, generating golden fixtures (statsforecast/stockpyl), reproducing a textbook worked example, or deciding whether to add a maths dependency vs. hand-roll it. Keywords "golden test", "fixture", "tolerance", "property test", "fast-check", "accuracy", "hand-roll or dependency", "z-table".
---

# Verifying the numbers

The library sells trust in its maths. A test that only checks the code runs is
worthless; a test pins the output to an **authoritative external value**. Three
layers, use whichever fit the function (most get 1 + 2, ideally all three).

## Layer 1 — Golden tests against a reference

Pin the output to a value produced by something authoritative, with tolerance:

- **Numeric primitives** → published tables. `inverseNormalCdf` is tested at 15
  z-table points across both tails; a new primitive gets the same treatment. Cite
  the source in the test.
- **Forecasting methods** → checked-in JSON fixtures generated from Python
  `statsforecast` (Croston/SBA/TSB, ETS). Put a `fixtures/generate.py` alongside so
  the fixture is reproducible; compare with a tolerance (`toBeCloseTo` or an explicit
  `Math.abs(a - b) < tol`), never exact float equality.
  Learned generating the M3 fixtures (see `fixtures/generate.py` docstring):
  `statsforecast`'s Holt/HW are ETS models with MLE-optimised initial states —
  not comparable at fixed parameters; use `statsmodels` with
  `initialization_method="known"` (feed the TS code's own initial states) instead.
  Pin the **one-step fitted path**, not just a few forecast points — it exercises
  every state update. Expect and *adjudicate* convention divergences rather than
  loosening tolerance: TSB's probability init differs between conventions (we
  match statsforecast), and statsmodels HW uses a one-update-stale seasonal at
  h ≡ 0 (mod m) where fpp3/R use the latest (we follow fpp3; keep fixture
  horizon < m).
- **Inventory formulas** → `stockpyl` fixtures (EOQ, safety stock) or the worked
  numbers from the cited paper.

Choose tolerance deliberately and comment why (e.g. sample-vs-population std, α
fitted to slightly different SSE). Loose tolerance hiding a real disagreement is a
failed test dressed as a pass.

## Layer 2 — Textbook worked examples

Reproduce a worked example from a cited source **exactly** and name the test after
it, so the citation is visible in test output:

```ts
it('reproduces Silver-Pyke-Thomas (2017) §7 safety-stock example', () => { … })
it('matches fpp3 Holt-Winters quarterly example', () => { … })
```

Sources are listed in [`research.md`](../../../research.md) §3: Silver-Pyke-Thomas
2017, Hyndman & Athanasopoulos fpp3, King 2011 (safety stock), Harris 1913 (EOQ),
Croston 1972, Syntetos & Boylan 2005 (SBA), Teunter-Syntetos-Babai 2011 (TSB).

## Layer 3 — Property tests (fast-check)

Assert invariant laws over generated inputs, not fixed cases:

- Safety stock **monotonic** in service level.
- EOQ **scale-invariant** in the documented way.
- ABC shares **sum to 1**; classifier assigns **every** item exactly one class.
- Forecasts **non-negative** for non-negative series where the method guarantees it.
- `mape` warns on zero-demand series; `mase` stays defined where `mape` isn't.

fast-check is not yet a dependency — add it as a **root devDependency** the first
time it's needed (`pnpm add -D -w fast-check`), never as a package runtime dep.

## Edge cases every algorithm test covers

Empty input, single data point, all-zero demand (→ `warnings`, not a throw or NaN
leak), negative/NaN guards. Mirror the cases in
[`packages/classification/src/xyz.test.ts`](../../../packages/classification/src/xyz.test.ts)
— it distinguishes "no demand" from "too few periods" and asserts the *right*
warning fires. Assert the `Explained` fields (`method`, `inputs`, `warnings`), not
just `value`.

## Deciding: hand-roll or take a dependency?

`core` is a **zero-runtime-dependency leaf** and the whole library is dependency-light
on purpose. The decision procedure:

1. **Simple and verifiable** (arithmetic under ~100 lines, checkable against a table
   or textbook) → **hand-roll it, dep-free**, and pin it with a Layer-1 golden test.
   This is the default and covers almost everything in scope.
2. **Genuinely tricky** *and* a **trusted library is also accurate** → consider the
   library, but **verify accuracy first** against authoritative values. Precedent:
   `simple-statistics`' `probit` was rejected because it is off by ~0.003 — accuracy,
   not popularity, decides. Document the check.
3. If it would add a dependency to `core`, the answer is no — find another home or
   hand-roll.

## Running

```bash
pnpm test                                   # whole suite
pnpm --filter @logistics-ts/<pkg> test      # one package
pnpm test:watch                             # while iterating
```

A perf smoke test (5M-row load + bucketize + classify under a budgeted bound) guards
the "runs everywhere, fast" promise — keep it green but generously bounded.
