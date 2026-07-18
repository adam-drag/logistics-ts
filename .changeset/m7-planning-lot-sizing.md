---
'@logistics-ts/planning': minor
---

Add `@logistics-ts/planning` — a new package for production/inventory planning,
starting with the lot-sizing family.

Heuristic rules: `lotForLot`, `fixedOrderQuantity`, `periodOrderQuantity` (POQ
derives its order interval from the EOQ anchor in `@logistics-ts/inventory`),
`silverMeal` (greedy extension while average cost per *period* falls), and
`leastUnitCost` (the same greedy extension on cost per *unit*). Each is a greedy
local rule that never revisits an earlier run boundary, so none is optimal — the
TSDoc and `reasoning[]` say so rather than implying otherwise.

Optimal rule: `wagnerWhitin` — the O(T²) dynamic program over the
zero-inventory property that yields the provably minimum-cost plan the
heuristics approximate, golden-tested against Python `stockpyl`'s
`wagner_whitin` (Snyder & Shen, *Fundamentals of Supply Chain Theory* 2e,
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

Also exposes the shared `LotPlan` result type and two low-level cost primitives
sharing one end-of-period holding convention: `accumulateLotCost` (coverage form,
for orders equal to their covered demand) and `simulateLotCost` (on-hand
simulation, correct when a fixed lot leaves remainder inventory).

The umbrella `logistics-ts` package re-exports it as the `planning` namespace
(`import { planning } from 'logistics-ts'`), alongside `core`, `classification`,
`forecasting`, and `inventory`.

Layer 3.5: depends inward only on core, classification, forecasting, and
inventory.
