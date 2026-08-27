---
'logistics-ts': minor
'@logistics-ts/planning': minor
---

## Agent surface for multi-level MRP

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
