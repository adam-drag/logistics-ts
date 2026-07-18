import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { mrpGrid } from './grid'

describe('mrpGrid', () => {
  it('reproduces a full time-phased record row-for-row (hand-derived)', () => {
    // HAND-DERIVED — not a textbook golden. Worked by hand below, following the
    // standard MRP netting recursion (Orlicky; Jacobs & Chase, MRP time-phased
    // record), lot-for-lot, no lead-time offset.
    //
    // onHand = 25, GR = [0, 30, 20, 0, 40, 25], SR = [0, 20, 0, 0, 0, 0]
    //
    //  t | GR | SR | PAB_prev | net = max(0, GR−PAB_prev−SR) | PORcpt | PAB
    //  0 |  0 |  0 |   25     | max(0,  0−25− 0) =  0        |   0    | 25+0+0−0  = 25
    //  1 | 30 | 20 |   25     | max(0, 30−25−20) =  0        |   0    | 25+20+0−30 = 15
    //  2 | 20 |  0 |   15     | max(0, 20−15− 0) =  5        |   5    | 15+0+5−20  =  0
    //  3 |  0 |  0 |    0     | max(0,  0− 0− 0) =  0        |   0    |  0
    //  4 | 40 |  0 |    0     | max(0, 40− 0− 0) = 40        |  40    |  0+0+40−40 =  0
    //  5 | 25 |  0 |    0     | max(0, 25− 0− 0) = 25        |  25    |  0
    //
    // Conservation: 25 + 20 + (5+40+25) = 115 = ΣGR (115) + final PAB (0). ✓
    const result = mrpGrid({
      grossRequirements: [0, 30, 20, 0, 40, 25],
      scheduledReceipts: [0, 20, 0, 0, 0, 0],
      onHand: 25,
    })
    expect(result.value.rows).toEqual([
      {
        period: 0,
        grossRequirements: 0,
        scheduledReceipts: 0,
        projectedAvailableBalance: 25,
        netRequirements: 0,
        plannedOrderReceipt: 0,
      },
      {
        period: 1,
        grossRequirements: 30,
        scheduledReceipts: 20,
        projectedAvailableBalance: 15,
        netRequirements: 0,
        plannedOrderReceipt: 0,
      },
      {
        period: 2,
        grossRequirements: 20,
        scheduledReceipts: 0,
        projectedAvailableBalance: 0,
        netRequirements: 5,
        plannedOrderReceipt: 5,
      },
      {
        period: 3,
        grossRequirements: 0,
        scheduledReceipts: 0,
        projectedAvailableBalance: 0,
        netRequirements: 0,
        plannedOrderReceipt: 0,
      },
      {
        period: 4,
        grossRequirements: 40,
        scheduledReceipts: 0,
        projectedAvailableBalance: 0,
        netRequirements: 40,
        plannedOrderReceipt: 40,
      },
      {
        period: 5,
        grossRequirements: 25,
        scheduledReceipts: 0,
        projectedAvailableBalance: 0,
        netRequirements: 25,
        plannedOrderReceipt: 25,
      },
    ])
  })

  it('asserts the documented @example outputs exactly (doctest)', () => {
    expect(
      mrpGrid({ grossRequirements: [0, 30, 20], scheduledReceipts: [0, 20], onHand: 25 }).value
        .rows,
    ).toEqual([
      {
        period: 0,
        grossRequirements: 0,
        scheduledReceipts: 0,
        projectedAvailableBalance: 25,
        netRequirements: 0,
        plannedOrderReceipt: 0,
      },
      {
        period: 1,
        grossRequirements: 30,
        scheduledReceipts: 20,
        projectedAvailableBalance: 15,
        netRequirements: 0,
        plannedOrderReceipt: 0,
      },
      {
        period: 2,
        grossRequirements: 20,
        scheduledReceipts: 0,
        projectedAvailableBalance: 0,
        netRequirements: 5,
        plannedOrderReceipt: 5,
      },
    ])
  })

  it('exposes the explanation contract (method, inputs, citations)', () => {
    const result = mrpGrid({ grossRequirements: [10, 10], onHand: 5 })
    expect(result.method).toBe('mrp-netting-grid')
    expect(result.inputs.periods).toBe(2)
    expect(result.inputs.onHand).toBe(5)
    expect(result.inputs.totalGrossRequirements).toBe(20)
    expect(result.inputs.totalPlannedOrderReceipts).toBe(15)
    expect(result.inputs.plannedOrders).toBe(2)
    expect(result.citations).toContain(
      'Orlicky, J. (1975), Material Requirements Planning, McGraw-Hill.',
    )
  })

  it('returns no rows for an empty horizon', () => {
    expect(mrpGrid({ grossRequirements: [], onHand: 100 }).value.rows).toEqual([])
  })

  it('plans nothing for all-zero demand, carrying onHand forward unchanged', () => {
    const rows = mrpGrid({ grossRequirements: [0, 0, 0], onHand: 40 }).value.rows
    expect(rows.map((r) => r.projectedAvailableBalance)).toEqual([40, 40, 40])
    expect(rows.every((r) => r.plannedOrderReceipt === 0)).toBe(true)
  })

  it('plans no orders when onHand exceeds total demand', () => {
    const rows = mrpGrid({ grossRequirements: [10, 20, 30], onHand: 100 }).value.rows
    expect(rows.every((r) => r.netRequirements === 0 && r.plannedOrderReceipt === 0)).toBe(true)
    expect(rows.map((r) => r.projectedAvailableBalance)).toEqual([90, 70, 40])
  })

  it('treats an omitted scheduledReceipts array as all zeros', () => {
    const withOmitted = mrpGrid({ grossRequirements: [10, 20], onHand: 0 })
    const withExplicit = mrpGrid({
      grossRequirements: [10, 20],
      scheduledReceipts: [0, 0],
      onHand: 0,
    })
    expect(withOmitted.value.rows).toEqual(withExplicit.value.rows)
    expect(withOmitted.value.rows.map((r) => r.plannedOrderReceipt)).toEqual([10, 20])
  })

  it('plans nothing when a scheduled receipt alone covers the period requirement', () => {
    const rows = mrpGrid({
      grossRequirements: [50],
      scheduledReceipts: [50],
      onHand: 0,
    }).value.rows
    expect(rows[0]).toEqual({
      period: 0,
      grossRequirements: 50,
      scheduledReceipts: 50,
      projectedAvailableBalance: 0,
      netRequirements: 0,
      plannedOrderReceipt: 0,
    })
  })

  it('rejects a scheduledReceipts array longer than the horizon', () => {
    expect(() =>
      mrpGrid({ grossRequirements: [10], scheduledReceipts: [1, 2], onHand: 0 }),
    ).toThrow(/scheduledReceipts must not be longer/)
  })

  it('throws naming the offending field on invalid input', () => {
    expect(() => mrpGrid({ grossRequirements: [10], onHand: -1 })).toThrow(/onHand/)
    expect(() => mrpGrid({ grossRequirements: [10, -5], onHand: 0 })).toThrow(
      /grossRequirements\[1\]/,
    )
    expect(() =>
      mrpGrid({ grossRequirements: [10], scheduledReceipts: [Number.NaN], onHand: 0 }),
    ).toThrow(/scheduledReceipts\[0\]/)
  })

  // NOTE: an earlier version of this test asserted only the conservation
  // identity `onHand + ΣSR + ΣPORcpt === ΣGR + finalPAB`. That is vacuous: it
  // telescopes straight out of the PAB recursion, so it holds for ANY receipt
  // value (verified — it stays green with the netting rule replaced by `always
  // 999` and by `always 0`). It was replaced by the per-row re-derivation and
  // the lot-for-lot tightness assertion below, which are mutation-proven to
  // fail on: dropping SR from the netting, dropping PAB_prev, and `always 0`.
  it('re-derives every row’s netting and holds lot-for-lot tight (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 200 }), { maxLength: 20 }),
        fc.array(fc.nat({ max: 200 }), { maxLength: 20 }),
        fc.nat({ max: 500 }),
        (grossRequirements, receipts, onHand) => {
          const scheduledReceipts = receipts.slice(0, grossRequirements.length)
          const { rows } = mrpGrid({ grossRequirements, scheduledReceipts, onHand }).value

          expect(rows).toHaveLength(grossRequirements.length)

          // Walk the grid in order, re-deriving each row's netting from the
          // PREVIOUS row's balance — this is what actually constrains the rule.
          let previousBalance = onHand
          for (const row of rows) {
            const expectedNet = Math.max(
              0,
              row.grossRequirements - previousBalance - row.scheduledReceipts,
            )
            expect(row.netRequirements).toBe(expectedNet)
            // lot-for-lot: the receipt is exactly the net requirement...
            expect(row.plannedOrderReceipt).toBe(row.netRequirements)
            // ...and therefore tight — if you had to order, you ordered just
            // enough and finished the period at zero, never over-ordering.
            if (row.plannedOrderReceipt > 0) {
              expect(row.projectedAvailableBalance).toBe(0)
            }
            expect(row.projectedAvailableBalance).toBeGreaterThanOrEqual(0)
            expect(row.netRequirements).toBeGreaterThanOrEqual(0)
            previousBalance = row.projectedAvailableBalance
          }
        },
      ),
    )
  })
})
