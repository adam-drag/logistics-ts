---
name: lt-review
description: Structured PR/diff review for logistics-ts. Use when reviewing a pull request or when asked "review this", "what do you think of these changes", or "LGTM?". Produces a review tuned to this library's invariants — numeric correctness against authoritative references, the Explained<T> contract, TSDoc-with-citation-and-accurate-@example, the layering law, strict-flag type safety, and tests-as-the-product — with issues grouped Critical / Major / Minor and an unambiguous Approve or Request Changes verdict. High signal over volume: every finding names a file:line, a why, and a fix.
---

# lt-review: logistics-ts PR review

You are reviewing a change to **logistics-ts**, a dependency-light, *explainable*
TypeScript supply-chain toolkit whose primary consumers are humans **and AI agents
reading the types and TSDoc directly**. Correctness of the numbers and the
explanations is the product. Follow every step in order.

Ground rule that overrides everything: **this review is judged by signal, not
volume.** A false positive is expensive — it trains the author to ignore the
reviewer (the documented failure mode of automated review). Report only findings you
can defend, each with a `file:line`, a one-line *why it matters*, and a concrete fix.
If the diff is clean, say so plainly; do not manufacture nitpicks to look thorough.

---

## Step 0: Bootstrap context

1. Read `CLAUDE.md` and `AGENTS.md` (repo root) — the invariants and anti-patterns
   there are mandatory review checks, in addition to this skill.
2. **Load the matching `self-improve` known-patterns.** `self-improve` carries the
   accumulated list of reviewer-caught anti-patterns. Load it for any domain this PR
   touches before reviewing — those bullets ARE part of this checklist, and roughly
   "already documented, not re-applied" is the most common way real defects slip
   through.
3. Invoke `verify-numerics` whenever the diff changes any algorithm or numeric
   primitive (it is the discipline for judging golden/textbook/property tests and
   accuracy), and `code-review` for the generic correctness pass. If the diff adds or
   changes an algorithm export, also load `implement-algorithm` to check the change
   against the house recipe.

---

## Step 1: Understand the change and its blast radius

- Read the diff (`git add -N . && git diff <baseline>` for a local diff — the
  `git add -N .` is REQUIRED or brand-new untracked files are invisible; or
  `gh pr diff <n>` for a PR). Read the **key changed files in full**, not just the
  hunks.
- State a one-sentence hypothesis: **what problem is this change solving?**
- **Map the blast radius.** For every exported symbol the diff changes (a function,
  type, or its signature), grep its call sites and downstream consumers — including
  higher-layer packages (`inventory` → `logistics-ts` umbrella, etc.). A change is
  rarely self-contained; read what depends on it. Grep the *bare identifier*
  (`\bfoo\b`, not `foo(`) to catch pass-through references.
- **Check size.** A diff over ~400 lines of genuine logic (excluding fixtures,
  lockfiles) is a review-quality risk — findings-per-line drops on large PRs. If it's
  large, slow down rather than skim, and say so in the verdict.

---

## Step 2: Reconcile the description against the diff, claim by claim

Do not read the PR/description once and move on. **Extract every factual claim into a
checklist and verify each against the code** — a method name, "implements M-N of the
plan", "reuses core's normalLossFunction", "adds a changeset", a cited textbook
value, "only touches package X". Mark each **verified**, **contradicted**, or
**unimplemented**, and report every contradiction or omission as a finding. A
description that misdescribes the change is a defect in its own right and a reliable
smell that the implementation drifted from intent. An empty PR body is itself a
finding when the change adds a new package, a new export, or a plan-level decision.

---

## Step 3: Evaluate goal and approach

- Is the goal clear and correct, and does the code actually achieve it?
- Would you take the same approach from scratch? Is there a simpler, more idiomatic
  one? (Prefer the established pattern in a sibling module over a hand-rolled one.)
- Does it add accidental complexity, or handle hypothetical edge cases that don't
  matter while missing ones that do?
