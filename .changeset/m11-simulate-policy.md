---
'@logistics-ts/inventory': minor
---

## `simulatePolicy` — discrete-event evaluation of `(s,Q)`, `(R,S)` and `(s,S)`

Answers the question the analytic formulas cannot: *what would this policy
actually have done?* `fillRate` gives the expected β under a set of modelling
assumptions; `simulatePolicy` walks a concrete demand path period by period and
reports what was realised — fill rate, cycle service level, average on-hand,
average inventory position, order count, stockout periods, units short — plus
the full period-by-period record.

**The simulation is deterministic.** It takes a demand path and has no seed and
no random number generator. Randomness, for a Monte-Carlo study, belongs in how
you generate the paths you feed it, which keeps this function exactly testable
and the stochastic part under your control.

Every policy decides on the **inventory position** (on-hand + on-order −
backorders), never on-hand alone — reordering on on-hand is the classic
simulation bug, and re-orders every period until the first delivery lands.

Unmet demand is backordered by default, or can be treated as lost sales. Lost
sales emits a warning that the realised fill rate is then **not** comparable to
the analytic `fillRate()`, which assumes backordering.

The correctness test anchors the simulation to `fillRate()` rather than to
itself, and measuring that anchor turned up something worth documenting: the
effective protection interval for this sequence-of-events convention is
**L − 0.5 periods**, not L, because the reorder point is crossed at a uniformly
distributed moment within a period. The analytic formula also degrades when
per-period demand is large relative to the protection interval, because the
position *undershoots* the reorder point rather than landing on it.
