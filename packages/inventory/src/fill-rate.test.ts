import { normalLossFunction } from '@logistics-ts/core'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { fillRate, safetyStockForFillRate, serviceMetrics } from './fill-rate'

describe('normalLossFunction (fill-rate underpinning)', () => {
  // Golden points from the standard unit normal loss-function table in
  // Silver, Pyke & Thomas (2017), Inventory and Production Management in Supply
  // Chains, 4th ed. — G(z) = φ(z) − z·(1 − Φ(z)).
  it('matches the SPT loss-function table at z = 0, 1, 2', () => {
    expect(normalLossFunction(0)).toBeCloseTo(0.3989, 4)
    expect(normalLossFunction(1.0)).toBeCloseTo(0.0833, 4)
    expect(normalLossFunction(2.0)).toBeCloseTo(0.0085, 4)
  })
})

describe('fillRate', () => {
  it('computes β from safety stock, σ_L and Q (z = 1 worked case)', () => {
    // z = 50/50 = 1 → ESC = 50·G(1) = 50·0.083315 ≈ 4.1657 → β = 1 − 4.1657/200
    const result = fillRate({ safetyStock: 50, sigmaLeadTime: 50, orderQuantity: 200 })
    expect(result.value.z).toBe(1)
    expect(result.value.expectedShortagePerCycle).toBeCloseTo(4.1657, 3)
    expect(result.value.fillRate).toBeCloseTo(0.97917, 4)
    expect(result.method).toBe('fill-rate')
    expect(result.citations?.[0]).toMatch(/Silver, Pyke & Thomas/)
  })

  it('β rises toward 1 as safety stock grows', () => {
    const low = fillRate({ safetyStock: 0, sigmaLeadTime: 50, orderQuantity: 200 }).value.fillRate
    const high = fillRate({ safetyStock: 150, sigmaLeadTime: 50, orderQuantity: 200 }).value
      .fillRate
    expect(high).toBeGreaterThan(low)
    expect(high).toBeLessThanOrEqual(1)
  })

  it('clamps a negative β to 0 and warns when ESC exceeds Q', () => {
    // Deeply negative safety stock ⇒ huge ESC ⇒ raw β < 0.
    const result = fillRate({ safetyStock: -500, sigmaLeadTime: 100, orderQuantity: 5 })
    expect(result.value.fillRate).toBe(0)
    expect(result.warnings?.[0]).toMatch(/clamped to 0/)
  })

  it('throws naming a non-positive σ_L or Q', () => {
    expect(() => fillRate({ safetyStock: 10, sigmaLeadTime: 0, orderQuantity: 200 })).toThrow(
      /sigmaLeadTime/,
    )
    expect(() => fillRate({ safetyStock: 10, sigmaLeadTime: 50, orderQuantity: -1 })).toThrow(
      /orderQuantity/,
    )
  })
})

describe('safetyStockForFillRate', () => {
  it('inverts the z = 1 worked case (β ≈ 0.97917 → SS ≈ 50, z ≈ 1)', () => {
    const result = safetyStockForFillRate({
      targetFillRate: 0.97917,
      sigmaLeadTime: 50,
      orderQuantity: 200,
    })
    expect(result.value.z).toBeCloseTo(1, 4)
    expect(result.value.safetyStock).toBeCloseTo(50, 2)
    expect(result.method).toBe('safety-stock-for-fill-rate')
  })

  it('produces a negative safety stock (and warns) for a low target fill rate', () => {
    // (1 − 0.5)·200/50 = 2 > G(0)=0.3989 ⇒ z < 0.
    const result = safetyStockForFillRate({
      targetFillRate: 0.5,
      sigmaLeadTime: 50,
      orderQuantity: 200,
    })
    expect(result.value.safetyStock).toBeLessThan(0)
    expect(result.warnings?.[0]).toMatch(/negative/)
  })

  it('throws when targetFillRate is outside (0, 1)', () => {
    expect(() =>
      safetyStockForFillRate({ targetFillRate: 1, sigmaLeadTime: 50, orderQuantity: 200 }),
    ).toThrow(/targetFillRate/)
    expect(() =>
      safetyStockForFillRate({ targetFillRate: 0, sigmaLeadTime: 50, orderQuantity: 200 }),
    ).toThrow(/targetFillRate/)
  })

  it('round-trips with fillRate across a range of targets (fillRate(SS(β)) ≈ β)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 0.9999, noNaN: true }),
        fc.double({ min: 1, max: 500, noNaN: true }),
        fc.double({ min: 1, max: 5000, noNaN: true }),
        (targetFillRate, sigmaLeadTime, orderQuantity) => {
          const ss = safetyStockForFillRate({
            targetFillRate,
            sigmaLeadTime,
            orderQuantity,
          }).value.safetyStock
          const back = fillRate({ safetyStock: ss, sigmaLeadTime, orderQuantity }).value.fillRate
          expect(back).toBeCloseTo(targetFillRate, 5)
        },
      ),
    )
  })
})

describe('serviceMetrics', () => {
  it('bridges α and β: 95% cycle service level yields a higher fill rate', () => {
    const result = serviceMetrics({
      cycleServiceLevel: 0.95,
      sigmaLeadTime: 50,
      orderQuantity: 200,
    })
    expect(result.value.z).toBeCloseTo(1.6449, 3)
    expect(result.value.safetyStock).toBeCloseTo(82.24, 1)
    expect(result.value.cycleServiceLevel).toBeCloseTo(0.95, 3)
    // β ≥ α for the same buffer.
    expect(result.value.fillRate).toBeGreaterThan(result.value.cycleServiceLevel)
    // ESC = 50·G(1.6449) ≈ 1.045 → β = 1 − 1.045/200 ≈ 0.99478
    expect(result.value.fillRate).toBeCloseTo(0.99478, 3)
    expect(result.method).toBe('service-metrics')
  })

  it('fill rate matches a direct fillRate call on the implied safety stock', () => {
    const sm = serviceMetrics({ cycleServiceLevel: 0.9, sigmaLeadTime: 30, orderQuantity: 120 })
    const direct = fillRate({
      safetyStock: sm.value.safetyStock,
      sigmaLeadTime: 30,
      orderQuantity: 120,
    })
    expect(sm.value.fillRate).toBeCloseTo(direct.value.fillRate, 10)
  })

  it('throws when cycleServiceLevel is outside (0, 1)', () => {
    expect(() =>
      serviceMetrics({ cycleServiceLevel: 1, sigmaLeadTime: 50, orderQuantity: 200 }),
    ).toThrow(/cycleServiceLevel/)
  })
})