- Does a maths choice reach for a dependency where a simple, verifiable primitive
  should be hand-rolled — or trust a library's accuracy without a golden check?
  (See `numerics-dependency-rule`; `core` must stay a zero-runtime-dependency leaf.)

---

## Step 4: Run the logistics-ts checks

> **Empirical prior — where reviews here miss things.** In this library the defects
> that a green `pnpm check` cannot see cluster in four places: **(1) numeric error**
> that passes because the test encodes the same wrong value; **(2) `@example`/TSDoc
> drift** — an example whose numbers contradict the code or its own tests (this
> shipped in M6 until an independent review caught it); **(3) absence** — a missing
> golden test, missing changeset, missing citation, missing `package.json` dep entry;
> **(4) sibling instances** left unfixed when one occurrence is corrected. Two habits
> close most of the gap: **when you flag a pattern, grep the whole diff for its
> siblings and flag them all**, and **ask "what should be here that isn't?"**

### 4a. Numeric correctness (the top priority)
- **Independently recompute at least one worked value yourself** — a throwaway script
  against an authoritative reference (a textbook worked example, a z-table point, a
  `statsforecast`/`stockpyl` fixture). Do not trust the code, its comments, or its
  tests to be self-consistent.
- A golden/textbook test must **cite its source** (in the test name or a comment) and
  compare with a stated tolerance. A test that encodes a hand-typed "expected" value
  with no cited origin is not a golden test — flag it.
- Where a mathematical law exists, a **property test** should assert it (monotonicity,
  scale invariance, conservation, non-negativity, round-trip). Absence is a finding
  when the law is load-bearing.

### 4b. `@example` and TSDoc accuracy
- Every exported `@example`'s numbers must match **both** what the code returns and
  what the tests assert. Recompute or run it. Where two examples form a round-trip
  (`f(g(x))`), confirm they genuinely invert.
- Load-bearing example numbers need a **doctest-style guard test** (assert the
  documented inputs produce the documented outputs). Flag its absence.
- Every export must carry the full TSDoc: **formula, units, parameter constraints, a
  citation where one exists, and an `@example`.** A missing citation on a formula that
  has one, or an invented citation, is a Major finding (agents depend on these).

### 4c. The `Explained<T>` contract
- Every domain result returns `Explained<T>` via `explain()` — `value` + `method` +
  `inputs` + `reasoning[]` + optional `citations`/`warnings`. A bare number from a
  safety-stock / forecast / classification / planning function is a Critical
  violation. (Only low-level numeric primitives — `mean`, `variance`,
  `inverseNormalCdf`, … — may return plain numbers.)
- The `reasoning[]` bullets and `method`/`inputs` must be **true** — a reasoning
  string that misstates the formula or a stale `method` slug is a finding.

### 4d. Layering & dependencies
- A package imports only from **lower** layers, never sideways or up; `core` stays a
  zero-runtime-dependency leaf. Any new lower-layer import must be declared in that
  package's `package.json` `dependencies` (`workspace:*`). Confirm `pnpm deps:check`
  would pass. No `export { foo } from './old'` back-compat re-exports.

### 4e. Type safety & strict flags
- **No `any`** (biome errors on it) and no unsafe `as` casts — prefer `unknown` +
  guards. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on: array
  indexing must be guarded, and optional keys must be **omitted** (conditional spread)
  rather than assigned `undefined`. New types must not be mere aliases of existing
  ones.

### 4f. Dates
- Dates are calendar dates, never instants: epoch-day integers internally, ISO strings
  at the boundary, **no date library**. Flag any `Date`-as-instant arithmetic or an
  introduced date dependency.

### 4g. Tests-are-the-product
- New behaviour is covered by `*.test.ts` beside the source. Tests assert **behaviour
  and reference values**, not implementation details. A boundary, a branch, a fitted
  parameter, a classifier cutoff without a test is a Major finding.

