# @logistics-ts/planning

[![npm version](https://img.shields.io/npm/v/@logistics-ts/planning.svg)](https://www.npmjs.com/package/@logistics-ts/planning)
[![license](https://img.shields.io/npm/l/@logistics-ts/planning.svg)](https://github.com/adam-drag/logistics-ts/blob/main/LICENSE)

Production and inventory **planning** for
[`logistics-ts`](https://www.npmjs.com/package/logistics-ts): the lot-sizing
family that turns a per-period demand vector into a costed order plan. Every
result returns `Explained<T>` — the plan, plus the method, inputs, reasoning,
and citations behind it.

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

## In the umbrella package

`@logistics-ts/planning` is re-exported as the `planning` namespace from
[`logistics-ts`](https://www.npmjs.com/package/logistics-ts):

```ts
import { planning } from 'logistics-ts'

planning.wagnerWhitin([90, 120, 80, 70], { setupCost: 500, holdingCostPerUnitPerPeriod: 2 })
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
