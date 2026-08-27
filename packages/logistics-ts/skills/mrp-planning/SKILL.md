---
name: mrp-planning
description: Plan production and purchasing with logistics-ts — explode a bill of materials, net against stock, apply lot-sizing rules, and offset by lead time to get explained planned orders. Use when building MRP/ERP production planning, material requirements, purchase-order suggestion, or "what do I need to order and when" features.
---

# Multi-level MRP with logistics-ts

`logistics-ts` is a dependency-light TypeScript supply-chain toolkit. Every result
is **explainable** — a value plus the `method`, `inputs`, `reasoning`, and
`citations` behind it (`Explained<T>`).

Install: `npm i logistics-ts` (or scoped: `@logistics-ts/core`,
`@logistics-ts/planning`).

This skill covers turning a **bill of materials** plus a **master production
schedule** into planned orders for every item beneath it.

## The one thing to get right

A component's demand follows its parent's planned order **RELEASE**, not the
parent's requirement date. If 100 bikes are due on 23 March and a bike takes a
week to build, the bikes are *released* on 16 March — so the wheels are needed on
16 March, not the 23rd. Netting the parent first also means the parent's own
stock and lead time are already accounted for before the component sees any
demand.

`planRequirements` does this. `explode` deliberately does not — see the table at
the end.

## Periods, not dates

Every planning function is indexed by **period (bucket)**, never by date, and
`leadTimePeriods` is counted in those same buckets. At weekly buckets a 10-day
lead time is `2`, not `10`. Convert dated records with `toMasterSchedule`, which
also hands back the labels so you can map an index back to a real date.

## The full pass

```ts
import { core, planning } from 'logistics-ts'

const { loadBom, loadMasterSchedule } = core
const { toMasterSchedule, planRequirements } = planning

// 1. Load the structure and the schedule from whatever tabular shape you have.
const { records: bom } = loadBom(bomRows, {
  parentId: 'parent', childId: 'child', quantityPer: 'per',
})
const { records: mps } = loadMasterSchedule(mpsRows, {
  itemId: 'sku', date: 'due', quantity: 'qty',
})

// 2. Bucket the dated schedule. `start` pins period 0 to a real date (today),
//    so you get "release in the week of 2026-02-23" instead of "period 3".
const { masterSchedule, periods } = toMasterSchedule(mps, 'week', {
  start: '2026-02-02',
})

// 3. Plan.
const plan = planRequirements({
  bom,
  masterSchedule,
  periods,
  items: {
    BIKE:  { leadTimePeriods: 1 },
    WHEEL: { leadTimePeriods: 2, onHand: 50 },
    FRAME: { leadTimePeriods: 3, safetyStock: 10 },
    SPOKE: {
      leadTimePeriods: 1,
      lotRule: {
        rule: 'foq', orderQuantity: 5000,
        setupCost: 50, holdingCostPerUnitPerPeriod: 0.01,
      },
    },
  },
})

// 4. Read it. `order` is low-level-code order: parents before their components.
for (const itemId of plan.value.order) {
  const item = plan.value.items[itemId]
  for (const o of item?.plannedOrders ?? []) {
    const release = periods[o.releasePeriod] ?? `period ${o.releasePeriod}`
    console.log(`${itemId}: ${o.quantity} on ${release}${o.pastDue ? ' [PAST DUE]' : ''}`)
  }
}
```

Anything omitted from `items` is planned with no stock, no receipts, no safety
stock, zero lead time, and lot-for-lot.

## Shortcut: `InventoryAnalyzer.plan()`

If you already hold stock and lead-time records, the wrapper derives the per-item
data for you and takes the master schedule **dated**, skipping step 2:

```ts
import { InventoryAnalyzer } from 'logistics-ts'

const analyzer = new InventoryAnalyzer({ demand, stock, leadTimes })
const plan = analyzer.plan({ bom, masterSchedule: mps, granularity: 'week', start: '2026-02-02' })
```

- `onHand` is the **sum** of that item's stock records across locations.
- `leadTimePeriods` is the item's mean observed `leadTimeDays` in buckets,
  **rounded up** — a 10-day lead time at weekly buckets becomes 2 weeks. Rounding
  down would schedule a release later than the part can physically arrive.
- `items` overrides win field by field, and are the only way to set a safety
  stock, scheduled receipts, or a lot rule.

## Lot-sizing rules

Set `lotRule` per item. All take `setupCost` and `holdingCostPerUnitPerPeriod`:

| `rule` | Behaviour |
|---|---|
| `'lot-for-lot'` | Order each period's net demand in that period. The MRP baseline, and the default. |
| `'foq'` | Fixed lot repeated as needed; requires `orderQuantity`. The only rule that can leave surplus at the horizon end. |
| `'poq'` | Order at a fixed interval derived from the EOQ anchor. |
| `'silver-meal'` | Greedy while average cost per *period* falls. Not optimal. |
| `'least-unit-cost'` | Greedy while cost per *unit* falls. Not optimal. |
| `'wagner-whitin'` | Dynamic-programming **optimum** for the deterministic horizon. |

Call `planning.lotSize(demand, options)` directly to compare rules on one item.

## `explode` vs `planRequirements`

Both walk the BOM in low-level-code order. They answer different questions.

| | `explode` | `planRequirements` |
|---|---|---|
| Driven by | parent's **gross requirements** | parent's **planned order releases** |
| Netting against stock | no | yes |
| Lead-time offset | no — child lands in the parent's period | yes |
| Lot sizing | no | yes |
| Use it for | sourcing, costing, "how many parts does this schedule consume?" | scheduling, "what do I order and when?" |

## Reading the warnings

- **`pastDue` on a planned order** (and the matching item-level warning) — the
  release falls before period 0, so the plan is infeasible as scheduled. Expedite,
  or re-plan with an earlier `start`.
- **Plan-level past-due escalation** — when an item has past-due releases *and*
  components beneath it, those components' gross requirements are **understated**,
  because demand from before period 0 could not be scheduled at all. This is
  strictly worse than an ordinary past-due and cannot be seen from the component's
  own plan.
- **Unreachable items** — items in the BOM that no demand reaches get no plan row
  at all and are listed in `warnings`. Usually a dead branch or a typo'd id.

## Gotchas

- **A cycle throws.** An item that is transitively its own component cannot be
  planned; the `RangeError` names a concrete offending edge. `loadBom` catches the
  degenerate single-row case (parent === child) as a per-row issue instead.
- **Low-level code is the LONGEST path down to an item, and is structural, not
  demand-based.** An item with independent demand that is *also* consumed as a
  component gets the code its deepest parent forces, not 0 — precisely so it is
  planned after those parents.
- **`toMasterSchedule`, not bare `bucketize`.** `bucketize` defaults each item to
  its own earliest and latest demand, which is right for forecasting and silently
  wrong here: period 0 must mean the same calendar period for every item.
- **`periods` labels change no number** — pass them anyway; they are what makes a
  planned order actionable. A wrong-length set throws rather than mislabelling.
- **Explanations are the product.** `plan.reasoning` states why each component's
  demand landed where it did. Surface it; don't discard it.

## Runnable reference

See `examples/mrp-planning.ts` in the repo (`pnpm example:mrp`) — it plans a
bicycle three levels deep, prints the planned orders against real dates, and
contrasts the same BOM run through `explode`.
