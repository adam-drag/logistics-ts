import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { trend } from './trend'

describe('trend', () => {
  describe('doctests: the documented @example outputs, asserted exactly', () => {
    it('calls a clean upward ramp increasing', () => {
      expect(trend([10, 12, 14, 16, 18, 20, 22, 24]).value.direction).toBe('increasing')
    })

    it('calls noise around a constant level flat', () => {
      expect(trend([20, 18, 22, 19, 21, 20, 22, 18]).value.direction).toBe('flat')
    })
  })

  describe('the regression itself, against hand-computed values', () => {
    it('reproduces an OLS fit worked through by hand', () => {
      // series [1, 3, 2, 5, 4], t = 0..4, so t̄ = 2 and ȳ = 3.
      //   Sxx = 4+1+0+1+4 = 10
      //   Sxy = (−2)(−2) + (−1)(0) + (0)(−1) + (1)(2) + (2)(1) = 8
      //   slope = 8/10 = 0.8;  intercept = 3 − 0.8(2) = 1.4
      //   fitted   = 1.4, 2.2, 3.0, 3.8, 4.6
      //   residual = −0.4, 0.8, −1.0, 1.2, −0.6  →  SSE = 3.6
      //   s² = SSE/(n−2) = 1.2;  se(slope) = √(1.2/10) = 0.3464102
      //   t = 0.8 / 0.3464102 = 2.3094011
      //   SST = 4+0+1+4+1 = 10  →  R² = 1 − 3.6/10 = 0.64
      const t = trend([1, 3, 2, 5, 4])
      expect(t.value.slope).toBeCloseTo(0.8, 12)
      expect(t.value.intercept).toBeCloseTo(1.4, 12)
      expect(t.value.slopeStdError).toBeCloseTo(0.34641016, 7)
      expect(t.value.tStatistic).toBeCloseTo(2.30940108, 7)
      expect(t.value.rSquared).toBeCloseTo(0.64, 12)
      expect(t.value.level).toBeCloseTo(3, 12)
      expect(t.value.relativeSlope).toBeCloseTo(0.8 / 3, 12)
    })

    it('recovers the exact slope and intercept of a perfect line', () => {
      const t = trend([10, 12, 14, 16, 18, 20, 22, 24])
      expect(t.value.slope).toBeCloseTo(2, 12)
      expect(t.value.intercept).toBeCloseTo(10, 12)
      expect(t.value.rSquared).toBe(1)
    })
  })

  describe('the defect this function exists to prevent', () => {
    it('gives the same direction to the same SHAPE at wildly different levels', () => {
      // The stock_mate rule was `slope > 0.1`, an absolute magnitude. Under it a
      // fast mover creeping up by 0.09 units/period reads "stable" while a slow
      // mover gaining 0.11 reads "increasing", so the label means a different
      // thing in every row of the same list. Both series below grow by 2% of
      // their own level per period and must agree.
      const slow = [0.5, 0.51, 0.52, 0.53, 0.54, 0.55, 0.56, 0.57, 0.58, 0.59]
      const fast = slow.map((v) => v * 10_000)

      expect(trend(slow).value.direction).toBe('increasing')
      expect(trend(fast).value.direction).toBe('increasing')

      // The raw slopes differ by four orders of magnitude, which is exactly why
      // thresholding on the raw slope cannot work.
      expect(trend(fast).value.slope / trend(slow).value.slope).toBeCloseTo(10_000, 3)
      // The scale-free quantity is identical.
      expect(trend(fast).value.relativeSlope).toBeCloseTo(trend(slow).value.relativeSlope, 10)
    })

    it('does not call a fitted noise slope a trend', () => {
      // Fit a line to noise and you always get a slope with a sign. Reporting
      // that sign labels roughly half of a flat catalogue as trending.
      const noise = [50, 47, 53, 49, 51, 48, 52, 50, 49, 51, 50, 48]
      const t = trend(noise)
      expect(t.value.slope).not.toBe(0) // there IS a fitted slope
      expect(t.value.direction).toBe('flat') // and it means nothing
    })
  })

  describe('the two gates, each shown failing on its own', () => {
    it('reports flat when the slope is material but not significant', () => {
      // The hand-computed fixture: relativeSlope 0.267 clears the 1% bar easily,
      // but |t| = 2.309 is under the 3.182 critical value at 3 df.
      const t = trend([1, 3, 2, 5, 4])
      expect(t.value.material).toBe(true)
      expect(t.value.significant).toBe(false)
      expect(t.value.direction).toBe('flat')
      expect(t.warnings?.some((w) => /not distinguishable from zero/.test(w))).toBe(true)
    })

    it('reports flat when the slope is significant but not material', () => {
      // A long, very clean series drifting by 0.05% of its level per period.
      // Zero noise makes it certainly nonzero; it is still not worth acting on.
      const series = Array.from({ length: 60 }, (_, i) => 1000 + i * 0.5)
      const t = trend(series)
      expect(t.value.significant).toBe(true)
      expect(t.value.material).toBe(false)
      expect(t.value.direction).toBe('flat')
      expect(t.warnings?.some((w) => /statistically solid but tiny/.test(w))).toBe(true)
    })

    it('reports a direction only when both gates pass', () => {
      const t = trend([10, 12, 14, 16, 18, 20, 22, 24])
      expect(t.value.material).toBe(true)
      expect(t.value.significant).toBe(true)
      expect(t.value.direction).toBe('increasing')
    })

    it('moves off flat when the evidence changes, not when the label is asked for', () => {
      // A label that never changes is not a label. Same shape, rising noise:
      // the direction must degrade from increasing to flat as the signal is
      // buried, with nothing else about the call changing.
      const clean = [100, 105, 110, 115, 120, 125, 130, 135]
      const buried = [100, 160, 60, 175, 55, 190, 70, 135]
      expect(trend(clean).value.direction).toBe('increasing')
      expect(trend(buried).value.direction).toBe('flat')
    })
  })

  describe('options change the verdict in the documented direction', () => {
    it('makes a direction harder to reach at higher confidence', () => {
      const series = [10, 11, 13, 14, 16, 17, 19, 20, 21, 23]
      expect(trend(series, { confidenceLevel: 0.9 }).value.tCritical).toBeLessThan(
        trend(series, { confidenceLevel: 0.99 }).value.tCritical,
      )
      // Significance can only get harder as the bar rises, never easier.
      const at90 = trend(series, { confidenceLevel: 0.9 }).value.significant
      const at99 = trend(series, { confidenceLevel: 0.99 }).value.significant
      expect(at99 ? at90 : true).toBe(true)
    })

    it('makes a direction harder to reach at a higher materiality bar', () => {
      const series = [100, 102, 104, 106, 108, 110, 112, 114]
      expect(trend(series, { minRelativeSlope: 0.001 }).value.direction).toBe('increasing')
      expect(trend(series, { minRelativeSlope: 0.5 }).value.direction).toBe('flat')
    })
  })

  describe('properties', () => {
    it('is scale invariant: the verdict does not depend on the unit', () => {
      // The whole point of relativeSlope. Rescaling a series (units → dozens,
      // each → cases) must not change whether it is trending.
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0.5, max: 1000, noNaN: true }), {
            minLength: 5,
            maxLength: 40,
          }),
          fc.double({ min: 0.01, max: 100, noNaN: true }),
          (series, k) => {
            const base = trend(series).value
            const scaled = trend(series.map((v) => v * k)).value
            expect(scaled.direction).toBe(base.direction)
            expect(scaled.relativeSlope).toBeCloseTo(base.relativeSlope, 6)
            expect(scaled.rSquared).toBeCloseTo(base.rSquared, 6)
            expect(scaled.slope / base.slope).toBeCloseTo(k, 6)
          },
        ),
        { numRuns: 200 },
      )
    })

    it('is antisymmetric under reversal: reading a series backwards flips it', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0.5, max: 1000, noNaN: true }), {
            minLength: 5,
            maxLength: 40,
          }),
          (series) => {
            const forward = trend(series).value
            const backward = trend([...series].reverse()).value
            expect(backward.slope).toBeCloseTo(-forward.slope, 6)
            // Materiality and significance are magnitude tests, so reversal
            // cannot change either — only which way the label points.
            expect(backward.material).toBe(forward.material)
            expect(backward.significant).toBe(forward.significant)
            const flipped = { increasing: 'decreasing', decreasing: 'increasing', flat: 'flat' }
            expect(backward.direction).toBe(flipped[forward.direction])
          },
        ),
        { numRuns: 200 },
      )
    })

    it('is shift invariant in slope: adding a constant moves the intercept only', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0.5, max: 1000, noNaN: true }), {
            minLength: 5,
            maxLength: 40,
          }),
          fc.double({ min: 1, max: 1000, noNaN: true }),
          (series, c) => {
            const base = trend(series).value
            const shifted = trend(series.map((v) => v + c)).value
            expect(shifted.slope).toBeCloseTo(base.slope, 6)
            expect(shifted.intercept).toBeCloseTo(base.intercept + c, 6)
            // Raising the level without changing the slope makes the SAME slope
            // a smaller fraction of it, so a trend can only become less material.
            expect(Math.abs(shifted.relativeSlope)).toBeLessThanOrEqual(
              Math.abs(base.relativeSlope) + 1e-9,
            )
          },
        ),
        { numRuns: 200 },
      )
    })

    it('never leaks NaN into the result', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), { minLength: 3, maxLength: 40 }),
          (series) => {
            const v = trend(series).value
            for (const [key, n] of Object.entries(v)) {
              if (typeof n === 'number') expect(Number.isNaN(n), `${key} is NaN`).toBe(false)
            }
          },
        ),
        { numRuns: 300 },
      )
    })
  })

  describe('degenerate series', () => {
    it('reports a constant series flat, and says the verdict carries no information', () => {
      const t = trend([7, 7, 7, 7, 7])
      expect(t.value.slope).toBe(0)
      expect(t.value.tStatistic).toBe(0)
      expect(t.value.direction).toBe('flat')
      expect(t.value.rSquared).toBe(1)
      expect(t.warnings?.some((w) => /constant/.test(w))).toBe(true)
    })

    it('reports an all-zero series flat, on stated non-evidence', () => {
      const t = trend([0, 0, 0, 0, 0])
      expect(t.value.direction).toBe('flat')
      expect(t.value.relativeSlope).toBe(0)
      expect(Number.isNaN(t.value.relativeSlope)).toBe(false)
      expect(t.warnings?.some((w) => /no evidence/.test(w))).toBe(true)
    })

    it('warns that an exact fit makes significance automatic', () => {
      const t = trend([10, 12, 14, 16, 18, 20, 22, 24])
      expect(t.value.slopeStdError).toBe(0)
      expect(t.value.tStatistic).toBe(Number.POSITIVE_INFINITY)
      expect(t.warnings?.some((w) => /zero residual variance/.test(w))).toBe(true)
    })

    it('warns that a 3-period series can barely detect anything', () => {
      const t = trend([10, 20, 31])
      expect(t.warnings?.some((w) => /degree\(s\) of freedom/.test(w))).toBe(true)
    })
  })

  describe('validation', () => {
    it('rejects fewer than 3 observations, explaining why 2 is not enough', () => {
      expect(() => trend([1, 2])).toThrow(/at least 3 observations/)
      expect(() => trend([1, 2])).toThrow(/always fits/)
      expect(() => trend([])).toThrow(/at least 3 observations/)
    })

    it('rejects a non-finite observation, naming its index', () => {
      expect(() => trend([1, 2, Number.NaN, 4])).toThrow(/series\[2\]/)
      expect(() => trend([1, Number.POSITIVE_INFINITY, 3])).toThrow(/series\[1\]/)
    })

    it('rejects a negative materiality bar', () => {
      expect(() => trend([1, 2, 3], { minRelativeSlope: -0.1 })).toThrow(/minRelativeSlope/)
    })

    it('rejects an untabulated confidence level via the core primitive', () => {
      expect(() => trend([1, 2, 3, 4], { confidenceLevel: 0.975 as unknown as 0.95 })).toThrow(
        /confidenceLevel/,
      )
    })
  })

  describe('the explanation contract', () => {
    it('carries the method, the inputs and reasoning that names both gates', () => {
      const t = trend([10, 12, 14, 16, 18, 20, 22, 24], {
        confidenceLevel: 0.99,
        minRelativeSlope: 0.02,
      })
      expect(t.method).toBe('ols-trend')
      expect(t.inputs).toEqual({ periods: 8, confidenceLevel: 0.99, minRelativeSlope: 0.02 })
      expect(t.reasoning.some((r) => /materiality/.test(r))).toBe(true)
      expect(t.reasoning.some((r) => /significance/.test(r))).toBe(true)
      expect(t.citations?.length).toBeGreaterThan(0)
    })

    it('reports every number behind the verdict, not just the label', () => {
      // A caller that disagrees with the default gates must be able to apply its
      // own rule to the evidence rather than re-running the regression.
      const v = trend([1, 3, 2, 5, 4]).value
      for (const key of [
        'slope',
        'intercept',
        'slopeStdError',
        'tStatistic',
        'tCritical',
        'level',
        'relativeSlope',
        'rSquared',
      ] as const) {
        expect(typeof v[key], key).toBe('number')
      }
      expect(typeof v.material).toBe('boolean')
      expect(typeof v.significant).toBe('boolean')
    })
  })
})
