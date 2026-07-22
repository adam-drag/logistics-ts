import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type LotSizeOptions, lotSize } from '../lot-sizing/lot-size'
import { mrpGrid } from './grid'

describe('mrpGrid', () => {
  // All six rules, kept in one shared list so every rule-parameterised property
  // samples the full family. Coverage matters: `PAB >= safetyStock` is VACUOUS
  // under lot-for-lot (the netting line forces it) and only bites under the
  // other five, where it tests that the rule never orders late. Do not narrow
  // this generator.
  const RULES: LotSizeOptions[] = [
    { rule: 'lot-for-lot', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
    { rule: 'foq', setupCost: 300, holdingCostPerUnitPerPeriod: 2, orderQuantity: 120 },
    { rule: 'poq', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
    { rule: 'silver-meal', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
    { rule: 'least-unit-cost', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
    { rule: 'wagner-whitin', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
  ]
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
        plannedOrderRelease: 0,
      },
      {
        period: 1,
        grossRequirements: 30,
        scheduledReceipts: 20,
        projectedAvailableBalance: 15,
        netRequirements: 0,
        plannedOrderReceipt: 0,
        plannedOrderRelease: 0,
      },
      {
        period: 2,
        grossRequirements: 20,
        scheduledReceipts: 0,
        projectedAvailableBalance: 0,
        netRequirements: 5,
        plannedOrderReceipt: 5,
        plannedOrderRelease: 5,
      },
      {
        period: 3,
        grossRequirements: 0,
        scheduledReceipts: 0,
        projectedAvailableBalance: 0,
        netRequirements: 0,
        plannedOrderReceipt: 0,
        plannedOrderRelease: 0,
      },
      {
        period: 4,
        grossRequirements: 40,
        scheduledReceipts: 0,
        projectedAvailableBalance: 0,
        netRequirements: 40,
        plannedOrderReceipt: 40,
        plannedOrderRelease: 40,
      },
      {
        period: 5,
        grossRequirements: 25,
        scheduledReceipts: 0,
        projectedAvailableBalance: 0,
        netRequirements: 25,
        plannedOrderReceipt: 25,
        plannedOrderRelease: 25,
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
        plannedOrderRelease: 0,
      },
      {
        period: 1,
        grossRequirements: 30,
        scheduledReceipts: 20,
        projectedAvailableBalance: 15,
        netRequirements: 0,
        plannedOrderReceipt: 0,
        plannedOrderRelease: 0,
      },
      {
        period: 2,
        grossRequirements: 20,
        scheduledReceipts: 0,
        projectedAvailableBalance: 0,
        netRequirements: 5,
        plannedOrderReceipt: 5,
        plannedOrderRelease: 5,
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
      plannedOrderRelease: 0,
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

  it('rejects a hole inside the horizon rather than reading it as zero demand', () => {
    // An untyped JS caller can hand over a sparse array or an explicit
    // `undefined`. Coalescing that to 0 silently plans against demand that was
    // never stated; a missing period inside the horizon is a caller bug.
    expect(() =>
      mrpGrid({ grossRequirements: [10, undefined as unknown as number, 5], onHand: 0 }),
    ).toThrow(/grossRequirements\[1\] must be finite and non-negative/)
    // A genuinely sparse array (a hole, not an explicit undefined) behaves the
    // same way — reading index 1 yields `undefined`.
    const sparse: number[] = [10, 5]
    delete sparse[1]
    expect(() => mrpGrid({ grossRequirements: sparse, onHand: 0 })).toThrow(
      /grossRequirements\[1\]/,
    )
    expect(() =>
      mrpGrid({
        grossRequirements: [10, 5],
        scheduledReceipts: [undefined as unknown as number, 1],
        onHand: 0,
      }),
    ).toThrow(/scheduledReceipts\[0\] must be finite and non-negative/)
    // A DELIBERATELY shorter scheduledReceipts array still defaults to zero —
    // that is the documented contract and must keep working.
    expect(
      mrpGrid({ grossRequirements: [10, 5], scheduledReceipts: [10], onHand: 0 }).value.rows.map(
        (r) => r.scheduledReceipts,
      ),
    ).toEqual([10, 0])
  })

  it('rejects a non-array horizon instead of returning an empty grid', () => {
    // `.length` on a non-array is `undefined`, so an unguarded implementation
    // plans nothing and reports success — an empty result hiding a caller bug.
    expect(() => mrpGrid({ grossRequirements: 5 as unknown as number[], onHand: 0 })).toThrow(
      /grossRequirements must be an array/,
    )
    expect(() =>
      mrpGrid({
        grossRequirements: [10],
        scheduledReceipts: 10 as unknown as number[],
        onHand: 0,
      }),
    ).toThrow(/scheduledReceipts must be an array/)
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

  describe('lead-time offset and planned order releases', () => {
    it('reproduces a worked grid with a lead-time offset (hand-derived)', () => {
      // HAND-DERIVED — not a textbook golden. Standard MRP time-phased record
      // with a lead-time offset (Orlicky; Jacobs & Chase), lot-for-lot, no floor.
      //
      // onHand = 20, leadTimePeriods = 2, GR = [10, 0, 40, 30, 0, 50], SR = [0, 0, 15, 0, 0, 0]
      //
      // Netting (the balance follows RECEIPTS; the lead time shifts only releases):
      //  t | GR | SR | PAB_prev | net = max(0, GR−PAB_prev−SR) | PORcpt | PAB
      //  0 | 10 |  0 |   20     | max(0, 10−20− 0) =  0        |   0    | 20+0+0−10  = 10
      //  1 |  0 |  0 |   10     | max(0,  0−10− 0) =  0        |   0    | 10
      //  2 | 40 | 15 |   10     | max(0, 40−10−15) = 15        |  15    | 10+15+15−40 = 0
      //  3 | 30 |  0 |    0     | max(0, 30− 0− 0) = 30        |  30    |  0
      //  4 |  0 |  0 |    0     | max(0,  0− 0− 0) =  0        |   0    |  0
      //  5 | 50 |  0 |    0     | max(0, 50− 0− 0) = 50        |  50    |  0
      //
      // Offset left by 2: receipt@2 → release@0, receipt@3 → release@1,
      // receipt@5 → release@3. All ≥ 0, so nothing is past due.
      //  release column: [15, 30, 0, 50, 0, 0]
      const plan = mrpGrid({
        grossRequirements: [10, 0, 40, 30, 0, 50],
        scheduledReceipts: [0, 0, 15, 0, 0, 0],
        onHand: 20,
        leadTimePeriods: 2,
      })
      const rows = plan.value.rows
      expect(rows.map((r) => r.projectedAvailableBalance)).toEqual([10, 10, 0, 0, 0, 0])
      expect(rows.map((r) => r.netRequirements)).toEqual([0, 0, 15, 30, 0, 50])
      expect(rows.map((r) => r.plannedOrderReceipt)).toEqual([0, 0, 15, 30, 0, 50])
      expect(rows.map((r) => r.plannedOrderRelease)).toEqual([15, 30, 0, 50, 0, 0])
      expect(plan.value.plannedOrders).toEqual([
        { releasePeriod: 0, receiptPeriod: 2, quantity: 15, pastDue: false },
        { releasePeriod: 1, receiptPeriod: 3, quantity: 30, pastDue: false },
        { releasePeriod: 3, receiptPeriod: 5, quantity: 50, pastDue: false },
      ])
      expect(plan.warnings).toBeUndefined()
    })

    it('asserts the documented @example outputs exactly (doctest)', () => {
      const plan = mrpGrid({
        grossRequirements: [0, 30, 20],
        scheduledReceipts: [0, 20],
        onHand: 25,
        leadTimePeriods: 1,
      })
      expect(plan.value.rows.map((r) => r.projectedAvailableBalance)).toEqual([25, 15, 0])
      expect(plan.value.rows.map((r) => r.netRequirements)).toEqual([0, 0, 5])
      expect(plan.value.rows.map((r) => r.plannedOrderReceipt)).toEqual([0, 0, 5])
      expect(plan.value.rows.map((r) => r.plannedOrderRelease)).toEqual([0, 5, 0])
      expect(plan.value.plannedOrders).toEqual([
        { releasePeriod: 1, receiptPeriod: 2, quantity: 5, pastDue: false },
      ])
    })

    it('reproduces increment 2 behaviour exactly at leadTimePeriods = 0', () => {
      // The offset must be genuinely opt-in: with L = 0 the release column
      // simply mirrors the receipt column and nothing else moves.
      const input = {
        grossRequirements: [40, 60, 0, 90, 70],
        scheduledReceipts: [20, 0, 0, 0, 50],
        onHand: 55,
        safetyStock: 15,
        lotRule: {
          rule: 'wagner-whitin',
          setupCost: 300,
          holdingCostPerUnitPerPeriod: 2,
        } satisfies LotSizeOptions,
      }
      const explicit = mrpGrid({ ...input, leadTimePeriods: 0 })
      const defaulted = mrpGrid(input)
      expect(defaulted.value.rows).toEqual(explicit.value.rows)
      for (const row of explicit.value.rows) {
        expect(row.plannedOrderRelease).toBe(row.plannedOrderReceipt)
      }
      expect(explicit.value.plannedOrders.every((o) => o.releasePeriod === o.receiptPeriod)).toBe(
        true,
      )
      expect(explicit.warnings).toBeUndefined()
    })

    describe('past-due releases', () => {
      // onHand = 0, GR = [25, 0, 40], leadTimePeriods = 2. Net = [25, 0, 40].
      // receipt@0 → release@−2 (past due by 2), receipt@2 → release@0 (fine).
      const pastDuePlan = () =>
        mrpGrid({ grossRequirements: [25, 0, 40], onHand: 0, leadTimePeriods: 2 })

      it('keeps the receipt rather than dropping the demand', () => {
        const rows = pastDuePlan().value.rows
        expect(rows.map((r) => r.plannedOrderReceipt)).toEqual([25, 0, 40])
        expect(rows.map((r) => r.projectedAvailableBalance)).toEqual([0, 0, 0])
      })

      it('does not clamp the release into period 0', () => {
        const plan = pastDuePlan()
        // Period 0 carries ONLY the feasible release (the 40 for period 2), not
        // the past-due 25 folded in as though it could still be actioned.
        expect(plan.value.rows.map((r) => r.plannedOrderRelease)).toEqual([40, 0, 0])
        expect(plan.value.plannedOrders).toEqual([
          { releasePeriod: -2, receiptPeriod: 0, quantity: 25, pastDue: true },
          { releasePeriod: 0, receiptPeriod: 2, quantity: 40, pastDue: false },
        ])
      })

      it('warns, naming the periods, quantities, and how late each order is', () => {
        const plan = pastDuePlan()
        expect(plan.warnings).toBeDefined()
        const warning = plan.warnings?.join(' ') ?? ''
        expect(warning).toContain('PAST DUE')
        expect(warning).toContain('25 units needed in period 0')
        expect(warning).toContain('released in period -2')
        expect(warning).toContain('2 period(s) ago')
        expect(plan.inputs.pastDueOrders).toBe(1)
      })

      it('emits no warning when every release is feasible', () => {
        expect(
          mrpGrid({ grossRequirements: [0, 0, 40], onHand: 0, leadTimePeriods: 2 }).warnings,
        ).toBeUndefined()
      })
    })

    it('rejects a negative, fractional, or non-finite leadTimePeriods', () => {
      const base = { grossRequirements: [10], onHand: 0 }
      expect(() => mrpGrid({ ...base, leadTimePeriods: -1 })).toThrow(/leadTimePeriods/)
      // Fractional is rejected, not rounded: half a bucket is meaningless here.
      expect(() => mrpGrid({ ...base, leadTimePeriods: 1.5 })).toThrow(
        /non-negative integer number of periods/,
      )
      expect(() => mrpGrid({ ...base, leadTimePeriods: Number.NaN })).toThrow(/leadTimePeriods/)
    })

    it('narrates each planned order back to its cause, rule, and release', () => {
      const plan = mrpGrid({
        grossRequirements: [0, 0, 60],
        onHand: 0,
        leadTimePeriods: 1,
        lotRule: { rule: 'wagner-whitin', setupCost: 100, holdingCostPerUnitPerPeriod: 1 },
      })
      const narration = plan.reasoning.join('\n')
      expect(narration).toContain('planned order of 60')
      expect(narration).toContain("sized by 'wagner-whitin'")
      expect(narration).toContain('receive in period 2, release in period 1')
      expect(plan.inputs.leadTimePeriods).toBe(1)
    })

    it('names the period the need actually arises in, not the period ordered in', () => {
      // POQ orders at the START of every interval block, so with net = [0, 0,
      // 50, 0] it places the whole 50 in period 0 — a period whose net
      // requirement is ZERO. Naming the receipt period as "where the net
      // requirement first arises" pointed the reader at period 0, which needs
      // nothing; the need first arises in period 2.
      const plan = mrpGrid({
        grossRequirements: [0, 0, 50, 0],
        onHand: 0,
        lotRule: { rule: 'poq', setupCost: 300, holdingCostPerUnitPerPeriod: 2 },
      })
      expect(plan.value.plannedOrders).toEqual([
        { releasePeriod: 0, receiptPeriod: 0, quantity: 50, pastDue: false },
      ])
      const narration = plan.reasoning.filter((r) => r.startsWith('planned order')).join('\n')
      expect(narration).toContain('net requirement first arising in period 2')
      expect(narration).toContain('receive in period 0')
      expect(narration).not.toContain('first arising in period 0')

      // ...and the receipt period is still named when the order genuinely does
      // sit on the period of need, so the fix did not just relabel everything.
      const lfl = mrpGrid({ grossRequirements: [0, 0, 50, 0], onHand: 0 })
      expect(
        lfl.reasoning.some((r) => r.includes('net requirement first arising in period 2')),
      ).toBe(true)
      expect(lfl.reasoning.some((r) => r.includes('ordered ahead of it'))).toBe(false)
    })

    it('summarises instead of narrating every order on a long horizon', () => {
      // 30 nonzero periods under lot-for-lot ⇒ 30 orders, over the narration cap.
      const plan = mrpGrid({
        grossRequirements: new Array<number>(30).fill(10),
        onHand: 0,
        leadTimePeriods: 1,
      })
      expect(plan.value.plannedOrders).toHaveLength(30)
      expect(plan.reasoning.filter((r) => r.startsWith('planned order of'))).toHaveLength(0)
      expect(plan.reasoning.some((r) => r.includes('30 planned orders'))).toBe(true)
      // The full schedule is still available even when narration summarises.
      expect(plan.reasoning.some((r) => r.includes('read plannedOrders'))).toBe(true)
    })

    it('ties every release back to the net requirement that caused it (property)', () => {
      // DERIVATION CHECK: asserting `release_t === receipt_{t+L}` would be
      // vacuous — that IS how the column is built. Instead assert the property
      // against the INDEPENDENTLY recomputed net series and lot plan, which the
      // release column is never derived from: every planned order must pair a
      // lotSize-produced receipt with a release exactly L periods earlier, and
      // the feasible releases must sum to the lot plan minus the past-due part.
      fc.assert(
        fc.property(
          fc.array(fc.nat({ max: 120 }), { maxLength: 12 }),
          fc.nat({ max: 150 }),
          fc.nat({ max: 40 }),
          fc.nat({ max: 4 }),
          fc.constantFrom(...RULES),
          (grossRequirements, onHand, safetyStock, leadTimePeriods, lotRule) => {
            const plan = mrpGrid({
              grossRequirements,
              onHand,
              safetyStock,
              leadTimePeriods,
              lotRule,
            })
            const { rows, plannedOrders } = plan.value

            // Independent recomputation of pass 1 + pass 2.
            const netSeries: number[] = []
            let balance = onHand
            for (const gross of grossRequirements) {
              const net = Math.max(0, gross + safetyStock - balance)
              netSeries.push(net)
              balance = balance + net - gross
            }
            const expectedReceipts = new Array<number>(grossRequirements.length).fill(0)
            for (const order of lotSize(netSeries, lotRule).value.orders) {
              expectedReceipts[order.period] =
                (expectedReceipts[order.period] ?? 0) + order.quantity
            }

            // Every planned order pairs a genuine lot-sized receipt with a
            // release exactly L periods earlier.
            for (const order of plannedOrders) {
              expect(order.quantity).toBe(expectedReceipts[order.receiptPeriod])
              expect(order.receiptPeriod - order.releasePeriod).toBe(leadTimePeriods)
              expect(order.pastDue).toBe(order.releasePeriod < 0)
            }
            // Releases conserve the lot plan: everything ordered is either
            // released inside the horizon or reported past due, never lost.
            const releasedInHorizon = rows.reduce((s, r) => s + r.plannedOrderRelease, 0)
            const pastDueQty = plannedOrders
              .filter((o) => o.pastDue)
              .reduce((s, o) => s + o.quantity, 0)
            expect(releasedInHorizon + pastDueQty).toBe(expectedReceipts.reduce((s, q) => s + q, 0))
            // A past-due order must be warned about, never silently absorbed.
            expect(plan.warnings !== undefined).toBe(pastDueQty > 0)
            // Every period the narration blames for an order must genuinely
            // HAVE a net requirement in the independently recomputed series.
            // This constrains the attribution, which is derived from the
            // receipt column and cannot be checked against it.
            for (const line of plan.reasoning) {
              const match = /first arising in period (\d+)/.exec(line)
              if (match?.[1] !== undefined) {
                expect(netSeries[Number(match[1])]).toBeGreaterThan(0)
              }
            }
          },
        ),
      )
    })
  })
})
