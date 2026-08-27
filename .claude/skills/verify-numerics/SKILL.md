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

**Choose the generator's domain from the TYPE's domain.** A property is only as
strong as the inputs it is offered, and this is decided when you write it, not when
someone reviews it. A `number` parameter sampled with `fc.nat` leaves every
fractional input untested — and for a continuous quantity (units, currency, rates)
that gap is exactly where floating-point residue falsifies an invariant the TSDoc
states unconditionally. `mrpGrid` shipped that way: sound assertions, integer-only
generators, and two false "never below the floor" guarantees. Use
`fc.integer(...).map(n => n / 100)` for realistic two-decimal quantities, or a
**bounded** `fc.double({ min, max, noNaN: true })`; avoid *unbounded* `fc.double`,
which spans subnormals and NaN/±Infinity where a 1-ULP disagreement is IEEE-754
rather than a defect. See `self-improve` → hollow-test species (d).

fast-check is not yet a dependency — add it as a **root devDependency** the first
time it's needed (`pnpm add -D -w fast-check`), never as a package runtime dep.

## Layer 4 — Stochastic results (simulation)

**Everything above assumes a deterministic answer.** Every golden in this repo
today pins an exact value because the maths is deterministic. A Monte-Carlo
result — `simulatePolicy` and anything else that consumes a random demand path —
breaks that assumption, and needs its own discipline. Do not just wrap a
simulation in `toBeCloseTo` and widen the tolerance until it passes; that is a
hollow test with extra steps.

**1. Seed everything, and make the seed an input.** The function must take a
`seed` (or an injected RNG) so a given seed always yields exactly the same run.
Hand-roll a small PRNG in the package rather than using `Math.random` — it cannot
be seeded, which makes every failure unreproducible. A seeded run is then pinnable
with `toBe` like any deterministic result, and *that* is the regression test.

**2. Separate the two questions.** They need different tests:
  - *"Is the implementation stable?"* — one seed, exact expected output. Fails on
    any behaviour change. This is your Layer-1 equivalent.
  - *"Is the estimator right?"* — many seeds, assert the statistic converges to a
    value you can derive analytically. This is the real correctness claim.

**3. Anchor the statistic to closed-form maths wherever one exists.** This is the
crucial step and the one that is easy to skip. A simulated `(s,Q)` policy's
realised fill rate must converge to the analytic `fillRate()` this library
already ships; simulated average on-hand must converge to the textbook
`Q/2 + safetyStock`. Asserting a simulation against *itself* proves nothing —
asserting it against an independently-derived formula is what makes it a golden.
Where stockpyl's `sim` module covers the same policy, generate a fixture from it
exactly as `fixtures/generate.py` does for Wagner-Whitin.

**4. Size the tolerance from the standard error, and write the arithmetic down.**
A Monte-Carlo mean over `n` runs has standard error `σ/√n`; a 4-sigma band gives
a ~1-in-16,000 flake rate per assertion. Compute the band, put the calculation in
a comment, and raise `n` if the band is too loose to be meaningful. A tolerance
picked by trying numbers until CI went green is not a tolerance, it is a
concealed failure — and the giveaway is the absence of any comment explaining
where it came from.

**5. State the flake budget out loud.** Count the probabilistic assertions in the
file and multiply. If the suite has 20 of them at 4 sigma, that is a ~1-in-800
chance of a red CI run on an innocent commit. Either accept that explicitly in a
comment or tighten it. Per the standing rule, **a single unreproducible red is
not a flake until proven** — so a suite that cries wolf is worse than no suite.

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
