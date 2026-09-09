import { describe, expect, it } from 'vitest'
import { safetyStockPolicy } from './safety-stock-policy'

describe('safetyStockPolicy', () => {
  it('asserts the documented @example outputs exactly (doctest)', () => {
    const ss = safetyStockPolicy({
      method: 'days-of-supply',
      days: 14,
      meanDemandPerDay: 4.92,
    })
    expect(ss.value).toBeCloseTo(68.88, 10)
    expect(ss.method).toBe('days-of-supply')
  })

  describe('days-of-supply', () => {
    it('holds exactly the requested days of average demand', () => {
      const ss = safetyStockPolicy({ method: 'days-of-supply', days: 10, meanDemandPerDay: 5 })
      expect(ss.value).toBe(50)
      expect(ss.inputs).toMatchObject({ days: 10, meanDemandPerDay: 5 })
    })

    it('is linear in both days and demand', () => {
      const base = safetyStockPolicy({ method: 'days-of-supply', days: 7, meanDemandPerDay: 3 })
      const twiceDays = safetyStockPolicy({
        method: 'days-of-supply',
        days: 14,
        meanDemandPerDay: 3,
      })
      const twiceDemand = safetyStockPolicy({
        method: 'days-of-supply',
        days: 7,
        meanDemandPerDay: 6,
      })
      expect(twiceDays.value).toBeCloseTo(base.value * 2, 10)
      expect(twiceDemand.value).toBeCloseTo(base.value * 2, 10)
    })
  })

  describe('fixed', () => {
    it('reports the quantity it was given, unchanged', () => {
      const ss = safetyStockPolicy({ method: 'fixed', quantity: 250 })
      expect(ss.value).toBe(250)
      expect(ss.inputs).toEqual({ quantity: 250 })
    })

    it('accepts zero, which is a legitimate planner decision', () => {
      expect(safetyStockPolicy({ method: 'fixed', quantity: 0 }).value).toBe(0)
    })
  })

  describe('percentage-of-average', () => {
    it('holds the requested fraction of mean demand', () => {
      const ss = safetyStockPolicy({
        method: 'percentage-of-average',
        bufferPercentage: 0.3,
        meanDemandPerPeriod: 200,
      })
      expect(ss.value).toBeCloseTo(60, 10)
    })

    it('ignores variability entirely, which is the documented weakness', () => {
      // Two items with the same mean and wildly different volatility get the
      // same buffer. The test exists so the limitation is pinned rather than
      // merely described in prose: if someone "improves" this method by
      // sneaking a variability term in, this fails and they must update the doc.
      const a = safetyStockPolicy({
        method: 'percentage-of-average',
        bufferPercentage: 0.25,
        meanDemandPerPeriod: 100,
      })
      const b = safetyStockPolicy({
        method: 'percentage-of-average',
        bufferPercentage: 0.25,
        meanDemandPerPeriod: 100,
      })
      expect(a.value).toBe(b.value)
      expect(a.value).toBe(25)
    })
  })

  describe('the explanation contract', () => {
    it('warns on EVERY policy that no service level is implied', () => {
      // The whole reason these live apart from safetyStock(). A policy buffer
      // and a statistical one are indistinguishable once they are a number in a
      // UI, so the warning is the only thing carrying the distinction forward.
      const all = [
        safetyStockPolicy({ method: 'days-of-supply', days: 5, meanDemandPerDay: 2 }),
        safetyStockPolicy({ method: 'fixed', quantity: 10 }),
        safetyStockPolicy({
          method: 'percentage-of-average',
          bufferPercentage: 0.1,
          meanDemandPerPeriod: 50,
        }),
      ]
      for (const ss of all) {
        expect(ss.warnings?.some((w) => /implies NO service level/i.test(w))).toBe(true)
        expect(ss.reasoning.length).toBeGreaterThan(0)
      }
    })

    it('never reports a serviceLevel input, because none was consulted', () => {
      const ss = safetyStockPolicy({ method: 'days-of-supply', days: 5, meanDemandPerDay: 2 })
      expect('serviceLevel' in ss.inputs).toBe(false)
    })
  })

  describe('validation', () => {
    it('rejects negative and non-finite inputs, naming the field', () => {
      expect(() =>
        safetyStockPolicy({ method: 'days-of-supply', days: -1, meanDemandPerDay: 5 }),
      ).toThrow(/days/)
      expect(() =>
        safetyStockPolicy({ method: 'days-of-supply', days: 5, meanDemandPerDay: Number.NaN }),
      ).toThrow(/meanDemandPerDay/)
      expect(() => safetyStockPolicy({ method: 'fixed', quantity: -5 })).toThrow(/quantity/)
      expect(() =>
        safetyStockPolicy({
          method: 'percentage-of-average',
          bufferPercentage: Number.POSITIVE_INFINITY,
          meanDemandPerPeriod: 10,
        }),
      ).toThrow(/bufferPercentage/)
    })

    it('rejects an unknown method, listing the valid ones', () => {
      expect(() =>
        safetyStockPolicy({ method: 'made-up' } as unknown as Parameters<
          typeof safetyStockPolicy
        >[0]),
      ).toThrow(/days-of-supply/)
    })
  })
})
