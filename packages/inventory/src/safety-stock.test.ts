import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { safetyStock } from './safety-stock'

// Z-scores independently computed via Python's statistics.NormalDist().inv_cdf
// (not re-derived from this repo's inverseNormalCdf), then the King/single-source
// formulas hand-applied to a fixed scenario: meanDemand=100, meanLeadTime=7,
// demandStdDev=20, leadTimeStdDev=1. See the formula in safety-stock.ts's TSDoc.
describe('safetyStock', () => {
  const scenario = { meanDemand: 100, meanLeadTime: 7, demandStdDev: 20, leadTimeStdDev: 1 }

  it('computes the King (2011) combined formula on a hand-verified scenario', () => {
    const result = safetyStock(scenario, { method: 'king', serviceLevel: 0.95 })
    expect(result.value).toBeCloseTo(186.09394458826773, 6)
    expect(result.method).toBe('king')
    expect(result.citations).toContain('King, R.G. (2011), APICS Magazine')
  })

  it('computes the demand-variability-only formula on a hand-verified scenario', () => {
    const result = safetyStock(scenario, { method: 'demand-variability', serviceLevel: 0.95 })
    expect(result.value).toBeCloseTo(87.03747280032405, 6)
  })

  it('computes the leadtime-variability-only formula on a hand-verified scenario', () => {
    const result = safetyStock(scenario, { method: 'leadtime-variability', serviceLevel: 0.95 })
    expect(result.value).toBeCloseTo(164.48536269514716, 6)
  })

  it('computes the max-minus-average heuristic on a hand-verified scenario', () => {
    const result = safetyStock(
      { meanDemand: 100, meanLeadTime: 7, maxDemand: 150, maxLeadTime: 10 },
      { method: 'max-minus-average', serviceLevel: 0.95 },
    )
    expect(result.value).toBeCloseTo(800, 6)
  })

  describe('auto routing (data-availability driven)', () => {
    it('picks king when both std devs are available', () => {
      const result = safetyStock(scenario, { serviceLevel: 0.95 })
      expect(result.method).toBe('auto-king')
      expect(result.value).toBeCloseTo(186.09394458826773, 6)
    })

    it('picks leadtime-variability when only leadTimeStdDev is available', () => {
      const result = safetyStock(
        { meanDemand: 100, meanLeadTime: 7, leadTimeStdDev: 1 },
        { serviceLevel: 0.95 },
      )
      expect(result.method).toBe('auto-leadtime-variability')
    })

    it('picks demand-variability when only demandStdDev is available', () => {
      const result = safetyStock(
        { meanDemand: 100, meanLeadTime: 7, demandStdDev: 20 },
        { serviceLevel: 0.95 },
      )
      expect(result.method).toBe('auto-demand-variability')
    })

    it('derives demandStdDev from a series when demandStdDev is not given directly', () => {
      const result = safetyStock(
        { meanDemand: 100, meanLeadTime: 7, series: [80, 100, 120, 100] },
        { serviceLevel: 0.95 },
      )
      expect(result.method).toBe('auto-demand-variability')
      expect(result.inputs.demandStdDev).toBeCloseTo(16.32993, 4)
    })

    it('falls back to max-minus-average when no variance data is available', () => {
      const result = safetyStock(
        { meanDemand: 100, meanLeadTime: 7, maxDemand: 150, maxLeadTime: 10 },
        { serviceLevel: 0.95 },
      )
      expect(result.method).toBe('auto-max-minus-average')
    })

    it('throws when auto has no usable inputs at all', () => {
      expect(() =>
        safetyStock({ meanDemand: 100, meanLeadTime: 7 }, { serviceLevel: 0.95 }),
      ).toThrow(/auto requires/)
    })

    it('warns but does not switch formula when the series is intermittent', () => {
      const intermittentSeries = [0, 0, 5, 0, 0, 0, 4, 0, 0, 0, 0, 6]
      const result = safetyStock(
        { meanDemand: 1, meanLeadTime: 7, series: intermittentSeries },
        { serviceLevel: 0.95 },
      )
      expect(result.method).toBe('auto-demand-variability')
      expect(result.warnings?.[0]).toMatch(/intermittent/)
    })
  })

  describe('edge cases', () => {
    it('throws for serviceLevel outside (0, 1)', () => {
      expect(() => safetyStock(scenario, { method: 'king', serviceLevel: 0 })).toThrow(
        /serviceLevel/,
      )
      expect(() => safetyStock(scenario, { method: 'king', serviceLevel: 1 })).toThrow(
        /serviceLevel/,
      )
    })

    it('throws for a negative input naming the offending field', () => {
      expect(() =>
        safetyStock({ ...scenario, meanDemand: -1 }, { method: 'king', serviceLevel: 0.95 }),
      ).toThrow(/meanDemand/)
      expect(() =>
        safetyStock({ ...scenario, demandStdDev: -1 }, { method: 'king', serviceLevel: 0.95 }),
      ).toThrow(/demandStdDev/)
    })

    it('throws when the requested method is missing its required inputs', () => {
      expect(() =>
        safetyStock({ meanDemand: 100, meanLeadTime: 7 }, { method: 'king', serviceLevel: 0.95 }),
      ).toThrow(/king/)
    })

    it('clamps a negative max-minus-average result to 0 with a warning', () => {
      const result = safetyStock(
        { meanDemand: 100, meanLeadTime: 7, maxDemand: 90, maxLeadTime: 5 },
        { method: 'max-minus-average', serviceLevel: 0.95 },
      )
      expect(result.value).toBe(0)
      expect(result.warnings?.[0]).toMatch(/negative/)
    })

    it('is 0 when demand and lead time have no variability', () => {
      const result = safetyStock(
        { meanDemand: 100, meanLeadTime: 7, demandStdDev: 0, leadTimeStdDev: 0 },
        { method: 'king', serviceLevel: 0.95 },
      )
      expect(result.value).toBe(0)
    })
  })

  describe('property: monotonic in serviceLevel', () => {
    it('never decreases as serviceLevel rises, for a fixed method', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1, max: 500, noNaN: true }),
          fc.double({ min: 1, max: 60, noNaN: true }),
          fc.double({ min: 0.01, max: 200, noNaN: true }),
          fc.double({ min: 0.01, max: 30, noNaN: true }),
          fc.double({ min: 0.5, max: 0.7, noNaN: true }),
          fc.double({ min: 0.71, max: 0.999, noNaN: true }),
          (meanDemand, meanLeadTime, demandStdDev, leadTimeStdDev, lowLevel, highLevel) => {
            const input = { meanDemand, meanLeadTime, demandStdDev, leadTimeStdDev }
            const low = safetyStock(input, { method: 'king', serviceLevel: lowLevel }).value
            const high = safetyStock(input, { method: 'king', serviceLevel: highLevel }).value
            expect(high).toBeGreaterThanOrEqual(low)
          },
        ),
      )
    })
  })
})
