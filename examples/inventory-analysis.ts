/**
 * Inventory analysis via the stateful `InventoryAnalyzer` convenience wrapper.
 *
 * When you hold one dataset and want to run several analyses over it, the
 * wrapper saves passing stock/demand/leadTimes to every call. It holds no
 * source of truth — each method still returns the underlying pure function's
 * own `Explained` result.
 *
 *   ABC-XYZ policy matrix   →  where each SKU sits on value × variability
 *   coverage / turnover     →  how much stock, expressed in days
 *   issue flags             →  what needs action
 *
 * This is the workflow the `inventory-analysis` agent skill describes.
 *
 * Run with:  pnpm example:inventory-analysis
 */
import { InventoryAnalyzer, core } from 'logistics-ts'

const { generateExampleData } = core

const { demand, stock, leadTimes } = generateExampleData({
  items: 8,
  periods: 24,
  profile: 'mixed',
  seed: 3,
})

const analyzer = new InventoryAnalyzer({ demand, stock, leadTimes })

// 1. ABC-XYZ policy matrix — value axis (ABC) × variability axis (XYZ). Each
//    cell carries a policy hint (AX → automate, low buffer; CZ → make-to-order).
const matrix = analyzer.abcXyz({ granularity: 'month' })
console.log('\nABC-XYZ policy matrix:\n')
console.log(['item', 'class', 'policy hint'].map((h, i) => h.padEnd(i === 2 ? 40 : 10)).join(''))
console.log('-'.repeat(58))
for (const cell of matrix.value) {
  console.log(cell.itemId.padEnd(10) + cell.class.padEnd(10) + cell.policyHint.padEnd(40))
}

// 2. Coverage — days of inventory on hand (always calendar days, whatever the
//    demand-bucketing granularity).
const coverage = analyzer.coverage({ granularity: 'month' })
console.log('\nCoverage (days of inventory on hand):\n')
for (const row of coverage.value) {
  const days = Number.isFinite(row.daysOfInventory) ? `${row.daysOfInventory.toFixed(0)} days` : '∞'
  console.log(`  ${row.itemId}: ${days}`)
}

// 3. Issues — the one call that flags everything needing attention.
const issues = analyzer.issues({ serviceLevel: 0.95, granularity: 'month' })
console.log('\nIssues:\n')
const flagged = issues.value.filter((i) => i.flags.length > 0)
if (flagged.length === 0) {
  console.log('  (none)')
} else {
  for (const item of flagged) {
    console.log(`  ${item.itemId}: ${item.flags.join(', ')}`)
  }
}
console.log()
