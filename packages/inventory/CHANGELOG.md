# @logistics-ts/inventory

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

### Patch Changes

- Updated dependencies [293a7c8]
  - @logistics-ts/forecasting@0.1.0
  - @logistics-ts/classification@0.1.0
  - @logistics-ts/core@0.1.0
