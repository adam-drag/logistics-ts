import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { explode } from './explode'

describe('explode', () => {
  it('propagates a straight chain multiplicatively (doctest of the @example)', () => {
    // A ← 2×B ← 3×C. 100 A in period 1 ⇒ 200 B ⇒ 600 C, all in period 1.
    const x = explode(
      [
        { parentId: 'A', childId: 'B', quantityPer: 2 },
        { parentId: 'B', childId: 'C', quantityPer: 3 },
      ],
      [{ itemId: 'A', requirements: [0, 100] }],
    )
    expect(x.value.grossRequirements.A).toEqual([0, 100])
    expect(x.value.grossRequirements.B).toEqual([0, 200])
    expect(x.value.grossRequirements.C).toEqual([0, 600])
    expect(x.value.lowLevelCodes).toEqual({ A: 0, B: 1, C: 2 })
  })

  it('keeps dependent demand in the SAME period as its parent', () => {
    // The gross explosion applies no lead-time offset — that belongs to the
    // netting grid. A requirement spread across periods must stay spread.
    const x = explode(
      [{ parentId: 'A', childId: 'B', quantityPer: 4 }],
      [{ itemId: 'A', requirements: [5, 0, 7] }],
    )
    expect(x.value.grossRequirements.B).toEqual([20, 0, 28])
  })

  describe('low-level codes — the reason this is not a simple recursion', () => {
    it('does NOT understate a component consumed at two different depths', () => {
      // THE decisive test. C is a child of BOTH A (depth 1) and B (depth 2),
      // and is itself a parent of D. Its low-level code must be the LONGEST
      // path (2), not the shortest (1).
      //
      //   A ──1×──▶ C ──5×──▶ D
      //   └──2×──▶ B ──3×──▶ C
      //
      // With A = 10:
      //   B = 10×2                    = 20
      //   C = 10×1 (from A) + 20×3    = 70   ← needs BOTH parents first
      //   D = 70×5                    = 350
      //
      // Process C at level 1 (shortest path) and its row is still 10 when the
      // C→D edge reads it, giving D = 50. A plain top-down recursion makes
      // exactly this mistake, which is why MRP uses low-level codes at all.
      const x = explode(
        [
          { parentId: 'A', childId: 'B', quantityPer: 2 },
          { parentId: 'A', childId: 'C', quantityPer: 1 },
          { parentId: 'B', childId: 'C', quantityPer: 3 },
          { parentId: 'C', childId: 'D', quantityPer: 5 },
        ],
        [{ itemId: 'A', requirements: [10] }],
      )
      expect(x.value.lowLevelCodes).toEqual({ A: 0, B: 1, C: 2, D: 3 })
      expect(x.value.grossRequirements.B).toEqual([20])
      expect(x.value.grossRequirements.C).toEqual([70])
      expect(x.value.grossRequirements.D).toEqual([350])
    })

    it('assigns the longest path when a component hangs off two end items', () => {
      // Two independent end items sharing a component at different depths.
      const x = explode(
        [
          { parentId: 'X', childId: 'S', quantityPer: 1 },
          { parentId: 'Y', childId: 'M', quantityPer: 1 },
          { parentId: 'M', childId: 'S', quantityPer: 1 },
        ],
        [
          { itemId: 'X', requirements: [1] },
          { itemId: 'Y', requirements: [1] },
        ],
      )
      expect(x.value.lowLevelCodes.S).toBe(2)
      expect(x.value.grossRequirements.S).toEqual([2])
    })
  })

  describe('cycle detection', () => {
    it('rejects a self-referencing line, naming the item', () => {
      expect(() => explode([{ parentId: 'A', childId: 'A', quantityPer: 1 }], [])).toThrow(
        /'A' a component of itself/,
      )
    })

    it('rejects a multi-item cycle, naming an offending edge', () => {
      expect(() =>
        explode(
          [
            { parentId: 'A', childId: 'B', quantityPer: 1 },
            { parentId: 'B', childId: 'C', quantityPer: 1 },
            { parentId: 'C', childId: 'A', quantityPer: 1 },
          ],
          [{ itemId: 'A', requirements: [1] }],
        ),
      ).toThrow(/cyclic/)
    })

    it('names a concrete edge, not just "a cycle exists"', () => {
      let message = ''
      try {
        explode(
          [
            { parentId: 'P', childId: 'Q', quantityPer: 1 },
            { parentId: 'Q', childId: 'P', quantityPer: 1 },
          ],
          [],
        )
      } catch (error) {
        message = (error as Error).message
      }
      // A caller with a thousand-row BOM needs the edge, not the diagnosis.
      expect(message).toMatch(/P -> Q|Q -> P/)
    })

    it('still explodes the acyclic part of a BOM that has an unrelated cycle? no — it throws', () => {
      // Deliberate: a cyclic BOM is a data-quality failure, not a partial
      // result. Returning half a plan would be silently wrong.
      expect(() =>
        explode(
          [
            { parentId: 'A', childId: 'B', quantityPer: 1 },
            { parentId: 'Y', childId: 'Z', quantityPer: 1 },
            { parentId: 'Z', childId: 'Y', quantityPer: 1 },
          ],
          [{ itemId: 'A', requirements: [1] }],
        ),
      ).toThrow(/cyclic/)
    })
  })

  describe('input handling', () => {
    it('zero-pads driving items of differing horizon length', () => {
      const x = explode(
        [{ parentId: 'A', childId: 'B', quantityPer: 1 }],
        [
          { itemId: 'A', requirements: [1, 2, 3] },
          { itemId: 'C', requirements: [9] },
        ],
      )
      expect(x.value.grossRequirements.C).toEqual([9, 0, 0])
      expect(x.value.grossRequirements.B).toEqual([1, 2, 3])
    })

    it('sums two demand streams for the same end item rather than dropping one', () => {
      const x = explode(
        [{ parentId: 'A', childId: 'B', quantityPer: 2 }],
        [
          { itemId: 'A', requirements: [10] },
          { itemId: 'A', requirements: [5] },
        ],
      )
      expect(x.value.grossRequirements.A).toEqual([15])
      expect(x.value.grossRequirements.B).toEqual([30])
    })

    it('rejects negative or non-finite quantities, naming the field', () => {
      expect(() => explode([{ parentId: 'A', childId: 'B', quantityPer: -1 }], [])).toThrow(
        /bom\[0\]\.quantityPer/,
      )
      expect(() => explode([], [{ itemId: 'A', requirements: [1, Number.NaN] }])).toThrow(
        /demand\['A'\]\.requirements\[1\]/,
      )
    })

    it('rejects non-array inputs instead of returning an empty explosion', () => {
      expect(() => explode(null as unknown as [], [])).toThrow(/bom must be an array/)
      expect(() => explode([], null as unknown as [])).toThrow(/demand must be an array/)
    })

    it('returns an empty explosion for empty inputs', () => {
      const x = explode([], [])
      expect(x.value.grossRequirements).toEqual({})
      expect(x.inputs.items).toBe(0)
    })

    it('warns about a BOM branch the demand cannot reach, and gives it no row', () => {
      // Deliberate asymmetry: lowLevelCodes describes the whole structure,
      // grossRequirements only what is actually required. A dead branch is a
      // data-quality signal, so it is warned about rather than padded with zeros.
      const x = explode(
        [
          { parentId: 'A', childId: 'B', quantityPer: 1 },
          { parentId: 'UNUSED', childId: 'ORPHAN', quantityPer: 1 },
        ],
        [{ itemId: 'A', requirements: [5] }],
      )
      expect(x.warnings?.join(' ')).toMatch(/unreachable from the driving demand/)
      expect(x.warnings?.join(' ')).toMatch(/UNUSED|ORPHAN/)
      expect(x.value.grossRequirements.ORPHAN).toBeUndefined()
      expect(x.value.grossRequirements.UNUSED).toBeUndefined()
      // ...but the structure still knows about them.
      expect(x.value.lowLevelCodes.UNUSED).toBe(0)
      expect(x.value.lowLevelCodes.ORPHAN).toBe(1)
    })

    it('emits no warning when everything in the BOM is driven', () => {
      const x = explode(
        [{ parentId: 'A', childId: 'B', quantityPer: 1 }],
        [{ itemId: 'A', requirements: [5] }],
      )
      expect(x.warnings).toBeUndefined()
    })
  })

  it('exposes the explanation contract', () => {
    const x = explode(
      [
        { parentId: 'A', childId: 'B', quantityPer: 2 },
        { parentId: 'B', childId: 'C', quantityPer: 3 },
      ],
      [{ itemId: 'A', requirements: [0, 100] }],
    )
    expect(x.method).toBe('bom-explosion')
    expect(x.inputs.bomLines).toBe(2)
    expect(x.inputs.items).toBe(3)
    expect(x.inputs.maxLowLevelCode).toBe(2)
    expect(x.inputs.periods).toBe(2)
    expect(x.citations).toContain(
      'Orlicky, J. (1975), Material Requirements Planning, McGraw-Hill.',
    )
    expect(x.reasoning.some((r) => /longest path/i.test(r))).toBe(true)
  })

  describe('properties', () => {
    // Two-decimal quantities, not fc.nat: quantityPer is routinely fractional
    // (a metre of cable per unit), and fc.double reaches subnormals where a
    // 1-ULP disagreement is IEEE-754 rather than a defect. See self-improve (d).
    const qty = (max: number) => fc.integer({ min: 0, max: max * 100 }).map((n) => n / 100)

    /** A random ACYCLIC BOM: edges only ever point from a lower to a higher index. */
    const acyclicBom = fc
      .array(fc.tuple(fc.nat({ max: 5 }), fc.nat({ max: 5 }), qty(4)), { maxLength: 14 })
      .map((triples) =>
        triples
          .filter(([a, b]) => a !== b)
          .map(([a, b, q]) => {
            const [lo, hi] = a < b ? [a, b] : [b, a]
            return { parentId: `I${lo}`, childId: `I${hi}`, quantityPer: q }
          }),
      )

    it('every child total equals Σ over its parents of quantityPer × parent total', () => {
      // DERIVATION CHECK — this property is PARTIALLY vacuous and it is worth
      // being explicit about which half is which.
      //
      // Summed over periods it is the accumulation line restated, so it cannot
      // constrain WHERE in the horizon a quantity lands: an implementation that
      // shifted every child requirement one period later would still pass.
      //
      // What it does constrain is that EVERY parent contributed exactly once —
      // drop a parent, double-count one, or apply an edge before the parent's
      // row is final, and the two sides diverge.
      //
      // That is not a guess. Mutation-tested: removing the low-level-code sort
      // so items are processed in insertion order is caught by THIS PROPERTY
      // AND NOTHING ELSE (18 of 19 tests stay green). It is the only guard on
      // the ordering, which is the whole reason low-level codes exist. Deleting
      // it as "just conservation" would silently unguard the algorithm's core.
      // Per-period placement is pinned by the worked cases above instead.
      fc.assert(
        fc.property(acyclicBom, fc.array(qty(50), { minLength: 1, maxLength: 6 }), (bom, req) => {
          const x = explode(bom, [{ itemId: 'I0', requirements: req }])
          const total = (id: string) =>
            (x.value.grossRequirements[id] ?? []).reduce((s, q) => s + q, 0)
          const byChild = new Map<string, number>()
          for (const line of bom) {
            byChild.set(
              line.childId,
              (byChild.get(line.childId) ?? 0) + line.quantityPer * total(line.parentId),
            )
          }
          for (const [childId, expected] of byChild) {
            const seeded = childId === 'I0' ? req.reduce((s, q) => s + q, 0) : 0
            expect(total(childId)).toBeCloseTo(expected + seeded, 6)
          }
        }),
        { numRuns: 800 },
      )
    })

    it('every parent has a strictly smaller low-level code than its child', () => {
      // This is the invariant that makes ONE pass correct. It is NOT derivable
      // from the accumulation line — it constrains assignLowLevelCodes alone,
      // and it fails immediately if longest-path is replaced by shortest-path
      // or by a naive depth-first depth.
      fc.assert(
        fc.property(acyclicBom, (bom) => {
          const x = explode(bom, [{ itemId: 'I0', requirements: [1] }])
          const codes = x.value.lowLevelCodes
          for (const line of bom) {
            expect(codes[line.parentId]).toBeLessThan(codes[line.childId] as number)
          }
        }),
        { numRuns: 800 },
      )
    })

    it('never produces a negative or non-finite requirement', () => {
      fc.assert(
        fc.property(acyclicBom, fc.array(qty(50), { minLength: 1, maxLength: 6 }), (bom, req) => {
          const x = explode(bom, [{ itemId: 'I0', requirements: req }])
          for (const row of Object.values(x.value.grossRequirements)) {
            for (const q of row) {
              expect(Number.isFinite(q)).toBe(true)
              expect(q).toBeGreaterThanOrEqual(0)
            }
          }
        }),
        { numRuns: 800 },
      )
    })
  })
})
