/**
 * Quick-start: the shortest path from raw data to an explained decision.
 *
 * Generates a synthetic catalogue, then for one item computes a demand
 * forecast, a safety stock, and a reorder point — printing not just each
 * number but the method, inputs, and reasoning behind it (the `Explained`
 * contract that makes every result auditable by a human or an agent).
 *
 * Run with:  pnpm example:quickstart
 */
import { core, forecasting, inventory } from 'logistics-ts'

const { generateExampleData, bucketize, mean, standardDeviation } = core

// 1. Get some data. In a real app these come from your database/CSV; here we
//    synthesise a reproducible catalogue (seeded, so output never changes).
const { demand, leadTimes } = generateExampleData({ items: 5, periods: 24, seed: 42 })

// 2. Pick one item and turn its raw demand records into a dense, zero-filled
//    monthly series — the shape every algorithm consumes.
const itemId = 'SKU-0001'
const series = bucketize(
  demand.filter((d) => d.itemId === itemId),
  'month',
)[0]
const quantities = series?.buckets.map((b) => b.quantity) ?? []
console.log(`\n${itemId}: ${quantities.length} months of demand →`, quantities.join(', '))

// 3. Forecast next month's demand. autoForecast classifies the demand pattern,
//    backtests the candidate methods, and picks the best by MASE.
const forecast = forecasting.autoForecast(quantities, { horizon: 1 })
console.log(`\nForecast (${forecast.method}): ${forecast.value.forecast[0]?.toFixed(1)} units`)
console.log('  reasoning:', forecast.reasoning[0])

// 4. Size the safety stock. Lead time comes from observed receipts; demand
//    variability from the series we just built.
const itemLeadTimes = leadTimes.filter((l) => l.itemId === itemId).map((l) => l.leadTimeDays)
const ss = inventory.safetyStock(
  {
    meanDemand: mean(quantities),
    meanLeadTime: mean(itemLeadTimes) / (365 / 12), // days → months (demand is monthly)
    demandStdDev: standardDeviation(quantities),
    leadTimeStdDev: standardDeviation(itemLeadTimes) / (365 / 12),
  },
  { method: 'auto', serviceLevel: 0.95 },
)
console.log(`\nSafety stock (${ss.method}): ${ss.value.toFixed(1)} units`)
console.log('  reasoning:', ss.reasoning[0])

// 5. Reorder point = expected lead-time demand + the safety buffer.
const rop = inventory.reorderPoint({
  meanDemand: mean(quantities),
  meanLeadTime: mean(itemLeadTimes) / (365 / 12),
  safetyStock: ss.value,
})
console.log(`\nReorder point (${rop.method}): ${rop.value.toFixed(1)} units`)
console.log('  → reorder when on-hand stock drops to this level.')

// 6. Economic order quantity — how much to buy each time.
const eoq = inventory.eoq({
  annualDemand: mean(quantities) * 12,
  orderCost: 75,
  holdingCostPerUnit: 3,
})
console.log(`\nEOQ (${eoq.method}): ${eoq.value.toFixed(0)} units per order`)
console.log(`  citation: ${eoq.citations?.[0]}\n`)
