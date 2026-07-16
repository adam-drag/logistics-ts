---
'@logistics-ts/planning': minor
---

Add `@logistics-ts/planning` — a new package for production/inventory planning,
starting with the lot-sizing family.

Rules: `lotForLot`, `fixedOrderQuantity`, and `periodOrderQuantity` (POQ derives
its order interval from the EOQ anchor in `@logistics-ts/inventory`). Each takes
a per-period demand vector plus cost parameters and returns an
`Explained<LotPlan>` carrying the formula, citations (Nahmias 2009; Silver, Pyke
& Thomas 2017), and reasoning behind every planned order.

Also exposes the shared `LotPlan` result type and two low-level cost primitives
sharing one end-of-period holding convention: `accumulateLotCost` (coverage form,
for orders equal to their covered demand) and `simulateLotCost` (on-hand
simulation, correct when a fixed lot leaves remainder inventory).

Layer 3.5: depends inward only on core, classification, forecasting, and
inventory.
