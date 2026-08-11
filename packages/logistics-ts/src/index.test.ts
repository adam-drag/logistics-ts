import { describe, expect, it } from 'vitest'
import { classification, core, forecasting, InventoryAnalyzer, inventory, planning } from './index'

describe('logistics-ts umbrella', () => {
  it('re-exports every focused package under a namespace', () => {
    expect(typeof core.explain).toBe('function')
    expect(typeof classification.classifyDemandPattern).toBe('function')
    expect(typeof inventory.safetyStock).toBe('function')
    expect(typeof forecasting.autoForecast).toBe('function')
    expect(typeof planning.lotSize).toBe('function')
    expect(typeof planning.mrpGrid).toBe('function')
  })

  it('planning.mrpGrid actually RESOLVES and runs through the umbrella', () => {
    // A namespace re-export can typecheck while failing to resolve, so call the
    // function and assert on its output rather than only on `typeof`.
    const plan = planning.mrpGrid({
      grossRequirements: [0, 30, 20],
      scheduledReceipts: [0, 20],
      onHand: 25,
      leadTimePeriods: 1,
    })
    expect(plan.value.rows.map((r) => r.plannedOrderReceipt)).toEqual([0, 0, 5])
    expect(plan.value.rows.map((r) => r.plannedOrderRelease)).toEqual([0, 5, 0])
    expect(plan.value.plannedOrders).toEqual([
      { releasePeriod: 1, receiptPeriod: 2, quantity: 5, pastDue: false },
    ])
    expect(plan.method).toBe('mrp-netting-grid')
  })

  it('planning.wagnerWhitin resolves through the umbrella too', () => {
    const plan = planning.wagnerWhitin([90, 120, 80, 70], {
      setupCost: 500,
      holdingCostPerUnitPerPeriod: 2,
    })
    expect(plan.value.totalCost).toBe(1380)
  })

  it('InventoryAnalyzer wraps the pure inventory functions over a held dataset', () => {
    const analyzer = new InventoryAnalyzer({
      demand: [
        { itemId: 'A', date: '2026-01-01', quantity: 10, unitPrice: 5 },
        { itemId: 'A', date: '2026-01-02', quantity: 10, unitPrice: 5 },
        { itemId: 'A', date: '2026-01-03', quantity: 10, unitPrice: 5 },
      ],
      stock: [{ itemId: 'A', quantity: 15 }],
      leadTimes: [
        { itemId: 'A', leadTimeDays: 4 },
        { itemId: 'A', leadTimeDays: 6 },
        { itemId: 'A', leadTimeDays: 5 },
      ],
    })

    const abcXyz = analyzer.abcXyz()
    expect(abcXyz.value[0]?.itemId).toBe('A')

    const ss = analyzer.safetyStock('A', { serviceLevel: 0.95 })
    expect(ss.value).toBeGreaterThanOrEqual(0)

    const issues = analyzer.issues({ serviceLevel: 0.95 })
    expect(issues.value.find((r) => r.itemId === 'A')?.flags).toContain('below-rop')

    expect(analyzer.coverage().value[0]?.itemId).toBe('A')
    expect(analyzer.turnover().value[0]?.itemId).toBe('A')
  })

  it('InventoryAnalyzer.safetyStock throws a clear error for an item with no lead-time records', () => {
    const analyzer = new InventoryAnalyzer({
      demand: [{ itemId: 'B', date: '2026-01-01', quantity: 10 }],
      stock: [{ itemId: 'B', quantity: 15 }],
    })
    expect(() => analyzer.safetyStock('B', { serviceLevel: 0.95 })).toThrow(/no lead-time records/)
  })
})
