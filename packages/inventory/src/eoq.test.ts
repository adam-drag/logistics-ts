import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { eoq, eoqWithQuantityDiscounts, epq } from './eoq'

describe('eoq', () => {
  it('reproduces the classic Harris (1913) worked example (D=1000, S=10, H=2 → Q*=100)', () => {
    const result = eoq({ annualDemand: 1000, orderCost: 10, holdingCostPerUnit: 2 })
    expect(result.value).toBe(100)
    expect(result.method).toBe('eoq')
    expect(result.citations).toContain('Harris, F.W. (1913), Factory: The Magazine of Management')
  })

  it('throws for a non-positive input naming the field', () => {
    expect(() => eoq({ annualDemand: 0, orderCost: 10, holdingCostPerUnit: 2 })).toThrow(
      /annualDemand/,
    )
    expect(() => eoq({ annualDemand: 1000, orderCost: -1, holdingCostPerUnit: 2 })).toThrow(
      /orderCost/,
    )
  })

  it('is scale-invariant: eoq(k·D) = √k · eoq(D)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100_000, noNaN: true }),
        fc.double({ min: 0.01, max: 1000, noNaN: true }),
        fc.double({ min: 0.01, max: 1000, noNaN: true }),
        fc.double({ min: 0.01, max: 1000, noNaN: true }),
        (annualDemand, orderCost, holdingCostPerUnit, k) => {
          const base = eoq({ annualDemand, orderCost, holdingCostPerUnit }).value
          const scaled = eoq({
            annualDemand: annualDemand * k,
            orderCost,
            holdingCostPerUnit,
          }).value
          expect(scaled).toBeCloseTo(Math.sqrt(k) * base, 6)
        },
      ),
    )
  })
})

describe('epq', () => {
  it('matches a hand-verified scenario (D=1000, S=10, H=2, P=5000 → Q*≈111.803)', () => {
    const result = epq({
      annualDemand: 1000,
      orderCost: 10,
      holdingCostPerUnit: 2,
      productionRate: 5000,
    })
    expect(result.value).toBeCloseTo(111.80339887498948, 6)
  })

  it('converges to eoq as productionRate grows large relative to demand', () => {
    const base = eoq({ annualDemand: 1000, orderCost: 10, holdingCostPerUnit: 2 }).value
    const epqValue = epq({
      annualDemand: 1000,
      orderCost: 10,
      holdingCostPerUnit: 2,
      productionRate: 1_000_000,
    }).value
    expect(epqValue).toBeCloseTo(base, 0)
  })

  it('throws when productionRate does not exceed annualDemand', () => {
    expect(() =>
      epq({ annualDemand: 1000, orderCost: 10, holdingCostPerUnit: 2, productionRate: 1000 }),
    ).toThrow(/productionRate/)
    expect(() =>
      epq({ annualDemand: 1000, orderCost: 10, holdingCostPerUnit: 2, productionRate: 500 }),
    ).toThrow(/productionRate/)
  })
})

describe('eoqWithQuantityDiscounts', () => {
  const tiers = [
    { minQuantity: 1, unitPrice: 5.0 },
    { minQuantity: 500, unitPrice: 4.65 },
    { minQuantity: 1000, unitPrice: 4.6 },
  ]

  it('picks the lowest-total-cost tier on a hand-verified scenario', () => {
    const result = eoqWithQuantityDiscounts({
      annualDemand: 5000,
      orderCost: 49,
      holdingCostRate: 0.2,
      tiers,
    })
    expect(result.value.tier.unitPrice).toBe(4.6)
    expect(result.value.orderQuantity).toBe(1000)
    expect(result.value.totalAnnualCost).toBeCloseTo(23705, 4)
  })

  it('skips a tier whose unconstrained EOQ is dominated by the next tier', () => {
    const result = eoqWithQuantityDiscounts({
      annualDemand: 5000,
      orderCost: 49,
      holdingCostRate: 0.2,
      tiers,
    })
    // tier @5.0's unconstrained EOQ (700) reaches the 500-unit break, so it
    // must not be the winner even though it's the "no discount" base price.
    expect(result.value.tier.unitPrice).not.toBe(5.0)
  })

  it('throws when tiers are not sorted ascending by minQuantity', () => {
    expect(() =>
      eoqWithQuantityDiscounts({
        annualDemand: 5000,
        orderCost: 49,
        holdingCostRate: 0.2,
        tiers: [
          { minQuantity: 500, unitPrice: 4.65 },
          { minQuantity: 1, unitPrice: 5.0 },
        ],
      }),
    ).toThrow(/sorted ascending/)
  })

  it('throws for an empty tiers array', () => {
    expect(() =>
      eoqWithQuantityDiscounts({
        annualDemand: 5000,
        orderCost: 49,
        holdingCostRate: 0.2,
        tiers: [],
      }),
    ).toThrow(/tiers/)
  })
})
