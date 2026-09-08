---
'@logistics-ts/inventory': minor
---

## `safetyStockPolicy` and `safetyStockMethods` — policy buffers, and the method catalogue as data

### `safetyStockPolicy(options)`

The buffer rules practitioners actually configure in an ERP: `days-of-supply`,
`fixed`, and `percentage-of-average`. Each returns an `Explained<number>` like
everything else.

**These are deliberately NOT part of `safetyStock`.** A policy buffer carries no
service-level guarantee: it holds what a person asked for, and the protection
that delivers depends on variability the method never measured. Keeping them in
a separate function means no caller can pass a `serviceLevel` to a rule that
ignores it, and no result can be labelled "95% service" when it was really
"someone said two weeks". Every policy result also carries a warning saying so,
because once the number reaches a UI nothing else distinguishes it from a
statistical one.

Each variant carries its own inputs, and **every quantity names its unit in its
own field**. `days-of-supply` requires `meanDemandPerDay`, not a shared
`meanDemand` with the period left implicit. Mixing a lead time in days with a
mean in weekly buckets is the most common way these calculations go wrong, and
this shape makes it a type error rather than a silent one.

```ts
safetyStockPolicy({ method: 'days-of-supply', days: 14, meanDemandPerDay: 4.92 })
safetyStockPolicy({ method: 'fixed', quantity: 250 })
safetyStockPolicy({ method: 'percentage-of-average', bufferPercentage: 0.3, meanDemandPerPeriod: 200 })
```

### `safetyStockMethods(kind?)`

The method catalogue as runtime data: id, family, formula, description,
when-to-use, and every parameter with its unit and enforced range. TSDoc is
compile-time, so a UI rendering a method picker or an agent choosing from a list
could not read any of it before.

The catalogue spans both families and tags each entry `kind: 'statistical' |
'policy'`, so a picker cannot present "fixed quantity" beside "King's formula"
without the difference being visible.

It is frozen all the way down, not just at the array, since it is a single
shared instance. Tests assert the catalogue agrees with the functions it
describes: every id is accepted and echoed back by the real function, every
declared bound is really enforced, and compile-time exhaustiveness checks fail
the build if a method is added to either family and the catalogue is not
updated.
