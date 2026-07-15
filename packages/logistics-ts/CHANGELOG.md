# logistics-ts

## 0.1.1

### Patch Changes

- f31ccac: Add a dedicated `README.md` to every published package. `npm publish` reads
  `README.md` from each package's own directory, not the repo root — since none
  of the five packages had one, every npm page showed no README at all (just
  the one-line description). Each package now ships an npm-facing README with
  badges, an install snippet, a runnable quick-start example, and links back to
  the monorepo docs.

  Also tightened the `logistics-ts` package description to lead with the
  `Explained<T>` differentiator instead of a generic "toolkit" framing.

- Updated dependencies [f31ccac]
  - @logistics-ts/core@0.1.1
  - @logistics-ts/classification@0.1.1
  - @logistics-ts/forecasting@0.1.1
  - @logistics-ts/inventory@0.1.1

## 0.1.0

### Minor Changes

- 6f81a54: M4 inventory: implement `@logistics-ts/inventory` — safety stock, reorder
  point, EOQ, coverage, turnover, and issue analysis.

  - **Safety stock** — `safetyStock` as a family of formulas
    (`demand-variability`, `leadtime-variability`, `king`, `max-minus-average`)
    plus `'auto'`, which picks the richest formula the supplied inputs support
    and warns (without swapping formulas) when the demand pattern is
    intermittent/lumpy.
  - **Reorder point** — `reorderPoint` and the periodic-review `orderUpToLevel`.
  - **EOQ** — `eoq` (Harris/Wilson), `epq` (finite production rate), and
    `eoqWithQuantityDiscounts` (all-units discount procedure).
  - **Coverage & turnover** — `coverage` (days of inventory, optional
    `autoForecast`-projected forecast walk) and `turnover` (unit-based turns and
    DIO) over raw stock/demand records. Both report genuine calendar days
    regardless of the demand-bucketing `granularity` (day/week/month); lead time
    (always recorded in days) is likewise converted into the matching period
    unit wherever `issues`/`InventoryAnalyzer.safetyStock` combine it with
    bucketed demand.
  - **Issue analyser** — `issues` composes safety stock, reorder point,
    coverage, and `classification.fsn` into per-item flags: `below-rop`,
    `below-safety-stock`, `stockout-risk-within-leadtime`, `overstocked`,
    `dead-stock`.

  Every result is `Explained<T>` with formula/citation TSDoc (King 2011;
  Silver-Pyke-Thomas 2017; Harris 1913). Adds `workspace:*` dependencies on
  `@logistics-ts/classification` and `@logistics-ts/forecasting`. The umbrella
  `logistics-ts` package gains `InventoryAnalyzer`, a thin stateful wrapper over
  the pure inventory functions for callers holding one dataset across calls.

- da336c1: M5 agent surface: ship the AI-agent consumption layer for the published
  `logistics-ts` package.

  - **Shipped skills** (in the package tarball, under `skills/`) — end-to-end
    recipes an agent can follow: `forecast-and-replenish` (load → bucketize →
    classify → autoForecast → safety stock → reorder point → issues) and
    `inventory-analysis` (ABC-XYZ, coverage/turnover, and the issue analyser via
    both `InventoryAnalyzer` and the pure functions).
  - **`llms.txt`** at the repo root — an llmstxt.org entry point: what the library
    is, the API map, gotchas, and links to the docs/skills/examples.
  - **Expanded `AGENTS.md`** — a "which function for which problem" decision table
    and the full gotchas list (zero-fill, unit agreement, cycle-service-level ≠
    fill rate, MAPE-at-zero, sample-vs-population std).
  - **Consumer README** — install, a runnable quick-start, and an "For AI agents"
    section.
  - **Runnable `examples/`** — `quickstart`, `forecast-and-replenish`, and
    `inventory-analysis`, driven by `generateExampleData()` (`pnpm example:*`),
    typechecked as part of `pnpm check`.

  No library code changed; this is documentation, skills, and examples. The
  `skills/` directory is included in the published tarball (already declared in
  `files`).

### Patch Changes

- Updated dependencies [293a7c8]
- Updated dependencies [6f81a54]
  - @logistics-ts/forecasting@0.1.0
  - @logistics-ts/inventory@0.1.0
  - @logistics-ts/classification@0.1.0
  - @logistics-ts/core@0.1.0
