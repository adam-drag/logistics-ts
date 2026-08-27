/**
 * Multi-level MRP: from a bill of materials and a master production schedule to
 * explained planned orders for every component.
 *
 * Plans a bicycle three levels deep. The interesting part is not the arithmetic
 * but the timing: a component's demand follows its parent's planned order
 * RELEASE, not the parent's requirement date, because that is when the parent
 * must actually start being built.
 *
 * Run with:  pnpm example:mrp
 */
import { core, InventoryAnalyzer, planning } from 'logistics-ts'

const { loadBom, loadMasterSchedule } = core
const { toMasterSchedule, planRequirements, explode } = planning

// 1. The product structure. In a real app this is a table or a CSV export;
//    loadBom accepts either and maps whatever columns it happens to have.
const { records: bom, issues: bomIssues } = loadBom(
  [
    { parent: 'BIKE', child: 'WHEEL', per: 2 },
    { parent: 'BIKE', child: 'FRAME', per: 1 },
    { parent: 'WHEEL', child: 'SPOKE', per: 32 },
    { parent: 'WHEEL', child: 'RIM', per: 1 },
  ],
  { parentId: 'parent', childId: 'child', quantityPer: 'per' },
)
console.log('BOM lines loaded:', bom.length, '| issues:', bomIssues.length)

// 2. The master production schedule — dated independent demand for end items.
const { records: mps } = loadMasterSchedule(
  [
    { sku: 'BIKE', due: '2026-03-23', qty: 100 },
    { sku: 'BIKE', due: '2026-03-30', qty: 150 },
  ],
  { itemId: 'sku', date: 'due', quantity: 'qty' },
)

// 3. Bucket the dated schedule into periods. `start` pins period 0 to a real
//    date — here "today" — so the plan can tell you to release an order in the
//    week of 2026-02-23 rather than in "period 3".
const { masterSchedule, periods } = toMasterSchedule(mps, 'week', { start: '2026-02-02' })
console.log('\nPlanning calendar:', periods.join(' | '))

// 4. Plan. Each item brings its own stock, lead time and lot rule.
const plan = planRequirements({
  bom,
  masterSchedule,
  periods,
  items: {
    BIKE: { leadTimePeriods: 1 },
    WHEEL: { leadTimePeriods: 2, onHand: 50 },
    FRAME: { leadTimePeriods: 3, safetyStock: 10 },
    // Spokes are cheap and bought in bulk: a fixed lot of 5000 at a time.
    SPOKE: {
      leadTimePeriods: 1,
      lotRule: {
        rule: 'foq',
        orderQuantity: 5000,
        setupCost: 50,
        holdingCostPerUnitPerPeriod: 0.01,
      },
    },
    RIM: { leadTimePeriods: 2 },
  },
})

// 5. Read the plan. `order` is low-level-code order: parents before components.
console.log('\nPlanned orders (release → receipt):')
for (const itemId of plan.value.order) {
  const item = plan.value.items[itemId]
  if (!item) continue
  const orders = item.plannedOrders
    .map((o) => {
      const release = periods[o.releasePeriod] ?? `period ${o.releasePeriod}`
      const receipt = periods[o.receiptPeriod] ?? `period ${o.receiptPeriod}`
      return `${o.quantity} on ${release} → arrives ${receipt}${o.pastDue ? ' [PAST DUE]' : ''}`
    })
    .join('\n      ')
  console.log(`  ${itemId} (level ${item.lowLevelCode}):`)
  console.log(`      ${orders || 'nothing to order'}`)
  // Each item carries its own netting warnings — a past-due release here means
  // this item cannot be started early enough to meet the schedule.
  for (const warning of item.warnings ?? []) console.log(`      ! ${warning}`)
}

// 6. Why. Every result carries the reasoning that produced it — this is the
//    part that makes the plan reviewable rather than merely correct.
console.log('\nWhy this plan:')
for (const line of plan.reasoning) console.log('  -', line)
if (plan.warnings) {
  console.log('\nWarnings:')
  for (const w of plan.warnings) console.log('  !', w)
}

// 7. The contrast that defines MRP. `explode` answers "how many parts does this
//    schedule consume in total?" — gross, same period, no netting and no lead
//    time. It is the right tool for sourcing and costing, and the wrong one for
//    scheduling, which is what planRequirements above does.
const gross = explode(bom, masterSchedule)
console.log('\nGross explosion (no netting, no lead-time offset):')
for (const itemId of Object.keys(gross.value.grossRequirements).sort()) {
  const total = (gross.value.grossRequirements[itemId] ?? []).reduce((a, b) => a + b, 0)
  console.log(`  ${itemId}: ${total} units required in total`)
}

// 8. The same plan through InventoryAnalyzer, which fills in on-hand and lead
//    times from a dataset you already hold rather than making you restate them.
const analyzer = new InventoryAnalyzer({
  demand: [],
  stock: [{ itemId: 'WHEEL', quantity: 50 }],
  leadTimes: [
    { itemId: 'BIKE', leadTimeDays: 7 },
    { itemId: 'WHEEL', leadTimeDays: 10 },
  ],
})
const derived = analyzer.plan({
  bom,
  masterSchedule: mps,
  granularity: 'week',
  start: '2026-02-02',
})
console.log('\nVia InventoryAnalyzer (stock + lead times derived from the dataset):')
console.log(
  '  WHEEL releases:',
  derived.value.items.WHEEL?.rows.map((r) => r.plannedOrderRelease).join(', '),
)
