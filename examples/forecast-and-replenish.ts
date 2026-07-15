/**
 * Forecast-and-replenish: the end-to-end replenishment workflow across a whole
 * catalogue.
 *
 *   raw records → load → classify demand pattern → autoForecast
 *               → safety stock → reorder point → issue flags
 *
 * This is the workflow the `forecast-and-replenish` agent skill describes.
 * It uses the raw pure functions (not the InventoryAnalyzer wrapper) so every
 * intermediate step and its explanation is visible.
 *
 * Run with:  pnpm example:forecast-replenish
 */
import { classification, core, forecasting, inventory } from 'logistics-ts'

const { generateExampleData, bucketize, mean, standardDeviation } = core

// A mixed catalogue: some smooth items, some intermittent/lumpy — so demand
// classification actually routes to different forecasting methods.
const { demand, stock, leadTimes } = generateExampleData({
  items: 8,
  periods: 24,
  profile: 'mixed',
  seed: 7,
})

const series = bucketize(demand, 'month')

console.log('\nPer-item replenishment plan (monthly buckets, 95% service level):\n')
console.log(
  ['item', 'pattern', 'forecast', 'safetyStock', 'reorderPoint'].map((h) => h.padEnd(14)).join(''),
)
console.log('-'.repeat(70))

const DAYS_PER_MONTH = 365 / 12

for (const s of series) {
  const quantities = s.buckets.map((b) => b.quantity)

  // 1. Classify the demand pattern (Syntetos–Boylan–Croston quadrant).
  const pattern = classification.classifyDemandPattern(quantities).value.pattern

  // 2. Forecast next month — autoForecast routes by that pattern internally.
  const forecast = forecasting.autoForecast(quantities, { horizon: 1 })
  const nextMonth = forecast.value.forecast[0] ?? 0

  // 3. Safety stock from demand + lead-time variability (lead time is in days;
  //    convert to the monthly demand period before combining).
  const itemLeadTimes = leadTimes
    .filter((l) => l.itemId === s.itemId)
    .map((l) => l.leadTimeDays / DAYS_PER_MONTH)
  const ss = inventory.safetyStock(
    {
      meanDemand: mean(quantities),
      meanLeadTime: mean(itemLeadTimes),
      demandStdDev: standardDeviation(quantities),
      leadTimeStdDev: standardDeviation(itemLeadTimes),
      series: quantities,
    },
    { method: 'auto', serviceLevel: 0.95 },
  )

  // 4. Reorder point.
  const rop = inventory.reorderPoint({
    meanDemand: mean(quantities),
    meanLeadTime: mean(itemLeadTimes),
    safetyStock: ss.value,
  })

  console.log(
    [s.itemId, pattern, nextMonth.toFixed(1), ss.value.toFixed(1), rop.value.toFixed(1)]
      .map((c) => String(c).padEnd(14))
      .join(''),
  )
}

// 5. One call surfaces everything that needs attention across the catalogue.
const problems = inventory.issues(stock, demand, leadTimes, {
  serviceLevel: 0.95,
  granularity: 'month',
})

console.log('\nIssue analyser — items needing attention:\n')
const flagged = problems.value.filter((i) => i.flags.length > 0)
if (flagged.length === 0) {
  console.log('  (none)')
} else {
  for (const item of flagged) {
    console.log(`  ${item.itemId}: ${item.flags.join(', ')}`)
  }
}
console.log()
