# @logistics-ts/planning

## 0.2.0

### Minor Changes

- 0103a19: ## Agent surface for multi-level MRP

  **`InventoryAnalyzer.plan(input)`** runs a multi-level MRP plan over a bill of
  materials and a **dated** master production schedule, filling in each item's
  on-hand stock and lead time from the dataset the analyzer already holds.

  - `onHand` is the sum of that item's stock records across locations.
  - `leadTimePeriods` is the item's mean observed `leadTimeDays` in buckets,
    **rounded up**: a 10-day lead time at weekly buckets becomes 2 weeks. Rounding
    down would schedule a release later than the part can physically arrive, which
    is a stockout the plan would claim is fine.
  - Per-item overrides merge field by field, so supplying only a lot rule keeps the
    derived stock and lead time. Safety stock, scheduled receipts and lot rules can
    only be set that way.

  **`planRequirements` accepts an optional `periods` label per period index** and
  echoes it back on the result, so a planned order can be reported against a real
  date rather than an index. Labels change no number in the plan; a set whose
  length does not match the horizon throws rather than mislabelling every order.

  A new **`mrp-planning` skill** ships in the npm tarball alongside
  `forecast-and-replenish` and `inventory-analysis`, covering the full pass, the
  lot-sizing rules, when to reach for `explode` instead, and how to read the
  past-due and unreachable-item warnings. A new runnable
  `examples/mrp-planning.ts` (`pnpm example:mrp`) plans a bicycle three levels deep
  and prints its planned orders against real dates.

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

- a9b4d75: Add `@logistics-ts/planning` — a new package for production/inventory planning,
  starting with the lot-sizing family.

  Heuristic rules: `lotForLot`, `fixedOrderQuantity`, `periodOrderQuantity` (POQ
  derives its order interval from the EOQ anchor in `@logistics-ts/inventory`),
  `silverMeal` (greedy extension while average cost per _period_ falls), and
  `leastUnitCost` (the same greedy extension on cost per _unit_). Each is a greedy
  local rule that never revisits an earlier run boundary, so none is optimal — the
  TSDoc and `reasoning[]` say so rather than implying otherwise.

  Optimal rule: `wagnerWhitin` — the O(T²) dynamic program over the
  zero-inventory property that yields the provably minimum-cost plan the
  heuristics approximate, golden-tested against Python `stockpyl`'s
  `wagner_whitin` (Snyder & Shen, _Fundamentals of Supply Chain Theory_ 2e,
  Example 3.9) and pinned by a brute-force optimality property test.

  Unified entry: `lotSize(demand, { rule, ... })` dispatches to any of the six
  rules by name for when the rule is chosen at runtime, mirroring
  `safetyStock({ method })`. Its options are a discriminated union, so a rule/option
  mismatch (e.g. `orderQuantity` outside `'foq'`) is a compile-time error; it
  delegates to each rule's own implementation rather than reimplementing them.

  Each takes a per-period demand vector plus cost parameters and returns an
  `Explained<LotPlan>` carrying the formula, citations (Wagner & Whitin 1958;
  Silver & Meal 1973; Nahmias 2009; Silver, Pyke & Thomas 2017), and reasoning
  behind every planned order.

  ## Time-phased netting grid

  `mrpGrid(input)` builds the canonical MRP record for a single item (Orlicky;
  APICS/ASCM CPIM), returning an `Explained<{ rows, plannedOrders }>` where every
  row carries the full netting arithmetic — gross requirements, scheduled
  receipts, projected available balance, net requirements, planned order receipt,
  and planned order release.

  Netting is `net_t = max(0, grossRequirements_t + safetyStock −
projectedAvailableBalance_{t−1} − scheduledReceipts_t)`, with an optional
  `safetyStock` floor the balance never dips below.

  Lot sizing is **delegated** to the rules above via `lotRule` (default
  lot-for-lot): the grid hands the whole net-requirements vector to `lotSize`
  rather than sizing period by period, because Silver-Meal and Wagner-Whitin are
  horizon algorithms. A rule that orders early shows covered periods netting to
  zero and carries the surplus forward.

  `leadTimePeriods` offsets each receipt _left_ into a planned order release. Its
  unit is **periods/buckets, never days** — convert a day-denominated supplier
  lead time before calling. A release landing before period 0 is **past due**:
  the receipt is kept (the demand is real) and reported in `warnings` and in
  `plannedOrders` with `pastDue: true`, never silently dropped or clamped into
  period 0. `reasoning[]` narrates each planned order back to the net requirement
  that caused it, the rule that sized it, and the period it is released in — the
  cause is the period whose requirement the order actually covers, which is not
  always the period it is received in (POQ orders at the start of every interval
  block, ahead of the need inside it).

  Demand does not have to be integral. Both netting identities are held to
  their exact values against binary floating-point residue, so fractional
  quantities (kg, litres, hours) never put the projected balance below the
  safety-stock floor or show a net requirement no planned order covers.

  Input is validated fail-fast: a non-array horizon, or a hole/`undefined` entry
  inside `grossRequirements` or `scheduledReceipts`, throws naming the field
  rather than being read as zero demand.

  Scope note: `mrpGrid` is **single-item** netting. Multi-level MRP over a bill
  of materials is `explode` / `planRequirements`, described in its own changeset.

  Also exposes the `MrpInput`, `MrpRow`, `MrpGridPlan`, `MrpPlan`, and
  `PlannedOrderSchedule` types alongside the shared `LotPlan` result type and two
  low-level cost primitives
  sharing one end-of-period holding convention: `accumulateLotCost` (coverage form,
  for orders equal to their covered demand) and `simulateLotCost` (on-hand
  simulation, correct when a fixed lot leaves remainder inventory).

  The umbrella `logistics-ts` package re-exports it as the `planning` namespace
  (`import { planning } from 'logistics-ts'`), alongside `core`, `classification`,
  `forecasting`, and `inventory`.

  Layer 3.5: depends inward only on core, classification, forecasting, and
  inventory.

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

- Updated dependencies [0103a19]
- Updated dependencies [60a0f51]
- Updated dependencies [5911d36]
- Updated dependencies [1aafb4d]
  - @logistics-ts/core@0.2.0
  - @logistics-ts/inventory@0.2.0
