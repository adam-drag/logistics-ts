---
'@logistics-ts/planning': minor
'@logistics-ts/core': minor
---

## Multi-level MRP: BOM explosion and `planRequirements`

`@logistics-ts/planning` gains the two exports that turn single-item netting into
a real multi-level MRP run.

**`explode(bom, demand)`** turns independent end-item demand into dependent gross
requirements for every component, returning them per item per period along with
the low-level code that ordered the pass.

Low-level codes are the **longest** path from any end item, not the shortest, and
that is the whole algorithm. A component consumed at two different depths — used
directly by a finished assembly *and* by a sub-assembly two levels down — would
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

Where a parent has past-due releases *and* components beneath it, the result
warns that those components' requirements are **understated** — demand from
before period 0 could not be scheduled at all. That is a stronger condition than
the grid's own past-due warning, and one a component's plan cannot report alone.

`@logistics-ts/core` adds the `BomLine`, `BomRecord` and `MasterScheduleRecord`
types (types only — core keeps zero runtime dependencies).

BOM explosion was previously listed as not shipped; multi-level MRP now works
end to end. Capacity planning (CRP) remains out of scope.