### 4h. Release hygiene
- A consumer-visible change needs a **changeset** (`pnpm changeset`). No hand-edited
  package `version` fields (changesets own the bump). Flag either omission.

### 4i. Sibling sweep (do this before writing the review)
- **Never report a single instance of a repeated pattern.** For every issue you're
  about to write, grep the full diff and the files it touches for other occurrences
  of the same shape and list them all in the one finding. If you catch yourself
  writing "e.g." about a repeated pattern, stop and enumerate them.

### 4j. Absence sweep — what *should* be here but isn't
- A new export with no `@example`, no test, or no changeset. A new formula with no
  citation. A new lower-layer import not added to `package.json`. A new algorithm not
  re-exported from the umbrella package. A `method` slug used at more than one site
  as a literal instead of a shared constant. These produce no wrong-looking line —
  hunt them deliberately.

---

## Step 5: Classify issues

| Severity | Meaning |
|---|---|
| **Critical** | A correctness/numeric bug, a bare number where `Explained<T>` is required, a `core` runtime dependency or layering violation, an invented citation, an `@example` that contradicts the code. Must be fixed before merge. |
| **Major** | Wrong approach, a missing golden/property test on load-bearing logic, a missing citation/changeset, a strict-flag or `any` violation, a missing sibling fix, a description that misdescribes the change. Should be fixed before merge. |
| **Minor** | Naming, avoidable complexity, a missing test on a non-critical path, a tolerance that's looser than necessary, wording of a `reasoning` bullet. Fix encouraged, not blocking. |

Tie every Critical/Major to the specific invariant or risk it violates — that makes
the finding auditable and defensible, and keeps the review evidence-based rather than
a matter of taste.

---

## Step 6: Output — exactly this structure

# Goal of the change
_One sentence: what it's trying to achieve._

## Changes
_Factual bullets: which files/areas changed and what each does._

## Issues

### Critical
_One checkbox per issue, or "None."_
- [ ] `path/to/file.ts:NN` — the issue, the invariant/risk it violates, and the fix.

### Major
_One checkbox per issue, or "None."_
- [ ] `path/to/file.ts:NN` — the issue and the fix.

### Minor
_One checkbox per issue, or "None."_
- [ ] `path/to/file.ts:NN` — the issue and the fix.

## Alternatives
_Only if a meaningfully better approach exists. Concise; omit the section otherwise._

## Verdict
**Approved** — only if there are zero issues at every severity.
**Request changes** — if any issue exists at Minor or above; state the minimum set of
changes required for approval in one or two sentences.

---

## Reviewer discipline (internal — do not output)
- Cite `file:line`. Every finding carries a *why* and a concrete fix — a finding
  without an actionable fix is low-signal noise; either make it actionable or drop it.
- Be fair: distinguish "I'd do it differently" (Minor/Alternative) from "this is
  wrong" (Critical/Major). A convention here (Explained<T>, no `any`, cited tests,
  layering) is **not** a matter of taste — violations are Major, not Minor.
- **Independently verify the numbers.** Never approve a numeric change on a green
  build alone — recompute a value and check the `@example`. This is the single check
  that most distinguishes this review from a generic linter.
- **Absence is a finding.** "No golden test for the new method" and "no changeset"
  are real issues; write them up.
- **Report every instance, not one exemplar** (Step 4i).
- Do not praise the change in the output; focus on the goal assessment and issues.
- Do not suggest refactors outside the change's scope unless required for correctness.
- **Not every automated finding is correct.** External reviewers (Copilot, etc.)
  produce false positives — most often here by flagging a hand-rolled numeric
  primitive as "reinventing a library" when the library was rejected for inaccuracy
  (`simple-statistics` probit), or by suggesting a dependency for `core`. When an
  external comment conflicts with a documented logistics-ts invariant, the invariant
  wins; say so and explain why rather than "fixing" the code to satisfy the bot.
