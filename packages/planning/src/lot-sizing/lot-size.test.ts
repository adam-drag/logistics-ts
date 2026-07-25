import { describe, expect, it } from 'vitest'
import { fixedOrderQuantity } from './fixed-order-quantity'
import { leastUnitCost } from './least-unit-cost'
import { lotForLot } from './lot-for-lot'
import { LOT_RULES, type LotSizeOptions, lotSize } from './lot-size'
import { periodOrderQuantity } from './period-order-quantity'
import { silverMeal } from './silver-meal'
import { wagnerWhitin } from './wagner-whitin'

const DEMAND = [90, 120, 80, 70]
const COSTS = { setupCost: 500, holdingCostPerUnitPerPeriod: 2 }

describe('lotSize', () => {
  it('dispatches each rule to exactly the same plan as calling that rule directly', () => {
    // THE test that proves lotSize is a dispatcher, not a divergent second
    // implementation: every rule's value must deep-equal the direct call's.
    const direct = {
      'lot-for-lot': lotForLot(DEMAND, COSTS),
      foq: fixedOrderQuantity(DEMAND, { ...COSTS, orderQuantity: 150 }),
      poq: periodOrderQuantity(DEMAND, COSTS),
      'silver-meal': silverMeal(DEMAND, COSTS),
      'least-unit-cost': leastUnitCost(DEMAND, COSTS),
      'wagner-whitin': wagnerWhitin(DEMAND, COSTS),
    } as const

    for (const rule of LOT_RULES) {
      const options: LotSizeOptions =
        rule === 'foq' ? { rule, ...COSTS, orderQuantity: 150 } : { rule, ...COSTS }
      const dispatched = lotSize(DEMAND, options)
      expect(dispatched.value).toEqual(direct[rule].value)
      // The concrete rule that ran must stay identifiable, never 'lotSize'.
      expect(dispatched.method).toBe(direct[rule].method)
      expect(dispatched.citations).toEqual(direct[rule].citations)
    }
  })

  it('covers every rule in LOT_RULES (guards against an unrouted new rule)', () => {
    expect(LOT_RULES).toEqual([
      'lot-for-lot',
      'foq',
      'poq',
      'silver-meal',
      'least-unit-cost',
      'wagner-whitin',
    ])
    for (const rule of LOT_RULES) {
      const options: LotSizeOptions =
        rule === 'foq' ? { rule, ...COSTS, orderQuantity: 150 } : { rule, ...COSTS }
      expect(() => lotSize(DEMAND, options)).not.toThrow()
    }
  })

  it("records the dispatch in reasoning while preserving the rule's own reasoning", () => {
    const dispatched = lotSize(DEMAND, { rule: 'wagner-whitin', ...COSTS })
    const directReasoning = wagnerWhitin(DEMAND, COSTS).reasoning

    expect(dispatched.reasoning[0]).toContain("dispatched to the 'wagner-whitin' rule")
    expect(dispatched.reasoning[0]).toContain('dispatcher, not an algorithm')
    // The rule's own reasoning survives intact, after the dispatch note.
    expect(dispatched.reasoning.slice(1)).toEqual(directReasoning)
  })

  it('asserts the documented @example outputs exactly (doctest)', () => {
    expect(
      lotSize([90, 120, 80, 70], {
        rule: 'wagner-whitin',
        setupCost: 500,
        holdingCostPerUnitPerPeriod: 2,
      }).value,
    ).toEqual({
      orders: [
        { period: 0, quantity: 210 },
        { period: 2, quantity: 150 },
      ],
      totalCost: 1380,
      setupCost: 1000,
      holdingCost: 380,
    })
  })

  it('throws on an unknown rule, naming the value and listing valid rules', () => {
    // A JS caller has no compile-time check, so this path is genuinely reachable.
    const bogus = { rule: 'silver-meel', ...COSTS } as unknown as LotSizeOptions
    expect(() => lotSize(DEMAND, bogus)).toThrow(/silver-meel/)
    expect(() => lotSize(DEMAND, bogus)).toThrow(/wagner-whitin/)
  })

  it("propagates the delegated rule's own input validation", () => {
    // lotSize deliberately does not re-validate numbers; the rule owns that.
    expect(() => lotSize([10, -5], { rule: 'wagner-whitin', ...COSTS })).toThrow(/demand\[1\]/)
    expect(() => lotSize([10], { rule: 'foq', ...COSTS, orderQuantity: 0 })).toThrow(
      /orderQuantity/,
    )
  })

  it('routes foq with its required orderQuantity', () => {
    const dispatched = lotSize([10, 20, 30, 40], {
      rule: 'foq',
      setupCost: 100,
      holdingCostPerUnitPerPeriod: 1,
      orderQuantity: 50,
    })
    expect(dispatched.method).toBe('fixed-order-quantity')
    expect(dispatched.value.orders).toEqual([
      { period: 0, quantity: 50 },
      { period: 2, quantity: 50 },
    ])
    expect(dispatched.value.totalCost).toBe(300)
  })

  it('selects the optimum when asked: wagner-whitin never costs more than the heuristics', () => {
    const demand = [10, 20, 30, 40]
    const costs = { setupCost: 100, holdingCostPerUnitPerPeriod: 1 }
    const ww = lotSize(demand, { rule: 'wagner-whitin', ...costs }).value.totalCost
    for (const rule of ['lot-for-lot', 'poq', 'silver-meal', 'least-unit-cost'] as const) {
      expect(ww).toBeLessThanOrEqual(lotSize(demand, { rule, ...costs }).value.totalCost)
    }
  })
})
