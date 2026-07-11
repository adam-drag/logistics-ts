import { describe, expect, it } from 'vitest'
import { loadDemand, loadLeadTimes, loadStock } from './loader'
import type { TableSource } from './table-source'

describe('loadDemand — input shapes', () => {
  it('reads row objects using default (identity) column names', () => {
    const { records, issues } = loadDemand([
      { itemId: 'A', date: '2026-01-01', quantity: 5 },
      { itemId: 'A', date: '2026-01-02', quantity: 7 },
    ])
    expect(issues).toEqual([])
    expect(records).toEqual([
      { itemId: 'A', date: '2026-01-01', quantity: 5 },
      { itemId: 'A', date: '2026-01-02', quantity: 7 },
    ])
  })

  it('applies a column mapping', () => {
    const { records } = loadDemand([{ sku: 'A', txn_date: '2026-01-01', qty: 5, price: 2.5 }], {
      itemId: 'sku',
      date: 'txn_date',
      quantity: 'qty',
      unitPrice: 'price',
    })
    expect(records[0]).toEqual({ itemId: 'A', date: '2026-01-01', quantity: 5, unitPrice: 2.5 })
  })

  it('reads columnar input', () => {
    const { records } = loadDemand({
      itemId: ['A', 'B'],
      date: ['2026-01-01', '2026-01-02'],
      quantity: [5, 6],
    })
    expect(records.map((r) => r.itemId)).toEqual(['A', 'B'])
    expect(records.map((r) => r.quantity)).toEqual([5, 6])
  })

  it('reads a TableSource adapter', () => {
    const columns: Record<string, unknown[]> = {
      itemId: ['A', 'B'],
      date: ['2026-01-01', '2026-01-02'],
      quantity: [5, 6],
    }
    const source: TableSource = {
      numRows: 2,
      columnNames: Object.keys(columns),
      getColumn: (name) => columns[name] ?? [],
    }
    const { records } = loadDemand(source)
    expect(records.map((r) => r.quantity)).toEqual([5, 6])
  })
})

describe('loadDemand — coercion and validation', () => {
  it('coerces numeric strings (CSV-style cells)', () => {
    const { records, issues } = loadDemand([{ itemId: 'A', date: '2026-01-01', quantity: '5' }])
    expect(issues).toEqual([])
    expect(records[0]?.quantity).toBe(5)
  })

  it('collects an issue and skips the row for a non-numeric quantity', () => {
    const { records, issues } = loadDemand([
      { itemId: 'A', date: '2026-01-01', quantity: 'abc' },
      { itemId: 'A', date: '2026-01-02', quantity: 3 },
    ])
    expect(records).toHaveLength(1)
    expect(records[0]?.quantity).toBe(3)
    expect(issues).toEqual([{ row: 0, column: 'quantity', problem: 'expected a finite number' }])
  })

  it('rejects negative quantities and unparseable dates and empty item ids', () => {
    const { records, issues } = loadDemand([
      { itemId: 'A', date: '2026-01-01', quantity: -1 },
      { itemId: 'A', date: 'not-a-date', quantity: 1 },
      { itemId: '', date: '2026-01-01', quantity: 1 },
    ])
    expect(records).toHaveLength(0)
    expect(issues.map((i) => i.column)).toEqual(['quantity', 'date', 'itemId'])
  })

  it('throws on a missing required column (structural error)', () => {
    expect(() => loadDemand([{ itemId: 'A', date: '2026-01-01' }])).toThrow(
      /missing required column/i,
    )
  })

  it('does not treat an inherited property name as a column', () => {
    // 'toString' exists on the prototype but is not an own column, so mapping to
    // it is a structural error rather than a false positive.
    expect(() =>
      loadDemand([{ itemId: 'A', date: '2026-01-01', quantity: 1 }], { quantity: 'toString' }),
    ).toThrow(/missing required column/i)
  })

  it('does not treat a sparse first row as a missing column', () => {
    // The first row omits quantity but a later row has it — the column exists.
    const { records, issues } = loadDemand([
      { itemId: 'A', date: '2026-01-01' },
      { itemId: 'A', date: '2026-01-02', quantity: 4 },
    ])
    expect(records).toEqual([{ itemId: 'A', date: '2026-01-02', quantity: 4 }])
    expect(issues).toEqual([{ row: 0, column: 'quantity', problem: 'expected a finite number' }])
  })

  it('throws on the first issue when throwOnIssue is set', () => {
    expect(() =>
      loadDemand([{ itemId: 'A', date: '2026-01-01', quantity: 'x' }], {}, { throwOnIssue: true }),
    ).toThrow(/row 0/i)
  })
})

