import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { planRequirements } from './plan-requirements'

describe('planRequirements', () => {
  it('asserts the documented @example outputs exactly (doctest)', () => {
    const plan = planRequirements({
      bom: [{ parentId: 'A', childId: 'B', quantityPer: 2 }],
      masterSchedule: [{ itemId: 'A', requirements: [0, 0, 0, 10] }],
      items: { A: { leadTimePeriods: 1 }, B: { leadTimePeriods: 2 } },
    })
    expect(plan.value.items.A?.rows.map((r) => r.plannedOrderRelease)).toEqual([0, 0, 10, 0])
    expect(plan.value.items.B?.grossRequirements).toEqual([0, 0, 20, 0])
    expect(plan.value.items.B?.rows.map((r) => r.plannedOrderRelease)).toEqual([20, 0, 0, 0])
  })

  it('echoes each item’s low-level code consistently with the structure-wide map', () => {
    // ItemPlan.lowLevelCode is the per-item echo of MultiLevelPlan.lowLevelCodes.
    // Tests pinned the map but never the echo, so the two could disagree — and
    // the echo is what a consumer reading one item's plan actually sees.
    // Diamond: C hangs off both A and B, so its code is the LONGEST path (2).
    const plan = planRequirements({
      bom: [
        { parentId: 'A', childId: 'B', quantityPer: 1 },
        { parentId: 'B', childId: 'C', quantityPer: 1 },
        { parentId: 'A', childId: 'C', quantityPer: 1 },
      ],
      masterSchedule: [{ itemId: 'A', requirements: [0, 0, 10] }],
      items: { A: { leadTimePeriods: 1 }, B: { leadTimePeriods: 1 }, C: { leadTimePeriods: 1 } },
    })
    expect(plan.value.lowLevelCodes).toEqual({ A: 0, B: 1, C: 2 })
    for (const [itemId, item] of Object.entries(plan.value.items)) {
      expect(item.lowLevelCode).toBe(plan.value.lowLevelCodes[itemId])
    }
    // And the planning order must be non-decreasing in low-level code: a parent
    // is always planned before anything that consumes its releases.
    const codes = plan.value.order.map((id) => plan.value.lowLevelCodes[id] ?? -1)
    expect(codes).toEqual([...codes].sort((a, b) => a - b))
  })

  it('drives components from the parent RELEASE, not its gross requirement', () => {
    // THE decisive test — it separates real MRP from a naive explosion, and it
    // fails in BOTH quantity and timing if you get it wrong.
    //
    // A: 100 required in period 4, 50 already on hand, lead time 2.
    //   net = 100 − 50 = 50 in period 4  ⇒  receipt p4  ⇒  RELEASE p2.
    // B: 3 per A.
    //   correct   → 3 × 50  = 150 in period 2   (follows A's release)
    //   naive     → 3 × 100 = 300 in period 4   (follows A's requirement:
    //               ignores A's stock AND its lead time)
    const plan = planRequirements({
      bom: [{ parentId: 'A', childId: 'B', quantityPer: 3 }],
      masterSchedule: [{ itemId: 'A', requirements: [0, 0, 0, 0, 100] }],
      items: { A: { onHand: 50, leadTimePeriods: 2 }, B: { leadTimePeriods: 1 } },
    })
    expect(plan.value.items.A?.rows.map((r) => r.plannedOrderRelease)).toEqual([0, 0, 50, 0, 0])
    expect(plan.value.items.B?.grossRequirements).toEqual([0, 0, 150, 0, 0])
    // ...and B's own lead time then shifts its release one earlier again.
    expect(plan.value.items.B?.rows.map((r) => r.plannedOrderRelease)).toEqual([0, 150, 0, 0, 0])
  })

  it('reproduces a three-level plan row for row (hand-derived)', () => {
    // HAND-DERIVED — not a textbook golden. Standard MRP explosion/netting
    // (Orlicky; Jacobs & Chase), lot-for-lot throughout.
    //
    // Structure: A ←2× B ←4× C.  MPS: 20 A in period 5.
    // Lead times: A 1, B 2, C 1.  On hand: A 0, B 10, C 0.
    //
    //  A: gross [0,0,0,0,0,20] onHand 0     → net p5 = 20, receipt p5, release p4
    //  B: gross = 2 × A.release = [0,0,0,0,40,0], onHand 10
    //       p4: net = 40 − 10 = 30, receipt p4, PAB 0; release p4−2 = p2
    //  C: gross = 4 × B.release = [0,0,120,0,0,0], onHand 0
    //       p2: net 120, receipt p2, release p1
    const plan = planRequirements({
      bom: [
        { parentId: 'A', childId: 'B', quantityPer: 2 },
        { parentId: 'B', childId: 'C', quantityPer: 4 },
      ],
      masterSchedule: [{ itemId: 'A', requirements: [0, 0, 0, 0, 0, 20] }],
      items: {
        A: { leadTimePeriods: 1 },
        B: { leadTimePeriods: 2, onHand: 10 },
        C: { leadTimePeriods: 1 },
      },
    })
    expect(plan.value.order).toEqual(['A', 'B', 'C'])
    expect(plan.value.items.A?.rows.map((r) => r.plannedOrderRelease)).toEqual([0, 0, 0, 0, 20, 0])

    expect(plan.value.items.B?.grossRequirements).toEqual([0, 0, 0, 0, 40, 0])
    expect(plan.value.items.B?.rows.map((r) => r.netRequirements)).toEqual([0, 0, 0, 0, 30, 0])
    expect(plan.value.items.B?.rows.map((r) => r.plannedOrderRelease)).toEqual([0, 0, 30, 0, 0, 0])

    expect(plan.value.items.C?.grossRequirements).toEqual([0, 0, 120, 0, 0, 0])
    expect(plan.value.items.C?.rows.map((r) => r.plannedOrderRelease)).toEqual([0, 120, 0, 0, 0, 0])
  })

  it('accumulates a component used at two different depths, after both parents', () => {
    // C hangs off A directly AND off B. Its low-level code is 2, so it must be
    // planned only once BOTH A's and B's releases have contributed.
    const plan = planRequirements({
      bom: [
        { parentId: 'A', childId: 'B', quantityPer: 1 },
        { parentId: 'A', childId: 'C', quantityPer: 1 },
        { parentId: 'B', childId: 'C', quantityPer: 1 },
      ],
      masterSchedule: [{ itemId: 'A', requirements: [0, 10] }],
    })
    // Zero lead times everywhere ⇒ release period == requirement period.
    expect(plan.value.lowLevelCodes).toEqual({ A: 0, B: 1, C: 2 })
    expect(plan.value.order).toEqual(['A', 'B', 'C'])
    // C gets 10 from A and 10 from B.
    expect(plan.value.items.C?.grossRequirements).toEqual([0, 20])
  })

  it('nets a component against its OWN stock, not just its parent’s', () => {
    const plan = planRequirements({
      bom: [{ parentId: 'A', childId: 'B', quantityPer: 1 }],
      masterSchedule: [{ itemId: 'A', requirements: [40] }],
      items: { B: { onHand: 25 } },
    })
    expect(plan.value.items.B?.grossRequirements).toEqual([40])
    expect(plan.value.items.B?.rows.map((r) => r.netRequirements)).toEqual([15])
  })

  it('honours a per-item lot rule instead of flattening everything to lot-for-lot', () => {
    const plan = planRequirements({
      bom: [{ parentId: 'A', childId: 'B', quantityPer: 1 }],
      masterSchedule: [{ itemId: 'A', requirements: [30, 30, 30] }],
      items: {
        B: {
          lotRule: {
            rule: 'foq',
            setupCost: 100,
            holdingCostPerUnitPerPeriod: 1,
            orderQuantity: 50,
          },
        },
      },
    })
    for (const row of plan.value.items.B?.rows ?? []) {
      expect(row.plannedOrderReceipt % 50).toBe(0)
    }
  })

  describe('warnings', () => {
    it('flags that a past-due parent UNDERSTATES its components', () => {
      // A needs a release before period 0, so the component demand that release
      // would have driven cannot be scheduled at all. That is worse than "late"
      // — B's gross requirements are incomplete, and B's own plan cannot say so.
      const plan = planRequirements({
        bom: [{ parentId: 'A', childId: 'B', quantityPer: 1 }],
        masterSchedule: [{ itemId: 'A', requirements: [25, 0, 40] }],
        items: { A: { leadTimePeriods: 2 } },
      })
      const w = plan.warnings?.join(' ') ?? ''
      expect(w).toMatch(/PAST-DUE/)
      expect(w).toMatch(/UNDERSTATED/)
      expect(w).toMatch(/\bA\b/)
    })

    it('does not raise the understatement warning for a past-due LEAF', () => {
      // A leaf has no components, so a past-due release understates nothing.
      const plan = planRequirements({
        bom: [{ parentId: 'A', childId: 'B', quantityPer: 1 }],
        masterSchedule: [{ itemId: 'A', requirements: [10] }],
        items: { B: { leadTimePeriods: 3 } },
      })
      expect(plan.value.items.B?.plannedOrders.some((o) => o.pastDue)).toBe(true)
      expect(plan.warnings?.join(' ') ?? '').not.toMatch(/UNDERSTATED/)
    })

    it('reports BOM items no demand reaches', () => {
      const plan = planRequirements({
        bom: [
          { parentId: 'A', childId: 'B', quantityPer: 1 },
          { parentId: 'DEAD', childId: 'BRANCH', quantityPer: 1 },
        ],
        masterSchedule: [{ itemId: 'A', requirements: [1] }],
      })
      expect(plan.warnings?.join(' ')).toMatch(/were not planned/)
      expect(plan.value.items.DEAD).toBeUndefined()
    })

    it('emits no warnings for a clean plan', () => {
      const plan = planRequirements({
        bom: [{ parentId: 'A', childId: 'B', quantityPer: 1 }],
        masterSchedule: [{ itemId: 'A', requirements: [0, 5] }],
        items: { A: { leadTimePeriods: 1 } },
      })
      expect(plan.warnings).toBeUndefined()
    })
  })

  it('rejects a cyclic BOM', () => {
    expect(() =>
      planRequirements({
        bom: [
          { parentId: 'A', childId: 'B', quantityPer: 1 },
          { parentId: 'B', childId: 'A', quantityPer: 1 },
        ],
        masterSchedule: [{ itemId: 'A', requirements: [1] }],
      }),
    ).toThrow(/cyclic/)
    expect(() =>
      planRequirements({
        bom: [{ parentId: 'A', childId: 'A', quantityPer: 1 }],
        masterSchedule: [],
      }),
    ).toThrow(/component of itself/)
  })

  // planRequirements and explode take the same BOM shape and the same
  // period-indexed demand series, so they must reject the same inputs with the
  // same messages. They originally did not: planRequirements carried a
  // hand-trimmed copy of explode's guard block, so a NaN quantityPer or a hole
  // in the master schedule produced a plausible-looking but wrong plan instead
  // of an error. The guards are now shared (bom/validate.ts) and these tests
  // pin the parity.
  describe('input validation (parity with explode)', () => {
    it('rejects a negative or non-finite quantityPer, naming the BOM field', () => {
      expect(() =>
        planRequirements({
          bom: [{ parentId: 'A', childId: 'B', quantityPer: -1 }],
          masterSchedule: [{ itemId: 'A', requirements: [1] }],
        }),
      ).toThrow(/bom\[0\]\.quantityPer/)
      expect(() =>
        planRequirements({
          bom: [{ parentId: 'A', childId: 'B', quantityPer: Number.NaN }],
          masterSchedule: [{ itemId: 'A', requirements: [1] }],
        }),
      ).toThrow(/bom\[0\]\.quantityPer/)
    })

    it('rejects a non-string parentId or childId', () => {
      expect(() =>
        planRequirements({
          bom: [{ parentId: 1 as unknown as string, childId: 'B', quantityPer: 1 }],
          masterSchedule: [],
        }),
      ).toThrow(/bom\[0\] must have string parentId and childId/)
    })

    it('rejects a hole or non-number in the master schedule instead of reading it as zero demand', () => {
      // biome-ignore lint/suspicious/noSparseArray: a hole is exactly the caller bug under test
      const holed = [10, , 30] as unknown as number[]
      expect(() =>
        planRequirements({ bom: [], masterSchedule: [{ itemId: 'A', requirements: holed }] }),
      ).toThrow(/masterSchedule\['A'\]\.requirements\[1\]/)
      expect(() =>
        planRequirements({
          bom: [],
          masterSchedule: [{ itemId: 'A', requirements: [1, Number.NaN] }],
        }),
      ).toThrow(/masterSchedule\['A'\]\.requirements\[1\]/)
      expect(() =>
        planRequirements({
          bom: [],
          masterSchedule: [{ itemId: 'A', requirements: [1, -5] }],
        }),
      ).toThrow(/masterSchedule\['A'\]\.requirements\[1\]/)
    })

    it('rejects a non-string itemId in the master schedule', () => {
      expect(() =>
        planRequirements({
          bom: [],
          masterSchedule: [{ itemId: 7 as unknown as string, requirements: [1] }],
        }),
      ).toThrow(/masterSchedule\[0\]\.itemId must be a string/)
    })
  })

  it('exposes the explanation contract', () => {
    const plan = planRequirements({
      bom: [{ parentId: 'A', childId: 'B', quantityPer: 2 }],
      masterSchedule: [{ itemId: 'A', requirements: [0, 10] }],
    })
    expect(plan.method).toBe('mrp-plan-requirements')
    expect(plan.inputs.itemsPlanned).toBe(2)
    expect(plan.inputs.maxLowLevelCode).toBe(1)
    expect(plan.citations).toContain(
      'Orlicky, J. (1975), Material Requirements Planning, McGraw-Hill.',
    )
    expect(plan.reasoning.some((r) => /RELEASES/.test(r))).toBe(true)
  })

  describe('properties', () => {
    const qty = (max: number) => fc.integer({ min: 0, max: max * 100 }).map((n) => n / 100)
    const acyclicBom = fc
      .array(fc.tuple(fc.nat({ max: 4 }), fc.nat({ max: 4 }), qty(3)), { maxLength: 10 })
      .map((triples) =>
        triples
          .filter(([a, b]) => a !== b)
          .map(([a, b, q]) => {
            const [lo, hi] = a < b ? [a, b] : [b, a]
            return { parentId: `I${lo}`, childId: `I${hi}`, quantityPer: q }
          }),
      )

    it('plans every parent before its child (the invariant one pass relies on)', () => {
      // NOT derivable from the netting arithmetic — it constrains the traversal
      // alone. If an item were planned before a parent had contributed, the
      // parent's releases would be missing from its gross requirements.
      fc.assert(
        fc.property(acyclicBom, fc.array(qty(30), { minLength: 1, maxLength: 5 }), (bom, mps) => {
          const plan = planRequirements({
            bom,
            masterSchedule: [{ itemId: 'I0', requirements: mps }],
          })
          const position = new Map(plan.value.order.map((id, i) => [id, i]))
          for (const line of bom) {
            const p = position.get(line.parentId)
            const c = position.get(line.childId)
            if (p !== undefined && c !== undefined) expect(p).toBeLessThan(c)
          }
        }),
        { numRuns: 600 },
      )
    })

    it('gives every planned component exactly its parents’ releases × quantityPer', () => {
      // Per-period, not summed — so unlike explode's conservation check this
      // DOES constrain placement as well as quantity.
      //
      // The generator MUST vary lead time and on-hand. With both at zero a
      // parent's release, receipt and gross requirement all coincide, so the
      // property cannot tell them apart and silently stops constraining the one
      // thing this function exists to get right. (Verified: with a zero-lead-time
      // generator, mutating `plannedOrderRelease` to `plannedOrderReceipt` left
      // every property green — only the worked cases caught it. See
      // `self-improve` hollow-test species (d): sound property, unreachable input.)
      fc.assert(
        fc.property(
          acyclicBom,
          fc.array(qty(30), { minLength: 1, maxLength: 5 }),
          fc.dictionary(
            fc.constantFrom('I0', 'I1', 'I2', 'I3', 'I4'),
            fc.record({ onHand: qty(20), leadTimePeriods: fc.nat({ max: 3 }) }),
            { maxKeys: 5 },
          ),
          (bom, mps, items) => {
            const plan = planRequirements({
              bom,
              masterSchedule: [{ itemId: 'I0', requirements: mps }],
              items,
            })
            for (const [itemId, item] of Object.entries(plan.value.items)) {
              const own = itemId === 'I0' ? mps : []
              for (let t = 0; t < item.grossRequirements.length; t++) {
                let expected = own[t] ?? 0
                for (const line of bom) {
                  if (line.childId !== itemId) continue
                  const parent = plan.value.items[line.parentId]
                  expected += (parent?.rows[t]?.plannedOrderRelease ?? 0) * line.quantityPer
                }
                expect(item.grossRequirements[t]).toBeCloseTo(expected, 6)
              }
            }
          },
        ),
        { numRuns: 600 },
      )
    })
  })
})

