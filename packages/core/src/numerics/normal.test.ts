import { describe, expect, it } from 'vitest'
import { inverseNormalCdf, normalCdf, normalLossFunction, normalPdf } from './normal'

describe('inverseNormalCdf', () => {
  // Authoritative standard-normal quantiles spanning both tails (p < 0.02425
  // and p > 0.97575) and the central region, so a transcription error in ANY
  // of Acklam's three branches is caught. Values from standard z-tables.
  const QUANTILES: ReadonlyArray<readonly [p: number, z: number]> = [
    [0.001, -3.090232306],
    [0.005, -2.575829304],
    [0.01, -2.326347874],
    [0.025, -1.959963985],
    [0.05, -1.644853627],
    [0.1, -1.281551566],
    [0.25, -0.67448975],
    [0.5, 0],
    [0.75, 0.67448975],
    [0.9, 1.281551566],
    [0.95, 1.644853627],
    [0.975, 1.959963985],
    [0.99, 2.326347874],
    [0.995, 2.575829304],
    [0.999, 3.090232306],
  ]

  it.each(QUANTILES)('matches the table at p = %f (z ≈ %f)', (p, z) => {
    expect(inverseNormalCdf(p)).toBeCloseTo(z, 6)
  })

  it('is antisymmetric about p = 0.5', () => {
    expect(inverseNormalCdf(0.25)).toBeCloseTo(-inverseNormalCdf(0.75), 6)
  })

  it('handles the boundaries and out-of-range input', () => {
    expect(inverseNormalCdf(0)).toBe(Number.NEGATIVE_INFINITY)
    expect(inverseNormalCdf(1)).toBe(Number.POSITIVE_INFINITY)
    expect(inverseNormalCdf(-0.1)).toBeNaN()
    expect(inverseNormalCdf(1.1)).toBeNaN()
  })
})

describe('normalPdf', () => {
  it('peaks at 1/sqrt(2π)', () => {
    expect(normalPdf(0)).toBeCloseTo(0.3989422804, 10)
  })

  it('is symmetric', () => {
    expect(normalPdf(-1.5)).toBeCloseTo(normalPdf(1.5), 12)
  })
})

describe('normalCdf', () => {
  it('is 0.5 at the mean and consistent with the quantile function', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.6448536269)).toBeCloseTo(0.95, 4)
    expect(normalCdf(1.959963985)).toBeCloseTo(0.975, 4)
  })
})

describe('normalLossFunction', () => {
  it('equals φ(0) at z = 0', () => {
    expect(normalLossFunction(0)).toBeCloseTo(0.3989422804, 6)
  })

  it('decreases monotonically in z', () => {
    expect(normalLossFunction(0)).toBeGreaterThan(normalLossFunction(1))
    expect(normalLossFunction(1)).toBeGreaterThan(normalLossFunction(2))
  })
})
