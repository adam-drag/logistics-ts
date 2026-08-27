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

  describe('InventoryAnalyzer.plan', () => {
    // Stock and lead times come from the HELD dataset — that is the whole point
    // of planning through the analyzer rather than calling planRequirements.
    const analyzer = new InventoryAnalyzer({
      demand: [{ itemId: 'BIKE', date: '2026-03-02', quantity: 10 }],
      stock: [
        { itemId: 'WHEEL', quantity: 40, locationId: 'W1' },
        { itemId: 'WHEEL', quantity: 10, locationId: 'W2' },
      ],
      leadTimes: [
        { itemId: 'BIKE', leadTimeDays: 7 },
        // Mean 10 days at weekly buckets = 1.43 weeks, which must round UP to 2.
        { itemId: 'WHEEL', leadTimeDays: 8 },
        { itemId: 'WHEEL', leadTimeDays: 12 },
      ],
    })
    const bom = [{ parentId: 'BIKE', childId: 'WHEEL', quantityPer: 2 }]
    const masterSchedule = [{ itemId: 'BIKE', date: '2026-03-23', quantity: 100 }]

    it('derives on-hand and lead times from the held dataset', () => {
      const plan = analyzer.plan({ bom, masterSchedule, granularity: 'week', start: '2026-03-02' })

      expect(plan.value.periods).toEqual(['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23'])
      // BIKE: 100 needed in period 3, lead time 7 days = 1 week, no stock held.
      expect(plan.value.items.BIKE?.rows.map((r) => r.plannedOrderRelease)).toEqual([0, 0, 100, 0])
      // WHEEL: 200 gross in period 2, minus 50 on hand SUMMED across W1 and W2,
      // = 150 net, released 2 periods earlier (10 days rounded up to 2 weeks).
      expect(plan.value.items.WHEEL?.grossRequirements).toEqual([0, 0, 200, 0])
      expect(plan.value.items.WHEEL?.rows.map((r) => r.plannedOrderRelease)).toEqual([150, 0, 0, 0])
    })

    it('rounds a derived lead time UP, never down', () => {
      // Rounding 10 days down to 1 week would release WHEEL in period 1 and
      // claim a plan that cannot physically arrive in time.
      const plan = analyzer.plan({ bom, masterSchedule, granularity: 'week', start: '2026-03-02' })
      expect(plan.value.items.WHEEL?.plannedOrders[0]?.releasePeriod).toBe(0)
    })

    it('lets a per-item override win over the derived value', () => {
      const plan = analyzer.plan({
        bom,
        masterSchedule,
        granularity: 'week',
        start: '2026-03-02',
        items: { WHEEL: { leadTimePeriods: 0 } },
      })
      expect(plan.value.items.WHEEL?.rows.map((r) => r.plannedOrderRelease)).toEqual([0, 0, 150, 0])
    })

    it('keeps derived fields when an override sets only one other field', () => {
      const plan = analyzer.plan({
        bom,
        masterSchedule,
        granularity: 'week',
        start: '2026-03-02',
        items: { WHEEL: { safetyStock: 20 } },
      })
      // On-hand 50 and lead time 2 are still the derived ones; only the floor
      // was supplied, which raises the net from 150 to 170.
      expect(plan.value.items.WHEEL?.rows.map((r) => r.plannedOrderRelease)).toEqual([170, 0, 0, 0])
    })

    it('plans an item with no stock and no lead-time records as zero and lot-for-lot', () => {
      const bare = new InventoryAnalyzer({ demand: [], stock: [] })
      const plan = bare.plan({ bom, masterSchedule, granularity: 'week' })
      expect(plan.value.items.WHEEL?.rows.map((r) => r.plannedOrderRelease)).toEqual([200])
    })

    it('returns the planRequirements explanation unchanged', () => {
      const plan = analyzer.plan({ bom, masterSchedule, granularity: 'week' })
      expect(plan.method).toBe('mrp-plan-requirements')
      expect(plan.citations?.[0]).toMatch(/Orlicky/)
    })

    it('propagates a cyclic BOM as an error', () => {
      expect(() =>
        analyzer.plan({
          bom: [
            { parentId: 'A', childId: 'B', quantityPer: 1 },
            { parentId: 'B', childId: 'A', quantityPer: 1 },
          ],
          masterSchedule: [{ itemId: 'A', date: '2026-03-02', quantity: 1 }],
        }),
      ).toThrow(/cyclic/)
    })
  })
})
