# @logistics-ts/planning

[![npm version](https://img.shields.io/npm/v/@logistics-ts/planning.svg)](https://www.npmjs.com/package/@logistics-ts/planning)
[![license](https://img.shields.io/npm/l/@logistics-ts/planning.svg)](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)

Production and inventory **planning** for
[`logistics-ts`](https://www.npmjs.com/package/logistics-ts): the lot-sizing
family that turns a per-period demand vector into a costed order plan, and the
**time-phased netting grid** (MRP record) that decides what actually needs
ordering in the first place. Every result returns `Explained<T>` — the plan,
plus the method, inputs, reasoning, and citations behind it.

Scope is deliberate: MRP is **infinite-capacity** by definition, so capacity
planning (CRP), scheduling and routings are not included.

## Install

```bash
npm i @logistics-ts/planning
```

## What's in it

- **`lotSize`** — one entry point that dispatches to any rule below by name,
  for when the rule is chosen at runtime (config, UI, or an agent).
- **`wagnerWhitin`** — the dynamic-programming **optimum**.
- **`lotForLot`**, **`fixedOrderQuantity`**, **`periodOrderQuantity`**,
  **`silverMeal`**, **`leastUnitCost`** — the classic MRP heuristics.
- **`accumulateLotCost`** / **`simulateLotCost`** — the low-level cost
  primitives every rule shares, so all plans are costed the same way.

### Choosing a rule

| Rule | `lotSize` name | Optimal? | Trade-off |
|---|---|---|---|
| `wagnerWhitin` | `'wagner-whitin'` | **Yes — provably minimum cost** | O(T²) dynamic program. Cheap for any realistic horizon; **prefer this unless you specifically need a heuristic's behaviour**. |
| `lotForLot` | `'lot-for-lot'` | No | Orders each period's demand in that period. Zero holding, maximal ordering — the MRP baseline. |
| `fixedOrderQuantity` | `'foq'` | No | Fixed lot `Q` repeated as needed. The only rule that can leave surplus inventory at the horizon end. Requires `orderQuantity`. |
| `periodOrderQuantity` | `'poq'` | No | Orders at a fixed interval derived from the EOQ anchor. |
| `silverMeal` | `'silver-meal'` | No | Greedy: extends a run while average cost **per period** falls. **Can be arbitrarily worse than the optimum** on adversarial demand. |
| `leastUnitCost` | `'least-unit-cost'` | No | Greedy: extends a run while cost **per unit** falls. Same local-stopping weakness. |

The heuristics are greedy local rules — each stops at the first upturn in its
criterion and never revisits an earlier run boundary, so none is optimal. They
are included because they are the textbook MRP defaults and are what many
existing systems implement; when cost is what matters, use `wagnerWhitin`.

All rules share one **end-of-period holding convention** (holding is charged on
inventory carried out of each period), so their costs are directly comparable —
and `wagnerWhitin` is golden-tested against Python
[`stockpyl`](https://pypi.org/project/stockpyl/)'s `wagner_whitin`, reproducing
Snyder & Shen, *Fundamentals of Supply Chain Theory* 2e, Example 3.9.

## Quick start

```ts
import { lotSize, wagnerWhitin } from '@logistics-ts/planning'

const demand = [90, 120, 80, 70] // units per period
const costs = { setupCost: 500, holdingCostPerUnitPerPeriod: 2 }

const plan = wagnerWhitin(demand, costs)

plan.value.orders // [{ period: 0, quantity: 210 }, { period: 2, quantity: 150 }]
plan.value.totalCost // 1380  (setup 1000 + holding 380)
plan.reasoning // why each order exists
plan.citations // ['Wagner, H.M. & Whitin, T.M. (1958), Management Science 5(1), 89-96', ...]

// Same thing when the rule is selected at runtime:
lotSize(demand, { rule: 'wagner-whitin', ...costs })

// 'foq' is the one rule needing an extra option — and the types enforce it:
lotSize(demand, { rule: 'foq', ...costs, orderQuantity: 150 })
```

Costs use consistent units: `demand` in units/period, `setupCost` in
currency/order, and `holdingCostPerUnitPerPeriod` in currency/unit/period.

## Time-phased netting grid (MRP record)

Lot sizing answers *how much to order at once*. `mrpGrid` answers the prior
question — *what actually needs ordering*, once existing stock, open orders, and
a safety-stock floor are accounted for. It is the canonical MRP record (Orlicky;
APICS/ASCM CPIM), one row per period:

| column | meaning |
| --- | --- |
| `grossRequirements` | demand in the period |
| `scheduledReceipts` | open orders already due |
| `projectedAvailableBalance` | stock at end of period; never below `safetyStock` |
| `netRequirements` | `max(0, GR + safetyStock − PAB_prev − SR)` |
| `plannedOrderReceipt` | lot-sized order arriving in the period |
| `plannedOrderRelease` | that receipt offset *left* by `leadTimePeriods` |

```ts
import { mrpGrid } from '@logistics-ts/planning'

const plan = mrpGrid({
  grossRequirements: [10, 0, 40, 30, 0, 50],
  scheduledReceipts: [0, 0, 15, 0, 0, 0],
  onHand: 20,
  leadTimePeriods: 2,
})

plan.value.rows.map((r) => r.netRequirements)     // [0, 0, 15, 30, 0, 50]
plan.value.rows.map((r) => r.plannedOrderRelease) // [15, 30, 0, 50, 0, 0]
plan.value.plannedOrders
// [{ releasePeriod: 0, receiptPeriod: 2, quantity: 15, pastDue: false }, ...]

plan.reasoning // narrates each order: what caused it, what sized it, when to release
```

**Safety stock** is netted against as if it were extra demand, so
`projectedAvailableBalance` never drops below the floor — this pulls orders
earlier and larger.

**Lot rules are pluggable** and default to lot-for-lot. The grid hands the
*whole* net-requirements vector to `lotSize` rather than sizing period by
period, because Silver-Meal and Wagner-Whitin are horizon algorithms:

```ts
mrpGrid({
  grossRequirements: [40, 60, 0, 90, 70],
  onHand: 55,
  safetyStock: 15,
  lotRule: { rule: 'wagner-whitin', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
})
```

**Lead time is in periods (buckets), never days.** `leadTimePeriods: 2` on a
weekly grid means two weeks — convert a day-denominated supplier lead time
before calling.

**Past-due orders are surfaced, not hidden.** If a release would land before
period 0, the receipt is kept (the demand is real) and reported both in
`warnings` and in `plannedOrders` with `pastDue: true` — never silently dropped
or clamped into period 0. A planner needs to know the plan is infeasible as
scheduled.

## Multi-level MRP (BOM explosion)

`mrpGrid` plans one item. `planRequirements` plans a whole product structure:
master schedule in, netted and lot-sized planned orders for every component out.

```ts
import { planRequirements } from '@logistics-ts/planning'

const plan = planRequirements({
  bom: [
    { parentId: 'BIKE', childId: 'WHEEL', quantityPer: 2 },
    { parentId: 'WHEEL', childId: 'SPOKE', quantityPer: 32 },
  ],
  masterSchedule: [{ itemId: 'BIKE', requirements: [0, 0, 0, 0, 100] }],
  items: {
    BIKE: { leadTimePeriods: 1 },
    WHEEL: { leadTimePeriods: 2, onHand: 40 },
    SPOKE: { leadTimePeriods: 1 },
  },
})

plan.value.order                              // ['BIKE', 'WHEEL', 'SPOKE']
plan.value.items.WHEEL.grossRequirements      // driven by BIKE's RELEASES
plan.value.items.SPOKE.rows                   // full time-phased record
```

### Dated records in, periods out

Every planning function is indexed by **period (bucket)**, and `leadTimePeriods`
counts those same buckets — at weekly buckets a 10-day lead time is `2`. Turn
dated master-schedule rows into that shape with `toMasterSchedule`:

```ts
import { toMasterSchedule } from '@logistics-ts/planning'

const { masterSchedule, periods } = toMasterSchedule(
  [
    { itemId: 'BIKE', date: '2026-03-02', quantity: 100 },
    { itemId: 'BIKE', date: '2026-03-16', quantity: 150 },
  ],
  'week',
)

periods // ['2026-03-02', '2026-03-09', '2026-03-16']
masterSchedule[0] // { itemId: 'BIKE', requirements: [100, 0, 150] }
```

It aligns **every item to one shared calendar**, which is why it exists rather
than a bare `bucketize` call: `bucketize` defaults each item to that item's own
earliest and latest demand, which is right for forecasting and silently wrong
here, where period 0 must mean the same period for every item. Pass `start` to
pin period 0 to a real date such as today.

Pass `periods` on to `planRequirements` and it is echoed back on the result, so a
planned order can be reported against a date instead of an index.

**Components are driven by their parents' planned order _releases_, not their
gross requirements.** A parent that must be *started* in period 3 needs its
components in period 3 — not in period 5 when the finished parent arrives — and
netting the parent first means its own stock and lead time are already taken
into account. This is the difference between MRP and a naive explosion.

**Items are processed in low-level-code order**, where a low-level code is the
*longest* path from an end item. A component used at two different depths is
therefore planned only after *every* one of its parents, so it is never
understated. A cyclic BOM is rejected with the offending edge named.

If you only want dependent gross requirements without any netting, `explode(bom,
demand)` is the standalone gross explosion:

```ts
import { explode } from '@logistics-ts/planning'

explode(
  [{ parentId: 'A', childId: 'B', quantityPer: 2 }],
  [{ itemId: 'A', requirements: [0, 100] }],
).value.grossRequirements.B // [0, 200]
```

**Past-due releases are escalated.** If a parent must be released before period 0
*and* has components beneath it, those components' requirements are
**understated** — the demand cannot be scheduled at all — and the result says so
in `warnings`. A component's own plan has no way to report that.

## In the umbrella package

`@logistics-ts/planning` is re-exported as the `planning` namespace from
[`logistics-ts`](https://www.npmjs.com/package/logistics-ts):

```ts
import { planning } from 'logistics-ts'

planning.wagnerWhitin([90, 120, 80, 70], { setupCost: 500, holdingCostPerUnitPerPeriod: 2 })
planning.mrpGrid({ grossRequirements: [10, 0, 40], onHand: 20, leadTimePeriods: 1 })
```

`@logistics-ts/planning` sits above `@logistics-ts/inventory` in the layering, so
it may import inward from any lower layer — but it declares only what it actually
uses: `@logistics-ts/core` (the `Explained` result type and numeric primitives)
and `@logistics-ts/inventory` (it reuses that package's `eoq` as the anchor for
the period-order-quantity interval).

## Links

- [Full docs, API map, and examples](https://github.com/adam-drag/logistics-ts)
- [Other `logistics-ts` packages](https://github.com/adam-drag/logistics-ts#packages)

## License

[MIT](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)
