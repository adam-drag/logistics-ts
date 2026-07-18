import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type LotSizeOptions, lotSize } from '../lot-sizing/lot-size'
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
        fc.nat({ max: 100 }),
        (grossRequirements, receipts, onHand, safetyStock) => {
          const scheduledReceipts = receipts.slice(0, grossRequirements.length)
          const { rows } = mrpGrid({
            grossRequirements,
            scheduledReceipts,
            onHand,
            safetyStock,
          }).value

          expect(rows).toHaveLength(grossRequirements.length)

          // Walk the grid in order, re-deriving each row's netting from the
          // PREVIOUS row's balance — this is what actually constrains the rule.
          let previousBalance = onHand
          for (const row of rows) {
            const expectedNet = Math.max(
              0,
              row.grossRequirements + safetyStock - previousBalance - row.scheduledReceipts,
            )
            expect(row.netRequirements).toBe(expectedNet)
            // lot-for-lot (the default rule here): the receipt is exactly the
            // net requirement...
            expect(row.plannedOrderReceipt).toBe(row.netRequirements)
            // ...and therefore tight — if you had to order, you ordered just
            // enough and finished the period ON the floor, never over-ordering.
            // This holds for lot-for-lot ONLY; see the all-rules property below
            // for what survives when a rule may order early.
            if (row.plannedOrderReceipt > 0) {
              expect(row.projectedAvailableBalance).toBe(safetyStock)
            }
            expect(row.projectedAvailableBalance).toBeGreaterThanOrEqual(0)
            expect(row.netRequirements).toBeGreaterThanOrEqual(0)
            previousBalance = row.projectedAvailableBalance
          }
        },
      ),
    )
  })

  describe('safety-stock floor', () => {
    it('reproduces a worked grid with a non-zero floor (hand-derived)', () => {
      // HAND-DERIVED — not a textbook golden. Standard MRP netting against a
      // safety-stock floor (Orlicky; Jacobs & Chase), lot-for-lot, no offset.
      //
      // onHand = 30, safetyStock = 10, GR = [20, 15, 0, 25, 30], SR = [0, 0, 10, 0, 0]
      //
      //  t | GR | SR | PAB_prev | net = max(0, GR+SS−PAB_prev−SR) | PORcpt | PAB
      //  0 | 20 |  0 |   30     | max(0, 20+10−30− 0) =  0        |   0    | 30+0+0−20   = 10
      //  1 | 15 |  0 |   10     | max(0, 15+10−10− 0) = 15        |  15    | 10+0+15−15  = 10
      //  2 |  0 | 10 |   10     | max(0,  0+10−10−10) =  0        |   0    | 10+10+0−0   = 20
      //  3 | 25 |  0 |   20     | max(0, 25+10−20− 0) = 15        |  15    | 20+0+15−25  = 10
      //  4 | 30 |  0 |   10     | max(0, 30+10−10− 0) = 30        |  30    | 10+0+30−30  = 10
      //
      // The balance sits exactly on the floor of 10 whenever an order is placed. ✓
      const rows = mrpGrid({
        grossRequirements: [20, 15, 0, 25, 30],
        scheduledReceipts: [0, 0, 10, 0, 0],
        onHand: 30,
        safetyStock: 10,
      }).value.rows
      expect(rows.map((r) => r.netRequirements)).toEqual([0, 15, 0, 15, 30])
      expect(rows.map((r) => r.plannedOrderReceipt)).toEqual([0, 15, 0, 15, 30])
      expect(rows.map((r) => r.projectedAvailableBalance)).toEqual([10, 10, 20, 10, 10])
      expect(rows.map((r) => r.grossRequirements)).toEqual([20, 15, 0, 25, 30])
      expect(rows.map((r) => r.scheduledReceipts)).toEqual([0, 0, 10, 0, 0])
      expect(rows.map((r) => r.period)).toEqual([0, 1, 2, 3, 4])
    })

    it('forces an order the floor alone requires, with zero demand in the period', () => {
      // GR = 0 everywhere, but onHand (5) sits below the floor (10): net =
      // max(0, 0 + 10 − 5 − 0) = 5 in period 0, replenishing up to the floor.
      const rows = mrpGrid({ grossRequirements: [0, 0], onHand: 5, safetyStock: 10 }).value.rows
      expect(rows.map((r) => r.plannedOrderReceipt)).toEqual([5, 0])
      expect(rows.map((r) => r.projectedAvailableBalance)).toEqual([10, 10])
    })

    it('defaults safetyStock to 0, matching an explicit zero', () => {
      const input = { grossRequirements: [10, 20], onHand: 5 }
      expect(mrpGrid(input).value.rows).toEqual(mrpGrid({ ...input, safetyStock: 0 }).value.rows)
    })

    it('rejects a negative or non-finite safetyStock', () => {
      expect(() => mrpGrid({ grossRequirements: [10], onHand: 0, safetyStock: -1 })).toThrow(
        /safetyStock/,
      )
      expect(() =>
        mrpGrid({ grossRequirements: [10], onHand: 0, safetyStock: Number.NaN }),
      ).toThrow(/safetyStock/)
    })

    it('states the floor and the rule in the explanation', () => {
      const withFloor = mrpGrid({ grossRequirements: [10], onHand: 0, safetyStock: 7 })
      expect(withFloor.inputs.safetyStock).toBe(7)
      expect(withFloor.inputs.lotRule).toBe('lot-for-lot')
      expect(withFloor.reasoning.some((r) => r.includes('safety-stock floor of 7'))).toBe(true)

      const noFloor = mrpGrid({ grossRequirements: [10], onHand: 0 })
      expect(noFloor.reasoning.some((r) => r.includes('no safety-stock floor'))).toBe(true)
    })
  })

  describe('pluggable lot rules', () => {
    const RULES: LotSizeOptions[] = [
      { rule: 'lot-for-lot', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
      { rule: 'foq', setupCost: 300, holdingCostPerUnitPerPeriod: 2, orderQuantity: 120 },
      { rule: 'poq', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
      { rule: 'silver-meal', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
      { rule: 'least-unit-cost', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
      { rule: 'wagner-whitin', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
    ]
    const grossRequirements = [40, 60, 0, 90, 70, 30, 100]
    const scheduledReceipts = [20, 0, 0, 0, 50, 0, 0]
    const onHand = 55
    const safetyStock = 15

    for (const lotRule of RULES) {
      it(`delegates lot sizing to '${lotRule.rule}' rather than re-implementing it`, () => {
        const grid = mrpGrid({
          grossRequirements,
          scheduledReceipts,
          onHand,
          safetyStock,
          lotRule,
        })
        // The net-requirements SERIES is what gets lot-sized. Recover it from
        // the lot-for-lot grid, whose netRequirements column is exactly pass 1.
        const netSeries = mrpGrid({
          grossRequirements,
          scheduledReceipts,
          onHand,
          safetyStock,
        }).value.rows.map((r) => r.netRequirements)

        const expected = new Array<number>(grossRequirements.length).fill(0)
        for (const order of lotSize(netSeries, lotRule).value.orders) {
          expected[order.period] = (expected[order.period] ?? 0) + order.quantity
        }
        expect(grid.value.rows.map((r) => r.plannedOrderReceipt)).toEqual(expected)
        expect(grid.inputs.lotRule).toBe(lotRule.rule)
      })
    }

    it('threads the foq orderQuantity through instead of flattening it', () => {
      const rows = mrpGrid({
        grossRequirements: [30, 30, 30],
        onHand: 0,
        lotRule: {
          rule: 'foq',
          setupCost: 100,
          holdingCostPerUnitPerPeriod: 1,
          orderQuantity: 50,
        },
      }).value.rows
      // Every planned receipt must be the fixed lot size Q = 50, never a raw
      // net requirement of 30 — which is what a flattened/ignored option gives.
      for (const row of rows) {
        expect(row.plannedOrderReceipt % 50).toBe(0)
      }
      expect(rows.reduce((s, r) => s + r.plannedOrderReceipt, 0)).toBeGreaterThanOrEqual(90)
    })

    it('lets a horizon rule order early and carry surplus above the floor', () => {
      // Wagner-Whitin combines periods when setup dominates holding, so at
      // least one period must be covered by an EARLIER lot: netRequirements > 0
      // in pass 1 but plannedOrderReceipt === 0 in the rebuilt grid.
      const rows = mrpGrid({
        grossRequirements: [50, 50, 50, 50],
        onHand: 0,
        safetyStock: 10,
        lotRule: { rule: 'wagner-whitin', setupCost: 1000, holdingCostPerUnitPerPeriod: 1 },
      }).value.rows
      expect(rows.some((r) => r.plannedOrderReceipt === 0 && r.grossRequirements > 0)).toBe(true)
      expect(rows.some((r) => r.projectedAvailableBalance > 10)).toBe(true)
      expect(rows.every((r) => r.projectedAvailableBalance >= 10)).toBe(true)
    })

    it('does not claim lot-for-lot tightness in the reasoning of another rule', () => {
      const ww = mrpGrid({
        grossRequirements: [50, 50],
        onHand: 0,
        lotRule: { rule: 'wagner-whitin', setupCost: 1000, holdingCostPerUnitPerPeriod: 1 },
      })
      expect(ww.reasoning.some((r) => r.includes('wagner-whitin'))).toBe(true)
      expect(ww.reasoning.some((r) => r.includes('lands on the floor'))).toBe(false)
      expect(ww.reasoning.some((r) => r.includes('may order early'))).toBe(true)
    })

    it('holds the floor and non-negative receipts for EVERY rule (property)', () => {
      // The lot-for-lot tightness assertion is deliberately NOT made here — it
      // is false for FOQ/POQ/Silver-Meal/Wagner-Whitin, which legitimately
      // order more than the immediate net. What survives for every rule is the
      // floor and receipt non-negativity.
      fc.assert(
        fc.property(
          fc.array(fc.nat({ max: 120 }), { maxLength: 12 }),
          fc.nat({ max: 200 }),
          fc.nat({ max: 60 }),
          fc.constantFrom(...RULES),
          (grossReq, onHandValue, floor, lotRule) => {
            const { rows } = mrpGrid({
              grossRequirements: grossReq,
              onHand: onHandValue,
              safetyStock: floor,
              lotRule,
            }).value
            for (const row of rows) {
              expect(row.projectedAvailableBalance).toBeGreaterThanOrEqual(floor)
              expect(row.plannedOrderReceipt).toBeGreaterThanOrEqual(0)
              expect(row.netRequirements).toBeGreaterThanOrEqual(0)
            }
          },
        ),
      )
    })
  })
})
