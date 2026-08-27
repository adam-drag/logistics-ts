# @logistics-ts/core

## 0.2.0

### Minor Changes

- 0103a19: ## MRP ingest: BOM and master-schedule loaders

  Closes the gap between "I have a table of data" and the multi-level MRP run
  shipped in the previous release. Until now `explode` and `planRequirements`
  required hand-built period-indexed arrays, while every other domain in the
  library had a loader.

  **`loadBom(input, mapping?, options?)`** and **`loadMasterSchedule(...)`** join
  `loadDemand` / `loadStock` / `loadLeadTimes` in `@logistics-ts/core`, with the
  same contract: any tabular shape (row objects, columnar, a `TableSource`
  adapter), a column mapping, CSV-style string coercion, and per-row problems
  collected as `LoadIssue`s rather than thrown, so one pass over a large file
  reports every bad row.

  A BOM row whose parent equals its child is a row problem and is collected and
  skipped, like a negative quantity. Longer cycles are deliberately not checked
  here — a cycle is a property of the edge set, not of any row, and it is detected
  by the levelling pass in `@logistics-ts/planning`.

  **`toMasterSchedule(records, granularity, options?)`** in
  `@logistics-ts/planning` buckets dated master-schedule records into the
  period-indexed series `planRequirements` consumes, and returns the period labels
  alongside them so a planned order in period 3 can be reported against a real
  date.

  It aligns **every item to one shared calendar**, which is the reason it exists
  rather than a bare `bucketize` call. `bucketize` defaults each item's series to
  that item's own earliest and latest demand — correct for forecasting, where
  items are modelled independently, and silently wrong for MRP, where period 0
  must mean the same calendar period for every item or a component is netted
  against the wrong period. Pass an explicit `start` to make period 0 a specific
  date such as today, or `end` to plan to a fixed horizon past the last demand.

  This also makes `MasterScheduleRecord` load-bearing; it was added as a type in
  the previous release but nothing consumed it.

- 5911d36: ## Multi-level MRP: BOM explosion and `planRequirements`

  `@logistics-ts/planning` gains the two exports that turn single-item netting into
  a real multi-level MRP run.

  **`explode(bom, demand)`** turns independent end-item demand into dependent gross
  requirements for every component, returning them per item per period along with
  the low-level code that ordered the pass.

  Low-level codes are the **longest** path from any end item, not the shortest, and
  that is the whole algorithm. A component consumed at two different depths — used
  directly by a finished assembly _and_ by a sub-assembly two levels down — would
  otherwise be read by its own children before the deeper parent had contributed,
  and come out short. Cycles are rejected with a `RangeError` naming a concrete
  offending edge, since finding it by hand in a large BOM is the real cost.

  **`planRequirements(input)`** runs the full pass: master schedule → dependent
  requirements → netted, lot-sized, lead-time-offset planned orders for every item,
  returned as one `Explained` with a per-item time-phased record inside.

  Each component's gross requirement is `quantityPer ×` its parents' planned order
  **releases** — not their gross requirements. The release is when a parent must
  actually start, so that is when its components are needed, and netting the parent
  first means its own stock and lead time are already accounted for. Per-item
  on-hand, scheduled receipts, safety stock, lead time and lot rule are all
  supported; anything omitted defaults to no stock and lot-for-lot.

  Where a parent has past-due releases _and_ components beneath it, the result
  warns that those components' requirements are **understated** — demand from
  before period 0 could not be scheduled at all. That is a stronger condition than
  the grid's own past-due warning, and one a component's plan cannot report alone.

  Both entry points reject the same malformed input with the same message naming
  the offending field: a non-finite or negative `quantityPer`, a non-string item
  id, and — importantly — a hole or non-number anywhere inside a provided demand
  series, which is an error rather than zero demand.

  `@logistics-ts/core` adds the `BomLine`, `BomRecord` and `MasterScheduleRecord`
  types (types only — core keeps zero runtime dependencies).

  BOM explosion was previously listed as not shipped; multi-level MRP now works
  end to end. Capacity planning (CRP) remains out of scope.

### Patch Changes

- 1aafb4d: ## `@example` on every public export

  Twenty exported functions carried TSDoc without a runnable `@example`, against
  the library's own rule that agents read these `.d.ts` blocks directly: `xyz`,
  `fsn`, `bucketize`, `loadDemand`/`loadStock`/`loadLeadTimes`, `nelderMead`, the
  `normalPdf`/`normalCdf`/`normalLossFunction` trio, the whole `epoch-day` family
  and the descriptive-statistics family.

  Every value in the new examples was produced by running the code, and each is now
  pinned by a doctest (`doctest.test.ts` in `core` and `classification`), so an
  example that drifts from the implementation fails CI rather than misleading a
  reader. Documentation only — no behaviour changed.

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

## 0.1.0
