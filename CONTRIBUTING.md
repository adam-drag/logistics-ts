# Contributing to logistics-ts

Thanks for your interest! This is a modular TypeScript supply-chain toolkit
where **trust in the numbers is the product** — contributions are held to a high
correctness and documentation bar. Please read this before opening a PR.

## Ground rules

- Read [`AGENTS.md`](AGENTS.md) first — it is the authoritative contributor
  reference (repository map, dependency direction, conventions).
- The scope is deliberately narrow (see [`concept.md`](concept.md) non-goals):
  algorithms and decision-support primitives, **not** an app, UI, ERP connector,
  or persistence layer. Please open an issue to discuss before building anything
  that expands scope.

## Getting started

Requires Node ≥ 20 and pnpm.

```bash
pnpm install
pnpm check        # lint + typecheck + build + test + deps:check (what CI runs)
```

Run `pnpm check` and make sure it is green before opening a PR. CI runs the same
on Node 20, 22, and 24.

## Conventions (enforced in review)

- **ESM-only, TypeScript strict.** No `any`; prefer precise types.
- **Every decision-support result returns `Explained<T>`** — value plus method,
  inputs, reasoning, citations, and warnings. Never return a bare number for a
  computed recommendation.
- **Pure, tree-shakeable functions.** Stateful wrappers live only in the
  umbrella package.
- **TSDoc on every export**: formula, units, parameter constraints, a literature
  citation where one exists, and an `@example`.
- **`@logistics-ts/core` stays zero-runtime-dependency.** Hand-roll simple,
  verifiable maths and pin it with golden tests; reach for a dependency only when
  the maths is genuinely tricky *and* the library is verified accurate.
- Respect the **layered dependency direction** (`pnpm deps:check` enforces it): a
  package may import only from lower layers, never upward, never in a cycle.

## Tests are the product

Numeric changes must ship with tests — golden tests against authoritative
reference values, reproduced textbook examples (cited in the test name), and/or
property tests. A change to a formula without a test that pins its correctness
will not be merged.

## Pull requests

1. Fork and branch from `main` (`feat/…`, `fix/…`, `chore/…`).
2. Keep PRs focused; one logical change per PR.
3. Add a [changeset](https://github.com/changesets/changesets) (`pnpm changeset`)
   describing the change and its semver impact.
4. Ensure `pnpm check` passes and CI is green.
5. Fill in the PR template.

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