describe('period labels', () => {
  it('echoes the labels back and names the calendar span in the reasoning', () => {
    const plan = planRequirements({
      bom: [{ parentId: 'A', childId: 'B', quantityPer: 2 }],
      masterSchedule: [{ itemId: 'A', requirements: [0, 0, 10] }],
      periods: ['2026-03-02', '2026-03-09', '2026-03-16'],
    })
    expect(plan.value.periods).toEqual(['2026-03-02', '2026-03-09', '2026-03-16'])
    expect(plan.reasoning.some((r) => /period 0 is 2026-03-02/.test(r))).toBe(true)
  })

  it('omits periods entirely when none were given', () => {
    const plan = planRequirements({
      bom: [],
      masterSchedule: [{ itemId: 'A', requirements: [1] }],
    })
    expect(plan.value.periods).toBeUndefined()
    expect('periods' in plan.value).toBe(false)
  })

  // A wrong-length label set would mislabel every planned order in the plan,
  // which is worse than having no labels at all — so it must not be tolerated.
  it('rejects a label count that does not match the horizon', () => {
    expect(() =>
      planRequirements({
        bom: [],
        masterSchedule: [{ itemId: 'A', requirements: [1, 2, 3] }],
        periods: ['2026-03-02', '2026-03-09'],
      }),
    ).toThrow(/2 label\(s\).*spans 3 period\(s\)/)
  })

  it('does not let labels change any number in the plan', () => {
    const base = {
      bom: [{ parentId: 'A', childId: 'B', quantityPer: 2 }],
      masterSchedule: [{ itemId: 'A', requirements: [0, 5, 10] }],
      items: { A: { leadTimePeriods: 1, onHand: 3 } },
    }
    const without = planRequirements(base)
    const with_ = planRequirements({ ...base, periods: ['w1', 'w2', 'w3'] })
    expect(with_.value.items).toEqual(without.value.items)
    expect(with_.value.order).toEqual(without.value.order)
  })

  it('copies the labels rather than aliasing the caller’s array', () => {
    const periods = ['2026-03-02', '2026-03-09']
    const plan = planRequirements({
      bom: [],
      masterSchedule: [{ itemId: 'A', requirements: [1, 2] }],
      periods,
    })
    periods[0] = 'MUTATED'
    expect(plan.value.periods?.[0]).toBe('2026-03-02')
  })
})
