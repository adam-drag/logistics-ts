import { describe, expect, it } from 'vitest'
import { InventoryAnalyzer, classification, core, forecasting, inventory } from './index'

describe('logistics-ts umbrella', () => {
  it('re-exports every focused package under a namespace', () => {
    expect(typeof core.explain).toBe('function')
    expect(typeof classification.classifyDemandPattern).toBe('function')
    expect(typeof inventory.safetyStock).toBe('function')
    expect(typeof forecasting.autoForecast).toBe('function')
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
})
