---
description: Learn from mistakes and hard-won successes in logistics-ts. Carries an accumulating list of anti-patterns caught in past reviews so they never recur; runs a root-cause + fix + self-patch workflow when PR/review feedback arrives; and captures durable knowledge (a new/extended skill, AGENTS.md, or memory) after deep work on an under-documented area. Invoke at session start, whenever PR/review/Copilot feedback is presented, and after finishing substantial work in a part of the library that lacks a doc.
when_to_use: Session start (load Known Patterns); when the user shares PR comments, Copilot findings, or reviewer feedback (run the RCA + self-patch workflow); after finishing deep work in an under-documented area (run Knowledge Capture). Keywords "PR feedback", "review comment", "Copilot", "fix this comment", "what did we learn", "capture this".
---

# self-improve — logistics-ts

Three modes depending on context:

- **Session start** — load the Known Patterns below so past mistakes are never repeated.
- **PR / review feedback received** — run the RCA + fix + self-patch workflow.
- **Finished deep work on an under-documented area** — run the Knowledge Capture Workflow.

This skill is committed to the repo: patterns learned here are shared with every
contributor and agent. It complements — does not replace — Adam's personal
cross-repo memory (`~/.claude/.../memory`). See **Where knowledge goes** below.

---

## Known Patterns (always active)

Anti-patterns caught in past reviews of this repo. Never repeat them. This list
grows via the workflows below — add a bullet the moment a review teaches a durable
lesson. (Seeded from the invariants in `CLAUDE.md`/`AGENTS.md`; real caught cases
get appended over time and should name what was caught.)

### The `Explained<T>` contract

- **A domain result must be wrapped, an optional field must be spread-guarded.** Any
  safety-stock / forecast / classification function returns `Explained<T>` via
  `explain()`, never a bare number. Because `exactOptionalPropertyTypes` is on, add
  `warnings`/`citations` with `...(warnings ? { warnings } : {})` — assigning
  `warnings: undefined` is a type error, not a no-op.
- **Assert the explanation in tests, not just the value.** `method`, the key
  `inputs`, and any `warnings` are part of the contract; a test that checks only
  `value` lets the explanation silently rot.

### Prose must match implementation semantics (recurred 4× in review)

The single most-repeated Copilot finding: `reasoning[]` strings, TSDoc, and module
docs that describe behavior the code doesn't actually have. Every time you state a
boundary, a default, or a normalization in words, re-read the code and make them
agree — a wrong explanation is worse than none in an explainable library.

