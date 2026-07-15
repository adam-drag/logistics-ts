---
'@logistics-ts/inventory': minor
---

Add fill-rate / Type-2 service (β) support to `@logistics-ts/inventory`:
`fillRate`, `safetyStockForFillRate`, and `serviceMetrics` — bridging cycle
service level (α) and fill rate (β) via the unit normal loss function already in
core. Each returns an `Explained<T>` with formula, citations (Silver, Pyke &
Thomas 2017), and reasoning that keeps the α ≠ β distinction explicit.
