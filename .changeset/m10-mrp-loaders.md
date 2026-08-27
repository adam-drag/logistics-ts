---
'@logistics-ts/planning': minor
'@logistics-ts/core': minor
---

## MRP ingest: BOM and master-schedule loaders

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