- **State boundary comparisons exactly.** `abc`'s explanation said "A ≤ aMax%
  cumulative" but the code classifies on the cumulative share *before* the current
  item with strict `<`, promoting the straddling item to the higher class. Describe
  the real rule, including the promotion. (Caught: PR#3 `abc.ts`.)
- **Describe edge-case returns as they are.** `variance` TSDoc said "zero values for
  the population form" but the code returns `NaN` for empty population input.
  (Caught: PR#2 `stats.ts`.)
- **Don't claim a normalization the record doesn't hold.** `model.ts` doc said
  Date/ISO inputs are "normalised to epoch-day internally," but the record types
  store `DateInput` verbatim and loaders preserve `Date | string`. (Caught: PR#2.)
- **Error messages must name the real category.** `requireColumns` threw "missing
  *required* column" even when enforcing an explicitly-mapped *optional* column;
  reword so a misspelled optional mapping isn't reported as a missing required one.
  (Caught: PR#2 `loader.ts`.)
- **Compute every `@example` value from the implementation** (best: mirror an
  existing test assertion). `smape`'s `@example` said `≈ 6.13` where the code (and
  its own test) gives `≈ 10.03` — an executable-looking doc value that was never
  executed. (Caught: PR#12 `metrics.ts`.) **Recurred PR#20 `fill-rate.ts`:** the
  `fillRate` `@example` said `≈ 0.9583 / ESC ≈ 8.33` while the file's *own passing
  test* asserted `0.97917 / 4.1657` — the ESC was `100·G(1)` (the σ_L factor
  doubled), and the wrong `0.9583` then propagated into the *linked*
  `safetyStockForFillRate` example, which doesn't round-trip to it. Two lessons:
  (a) when two `@example`s form a round-trip (`f(g(x))`), pick the numbers so they
  actually invert each other and verify by running both; (b) the durable fix is a
  **doctest-style test** — assert the documented example inputs produce the
  documented outputs, so `@example`/code drift fails CI. Add one whenever an
  `@example` carries load-bearing numbers.
- **A warning must state the cause the code actually established, not the most
  common one.** `autoForecast`'s fallback warned "series too short" but the same
  branch fires when a constant series makes every backtest MASE non-finite; track
  which condition occurred and word the warning per-cause. (Caught: PR#12
  `auto.ts`, Copilot.)
- **A hedged claim must stay hedged at EVERY site — the one unqualified sibling is
  the bug.** `serviceMetrics`'s reasoning bullet asserted "β ≥ α because…" as a law,
  but β ≥ α is only a *tendency* (holds when Q is large relative to σ_L; false for
  valid small Q — at Q=5, σ_L=50 the code emits "β = 0.7911 … β ≥ α", self-
  contradictory). Every *other* site (module doc, `fillRate` TSDoc + reasoning,
  `serviceMetrics` TSDoc) correctly said "β ≥ α **typically**" — the lone
  unconditional copy was the defect. When a relationship is stated in multiple
  places and most hedge it, the unhedged one is almost certainly wrong: grep the
  file for the claim and make them agree. And when a "usually X" relationship can
  invert on valid input, don't just hedge the prose — emit a `warnings` entry for
  the inverted case so it's surfaced honestly, and add a test at inputs that trigger
  it. (Caught: PR#20 `fill-rate.ts`, `lt-review`.)
- **An enforced-sounding TSDoc constraint must actually be enforced.**
  `QuantityDiscountInput`'s doc said tiers "must start at a quantity ≤ 1" but
  `eoqWithQuantityDiscounts` never checked it, so a first tier with a gap below it
  silently priced quantities that had no valid tier. If a doc states a constraint
  in "must" language, either validate it or reword the doc to say what's actually
  allowed. (Caught: PR#13 `eoq.ts`, Copilot.)

### A parameter's unit must be re-checked in every sibling function that shares it

When one function is found to mishandle a parameter that also appears in several
sibling functions (same file, same layer, or the same shape of composition), fix
the whole family in one pass — don't stop at the first instance found. Finding one
occurrence is evidence the same mistake was made everywhere the parameter appears,
not just where a test happened to expose it.

- **`granularity` case study.** `issues()` combined `LeadTimeRecord.leadTimeDays`
  (always literal days) with `meanDemandPerPeriod` (bucketed at whatever
  `granularity` the caller chose) without converting units — a 7-day lead time was
  silently treated as 7 *weeks* at `granularity: 'week'`. That got fixed in
  isolation first. The *same* granularity parameter was accepted by `coverage()`
  and `turnover()` too, and their own output fields (`daysOfInventory`,
  `forecastWalkDays`, `daysInventoryOutstanding`) were named as if always in days
  but were actually in whatever period `granularity` bucketed at — a second,
  independent instance of the identical mistake that survived the first fix
  because it doesn't involve lead time at all. Both needed a genuine
  periods→days conversion (`DAYS_PER_PERIOD` in `aggregate.ts`, or `365 /
  turnoverRatio` for the already-annualised DIO). (Caught: PR#13, Copilot — 3
  separate comments on `coverage.ts`, `turnover.ts`, `issues.ts`, all one root
  cause.)
- **When you touch a function that takes a "granularity"/"unit"/"scale" option,
  grep the package for every other function taking the same option** and check
  whether each one's *own* output units are still correct at every option value —
  not just whether it composes correctly with the one function you were fixing.

### API boundary: validate inputs and fail fast (recurred 4×)

A primitive that a power user calls directly must reject nonsensical input with a
clear error, not compute undefined behavior or silently return an empty/wrong result.

- **A composite function can't delegate its own input validation to a sub-call
  that isn't always reached.** `issues()` never validated `serviceLevel` itself,
  relying on `safetyStock()` (which does validate it) — but `safetyStock()` is
  only invoked per-item when that item has lead-time records. A dataset with no
  lead-time records at all let an invalid `serviceLevel` (e.g. `0` or `1`) through
  silently. If a function's own option is documented as constrained, validate it
  at the top of *that* function, even if every current code path happens to
  re-validate it downstream — "happens to" is not a guarantee. (Caught: PR#13
  `issues.ts`, Copilot.)
- **Guard degenerate sizes.** `nelderMead` didn't reject an empty initial vector
  (`n === 0`), then read `simplex[n-1]` and divided by `n`. Reject early. (Caught: PR#2.)
- **Enforce the contract's domain.** `fromEpochDay` documented a UTC-midnight `Date`
  but accepted non-integer/non-finite input and returned a non-midnight/invalid Date.
  An epoch day is an integer — validate it. (Caught: PR#2 `epoch-day.ts`.)
- **A silently-empty result hides a caller bug.** `bucketize` with `start > end`
  returned empty `buckets` instead of throwing; a reversed range is almost certainly
  an error — `throw new RangeError`. (Caught: PR#2 `bucketize.ts`.)
- **Anchor validation regexes.** The ISO-date regex accepted trailing garbage after
  `T`/space (`"2026-01-01Txyz"`) despite the comment claiming it was rejected. Make
  the pattern actually reject what the doc says it does. (Caught: PR#2.)
- **Guard numeric passthroughs with `Number.isFinite`, not `Number.isNaN`.**
  `backtest` skipped `NaN` forecasts but let `±Infinity` through to poison
  MAE/RMSE/MASE. "Not a number I can use" is `!Number.isFinite(x)`. (Caught:
  PR#12 `backtest.ts`.)
- **`new Array(n).fill(x)` is `any[]` — it silently absorbs `undefined`.** An
  unannotated `Array(n)` bypasses strictness, so `.fill(t.at(-1))` smuggled
  `number | undefined` into a declared `number[]`. Write `new Array<number>(n)`
  (or `Array.from`) so the fill is type-checked, and coalesce (`?? Number.NaN`)
  where the source can be `undefined` — especially in `@example` code agents
  copy-paste. (Caught: PR#12 round 2, `backtest.test.ts` + `@example`.)
- **A value derived from optional data can be `NaN` while still `!== undefined` —
  don't let it pass an availability check.** `safetyStock`'s `auto` routing derived
  `demandStdDev` from an optional `series` via `standardDeviation()`, which is `NaN`
  for fewer than two points. `NaN !== undefined` is `true`, so the derived NaN
  silently satisfied "is this data available?" checks and produced a `NaN` safety
  stock instead of falling back or throwing. When deriving an optional field from
  another optional input, check `Number.isFinite(derived)` before treating it as
  present — the `!== undefined` idiom only proves a value was *assigned*, not that
  it's usable. (Caught: PR#13 `safety-stock.ts`, Copilot.)
- **A convenience-wrapper class must translate a missing-data condition into a
  clear error before delegating, not just let the underlying generic validation
  fire.** `InventoryAnalyzer.safetyStock()` fed `mean([])` (`NaN`, for an item with
  no lead-time records) straight into `safetyStock()`, which rejected it with a
  generic "meanLeadTime must be finite" — technically correct but useless for
  diagnosing which item/condition caused it. The wrapper exists for ergonomics;
  check for the missing-data case itself and throw naming the item and the gap.
  (Caught: PR#13 `inventory-analyzer.ts`, Copilot.)

### Type guards for untrusted JS callers

Exported functions take input from JS callers with no compiler checking — guards must
validate structurally, not trust a partial shape.

- **Validate every field the code will read.** `isTableSource` checked only
  `getColumn`/`numRows`, then `normalizeInput` did `new Set(input.columnNames)` and
  threw on an accidental match lacking `columnNames`. Validate `columnNames` (and its
  element type) in the guard. (Caught: PR#2 `table-source.ts`.)
- **Use `Object.hasOwn`, not the `in` operator, for column/key presence** — `in`
  matches inherited prototype props (mapping a column to `"toString"` passes a bare
  `in` check). (Caught: PR#2 `table-source.ts`.)
- **Don't let the first row define the schema.** Detecting columns from row-object
  input by inspecting only the first row wrongly fails when the first row is sparse
  but later rows carry the column. Scan enough rows (or all) to establish presence.
  (Caught: PR#2 `table-source.ts`.)

### Shared mutable state

- **Return a defensive copy of an internal constant, never the shared instance.**
  `classifyDemandPattern` returned the shared `RECOMMENDED[pattern]` array; a caller
  mutating it would corrupt every later classification. Return `[...RECOMMENDED[...]]`.
  (Caught: PR#3 `demand-pattern.ts`.)

### Tooling & scaffolding config

- **Coverage/lint globs must not exclude real code.** The vitest config excluded
  `packages/*/src/index.ts`, but early-milestone implementations live in `index.ts`,
  so coverage silently ignored the actual code. Check what a glob excludes against
  where code actually is. (Caught: PR#1 `vitest.config.ts`.)
- **Enforcement config, its comments, and the docs must describe the SAME
  architecture.** The dependency-cruiser rules, their comments, and `AGENTS.md`
  disagreed on which cross-layer edges were allowed. When you touch any one of a
  rule / its comment / the doc that describes it, reconcile all three. (Caught: PR#1,
  `.dependency-cruiser.cjs` + `AGENTS.md`.)
- **Pin tool versions in CI** to match `packageManager` — `pnpm/action-setup` without
  a pinned version can install a pnpm newer than `pnpm@9.7.1` and break lockfile
  reproducibility. (Caught: PR#1 `ci.yml`.)
- **`noUnusedLocals` does not catch doc-only imports** — tsc counts a TSDoc
  `{@link X}` as a usage, so an import referenced only from doc comments sails
  through typecheck. Biome `correctness/noUnusedImports` + `noUnusedVariables` are
  now `error` in `biome.json` to close that gap; point doc links at symbols the
  file genuinely imports for code (e.g. `ForecastResult`), or use plain backticks.
  (Caught: PR#12 — seven files imported `Explained` only for `{@link}`.)

### Numeric correctness (the product)

- **A test that doesn't pin to an authoritative value proves nothing.** Golden-test
  against a z-table point, a cited textbook example (name it in the test), or a
  statsforecast/stockpyl fixture — with a *deliberate, commented* tolerance. A loose
  tolerance hiding a real disagreement is a failed test dressed as a pass.
- **Hand-computed tests are not reference-fixture golden tests.** M3 shipped with
  hand-derived recursion checks and claimed "golden tests"; the plan's exit
  criterion meant *fixtures from the named reference*. Generating them immediately
  surfaced two real convention divergences (TSB's probability init; statsmodels'
  stale seasonal index at h ≡ 0 mod m) that hand-computed tests could never catch —
  a fixture run against the reference is part of the milestone, not a follow-up.
  (Caught: PR#12 review; fixed by `fixtures/generate.py` + `golden.test.ts`.)
- **State the std convention.** Sample (n−1) is the default; population (n) is
  opt-in. Mismatching it against a reference is a common golden-test discrepancy —
  check the reference's convention before loosening tolerance.
- **Never adopt a maths library on reputation.** Verify accuracy against
  authoritative values first (`simple-statistics`' `probit` was off ~0.003 and
  rejected). Never add a runtime dependency to `core`.
- **Watch the SIGN/direction in an iterative optimizer step.** Nelder–Mead's inside
  contraction must move *toward* the worst vertex — with a `combine(centroid, worst,
  coeff)` that computes the reflection direction, the inside contraction needs a
  *negative* coefficient; a positive one reflects again and can stall convergence.
  A convergence bug like this passes a "runs without error" test — only a golden test
  against a known optimum catches it. (Caught: PR#2 `optimize.ts`.)

### Architecture & conventions

- **No import "up" or sideways a layer**, and no runtime dep in `core`. If
  `deps:check` fails, fix the design — don't relax the rule.
- **Every export carries TSDoc: formula, units, constraints, `@see` citation,
  `@example`.** Agents read the `.d.ts` directly; a missing `@example` is a missing
  feature, not a missing comment.
- **Never invent a formula, cutoff, or citation.** They come from `research.md` /
  `plans/v0.1.md`. If one isn't specified and you can't cite it, stop and say so.
- **A citation string repeated in multiple places (module header, per-branch
  `citations`, its test assertion) must be typed once and copied, not retyped.**
  `safety-stock.ts`'s file-header `@see` cited "King, P.L. (2011)" but the
  `king`-branch `citations` array said "King, R.G. (2011)" — same paper, wrong
  initials, silently divergent since nothing forces them to match. When a
  citation appears more than once in a file, copy-paste it rather than
  retyping from memory each time. (Caught: PR#13 `safety-stock.ts`, Copilot.)
- **A bare `export interface` with only field-level comments still needs its own
  TSDoc line.** `InventoryAnalyzerInput`/`AbcXyzOptions` had per-field comments
  but no interface-level description — easy to skip on an options/input type
  since there's no formula or citation to write, but the "every export carries
  TSDoc" rule applies to a one-line description too. (Caught: PR#13
  `inventory-analyzer.ts`, Copilot ×2.)
- **Don't hand-format to fight biome** — run `pnpm lint:fix`.

---

## PR / review feedback workflow

When the user shares PR comments, Copilot findings, or reviewer feedback, do NOT
silently patch. Run all steps:

1. **Fetch & read** every comment in full (use `gh` if a PR number/URL is given).
2. **Assess validity.** Some review comments are wrong or lower-priority — say so
   with reasoning rather than complying blindly. Group the valid ones.
3. **Fix** — for a behavioral/numeric bug, write the failing test first (red), then
   fix (green). A miscomputed number gets a golden test, not just a code change.
4. **Root-cause analysis.** For each valid finding ask: *what class of mistake is
   this, and what would have prevented it?* One comment usually points at a general
   rule.
5. **Self-patch.** Add the rule to the right home (see below) so it can't recur —
   a Known-Patterns bullet here, a line in `CLAUDE.md`/`AGENTS.md`, or a memory.
   Name the caught case in the bullet.
6. **Verify** `pnpm check` is green, then **report**: what was valid, what you fixed,
   the root cause, and exactly which artifact you patched (with the tool call that
   did it — never claim a patch you didn't make).

---

## Knowledge Capture Workflow

Run after finishing substantial work in an area that lacked a doc. **Gate hard —
silence is the default.** Only capture knowledge that is durable, non-obvious, and
not already derivable from the code or an existing doc.

1. **Should this run at all?** If the lesson is obvious from the code, one-off, or
   already documented — stop.
2. **Route to the right artifact** (a new skill is rarely the answer):
   - A recurring *coding* pitfall or convention → a Known-Patterns bullet here.
   - A cross-cutting rule about how the library is built → a line in `CLAUDE.md` or
     `AGENTS.md`.
   - A whole workflow that's missing → extend `implement-algorithm` /
     `verify-numerics` before creating a new skill.
3. **Bias toward extending** an existing artifact over creating one.
4. **Propose, don't silently create** large new docs — this is a shared repo.
5. **Report** what you captured and where.

---

## Where knowledge goes

- **This skill / `CLAUDE.md` / `AGENTS.md`** (committed) — repo-specific coding
  anti-patterns, conventions, and invariants. Benefits every contributor and agent.
- **Adam's personal memory** (`~/.claude/.../memory`, `feedback`-type) — his
  cross-repo working-style preferences and corrections (e.g. the dependency-accuracy
  rule, no-coauthor-in-commits). Follow the memory instructions in the system prompt
  when a lesson is about *how Adam wants you to work*, not about this codebase.

When a lesson is genuinely both (a coding rule Adam also holds across repos), record
the repo-specific form here and the general form in memory, and cross-reference.