describe('loadStock / loadLeadTimes', () => {
  it('loads stock with optional cost and location', () => {
    const { records } = loadStock([{ itemId: 'A', quantity: 100, unitCost: 3, locationId: 'W1' }])
    expect(records[0]).toEqual({ itemId: 'A', quantity: 100, unitCost: 3, locationId: 'W1' })
  })

  it('loads lead times and keeps one record per observation', () => {
    const { records, issues } = loadLeadTimes([
      { itemId: 'A', leadTimeDays: 14 },
      { itemId: 'A', leadTimeDays: 21 },
    ])
    expect(issues).toEqual([])
    expect(records.map((r) => r.leadTimeDays)).toEqual([14, 21])
  })
})

describe('empty input', () => {
  it('loads zero records from an empty row array instead of throwing', () => {
    expect(loadDemand([])).toEqual({ records: [], issues: [] })
    expect(loadStock([])).toEqual({ records: [], issues: [] })
    expect(loadLeadTimes([])).toEqual({ records: [], issues: [] })
  })

  it('loads zero records from empty columnar input', () => {
    expect(loadDemand({ itemId: [], date: [], quantity: [] })).toEqual({
      records: [],
      issues: [],
    })
    expect(loadDemand({})).toEqual({ records: [], issues: [] })
  })
})

describe('optional-column validation', () => {
  it('keeps the row but records an issue for a non-numeric optional unitPrice', () => {
    const { records, issues } = loadDemand([
      { itemId: 'A', date: '2026-01-01', quantity: 1, unitPrice: 'abc' },
    ])
    expect(records).toEqual([{ itemId: 'A', date: '2026-01-01', quantity: 1 }])
    expect(issues).toEqual([{ row: 0, column: 'unitPrice', problem: 'expected a finite number' }])
  })

  it('rejects a negative optional unitPrice / unitCost', () => {
    const demand = loadDemand([{ itemId: 'A', date: '2026-01-01', quantity: 1, unitPrice: -5 }])
    expect(demand.records[0]).toEqual({ itemId: 'A', date: '2026-01-01', quantity: 1 })
    expect(demand.issues).toEqual([
      { row: 0, column: 'unitPrice', problem: 'must not be negative' },
    ])

    const stock = loadStock([{ itemId: 'A', quantity: 10, unitCost: -1 }])
    expect(stock.records[0]).toEqual({ itemId: 'A', quantity: 10 })
    expect(stock.issues).toEqual([{ row: 0, column: 'unitCost', problem: 'must not be negative' }])
  })

  it('records an issue for an unparseable optional date', () => {
    const { records, issues } = loadStock([{ itemId: 'A', quantity: 10, timestamp: 'not-a-date' }])
    expect(records).toEqual([{ itemId: 'A', quantity: 10 }])
    expect(issues.map((i) => i.column)).toEqual(['timestamp'])
  })

  it('does not report absent optional cells as issues', () => {
    const { records, issues } = loadDemand([
      { itemId: 'A', date: '2026-01-01', quantity: 1, unitPrice: '' },
    ])
    expect(records).toEqual([{ itemId: 'A', date: '2026-01-01', quantity: 1 }])
    expect(issues).toEqual([])
  })

  it('throws on a mapped optional column that does not exist (structural error)', () => {
    expect(() =>
      loadDemand([{ sku: 'A', date: '2026-01-01', quantity: 1 }], {
        itemId: 'sku',
        unitPrice: 'price_typo',
      }),
    ).toThrow(/missing required column.*price_typo/i)
  })

  it('does not require unmapped optional columns', () => {
    const { records, issues } = loadDemand([{ itemId: 'A', date: '2026-01-01', quantity: 1 }])
    expect(records).toHaveLength(1)
    expect(issues).toEqual([])
  })
})
