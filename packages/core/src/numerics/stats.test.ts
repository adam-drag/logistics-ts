import { describe, expect, it } from 'vitest'
import {
  averageDemandInterval,
  coefficientOfVariation,
  mean,
  squaredCvOfNonZero,
  standardDeviation,
  variance,
} from './stats'

// Classic textbook sample: population std dev is exactly 2, mean exactly 5.
const CLASSIC = [2, 4, 4, 4, 5, 5, 7, 9]

describe('mean', () => {
  it('computes the arithmetic mean', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(mean(CLASSIC)).toBe(5)
  })

  it('returns NaN for an empty array', () => {
    expect(mean([])).toBeNaN()
  })
})

describe('variance / standardDeviation', () => {
  it('uses the population denominator when asked', () => {
    expect(variance(CLASSIC, true)).toBe(4)
    expect(standardDeviation(CLASSIC, true)).toBe(2)
  })

  it('uses the sample (n-1) denominator by default', () => {
    expect(variance(CLASSIC)).toBeCloseTo(32 / 7, 10)
  })

  it('returns NaN for the sample form with fewer than two values', () => {
    expect(variance([5])).toBeNaN()
    expect(variance([], true)).toBeNaN()
  })
})

describe('coefficientOfVariation', () => {
  it('is stddev over mean', () => {
    expect(coefficientOfVariation(CLASSIC, true)).toBeCloseTo(0.4, 10)
  })

  it('returns NaN when the mean is zero', () => {
    expect(coefficientOfVariation([-1, 0, 1])).toBeNaN()
  })
})

describe('squaredCvOfNonZero', () => {
  it('ignores zero periods and squares the CV of demand sizes', () => {
    // Non-zero sizes [2, 8]: mean 5, sample std sqrt(18), CV 0.84853, CV² 0.72.
    expect(squaredCvOfNonZero([0, 2, 0, 8])).toBeCloseTo(0.72, 10)
  })

  it('is zero when all non-zero demands are equal', () => {
    expect(squaredCvOfNonZero([0, 5, 0, 5, 0, 5])).toBe(0)
  })
})

describe('averageDemandInterval', () => {
  it('is the series length over the count of non-zero demands', () => {
    expect(averageDemandInterval([0, 5, 0, 0, 5, 0])).toBe(3)
  })

  it('returns NaN when there is no demand', () => {
    expect(averageDemandInterval([0, 0, 0])).toBeNaN()
    expect(averageDemandInterval([])).toBeNaN()
  })
})
