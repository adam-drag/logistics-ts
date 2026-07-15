import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { orderUpToLevel, reorderPoint } from './reorder-point'

describe('reorderPoint', () => {
  it('computes D̄·L̄ + SS', () => {
    const result = reorderPoint({ meanDemand: 100, meanLeadTime: 7, safetyStock: 186 })
    expect(result.value).toBe(886)
    expect(result.method).toBe('reorder-point')
  })

  it('is safety stock alone when demand or lead time is 0', () => {
    expect(reorderPoint({ meanDemand: 0, meanLeadTime: 7, safetyStock: 50 }).value).toBe(50)
  })

  it('throws for a negative input naming the field', () => {
    expect(() => reorderPoint({ meanDemand: -1, meanLeadTime: 7, safetyStock: 0 })).toThrow(
      /meanDemand/,
    )
  })

  it('is monotonic non-decreasing in safetyStock', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        (meanDemand, meanLeadTime, ssLow, ssDelta) => {
          const low = reorderPoint({ meanDemand, meanLeadTime, safetyStock: ssLow }).value
          const high = reorderPoint({
            meanDemand,
            meanLeadTime,
            safetyStock: ssLow + ssDelta,
          }).value
          expect(high).toBeGreaterThanOrEqual(low)
        },
      ),
    )
  })
})

describe('orderUpToLevel', () => {
  it('computes D̄·(L̄+R) + SS', () => {
    const result = orderUpToLevel({
      meanDemand: 100,
      meanLeadTime: 7,
      reviewPeriod: 14,
      safetyStock: 186,
    })
    expect(result.value).toBe(2286)
    expect(result.method).toBe('order-up-to-level')
  })

  it('reduces to reorderPoint when reviewPeriod is 0', () => {
    const rop = reorderPoint({ meanDemand: 100, meanLeadTime: 7, safetyStock: 186 }).value
    const oul = orderUpToLevel({
      meanDemand: 100,
      meanLeadTime: 7,
      reviewPeriod: 0,
      safetyStock: 186,
    }).value
    expect(oul).toBe(rop)
  })

  it('throws for a negative reviewPeriod', () => {
    expect(() =>
      orderUpToLevel({ meanDemand: 1, meanLeadTime: 1, reviewPeriod: -1, safetyStock: 0 }),
    ).toThrow(/reviewPeriod/)
  })
})
