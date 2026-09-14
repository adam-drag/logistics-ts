import { describe, expect, it } from 'vitest'
import { type SafetyStockMethod, safetyStock } from './safety-stock'
import { safetyStockMethods } from './safety-stock-methods'
import { type SafetyStockPolicyMethod, safetyStockPolicy } from './safety-stock-policy'

/**
 * A catalogue is documentation that happens to be typed, so it rots exactly
 * like a comment. These tests exist to make it fail loudly when it drifts from
 * the functions it describes, rather than quietly misinform a UI built on it.
 *
 * The compile-time exhaustiveness checks below are the important half: they
 * fail the BUILD, not just the suite, if a method is added to either family and
 * the catalogue is not updated.
 */
describe('safetyStockMethods', () => {
  const all = safetyStockMethods()
  const ids = all.map((m) => m.id)

  describe('compile-time exhaustiveness', () => {
    it('covers every statistical method in the union except auto', () => {
      // If SafetyStockMethod gains a member and the catalogue does not, this
      // Record is missing a key and typecheck fails. `auto` is excluded because
      // it is a routing instruction, not a formula a UI can describe.
      const covered: Record<Exclude<SafetyStockMethod, 'auto'>, true> = {
        'demand-variability': true,
        'leadtime-variability': true,
        king: true,
        'max-minus-average': true,
      }
      for (const key of Object.keys(covered)) expect(ids).toContain(key)
      expect(safetyStockMethods('statistical')).toHaveLength(Object.keys(covered).length)
    })

    it('covers every policy method in the union', () => {
      const covered: Record<SafetyStockPolicyMethod, true> = {
        'days-of-supply': true,
        fixed: true,
        'percentage-of-average': true,
      }
      for (const key of Object.keys(covered)) expect(ids).toContain(key)
      expect(safetyStockMethods('policy')).toHaveLength(Object.keys(covered).length)
    })
  })

  describe('agreement with the functions it describes', () => {
    it('reports an id that each function actually accepts and echoes back', () => {
      // The catalogue's `id` is documented as "the method string the function
      // accepts, and the one it reports back". Both halves are asserted here,
      // because a catalogue naming a method the function rejects is worse than
      // no catalogue.
      const statInput = {
        meanDemand: 10,
        meanLeadTime: 5,
        demandStdDev: 2,
        leadTimeStdDev: 1,
        maxDemand: 20,
        maxLeadTime: 9,
      }
      for (const m of safetyStockMethods('statistical')) {
        const out = safetyStock(statInput, {
          method: m.id as SafetyStockMethod,
          serviceLevel: 0.95,
        })
        expect(out.method).toBe(m.id)
      }

      expect(
        safetyStockPolicy({ method: 'days-of-supply', days: 3, meanDemandPerDay: 4 }).method,
      ).toBe('days-of-supply')
      expect(safetyStockPolicy({ method: 'fixed', quantity: 7 }).method).toBe('fixed')
      expect(
        safetyStockPolicy({
          method: 'percentage-of-average',
          bufferPercentage: 0.2,
          meanDemandPerPeriod: 30,
        }).method,
      ).toBe('percentage-of-average')
    })

    it('declares a min bound that the policy functions really enforce', () => {
      // Every policy parameter declares `min: 0`. A UI trusting that will let a
      // user submit 0 and reject -1, so the function must agree.
      for (const m of safetyStockMethods('policy')) {
        for (const p of m.parameters) {
          expect(p.min).toBe(0)
          expect(p.required).toBe(true)
        }
      }
      expect(() => safetyStockPolicy({ method: 'fixed', quantity: -1 })).toThrow()
      expect(() => safetyStockPolicy({ method: 'fixed', quantity: 0 })).not.toThrow()
    })

    it('requires serviceLevel on EVERY statistical method, with no exemptions', () => {
      // This test used to exempt max-minus-average with a `.filter`, because
      // its formula has no Z term. The exemption was the bug: safetyStock
      // validates serviceLevel BEFORE it selects a formula, so the call fails
      // without one whichever method you asked for, and `auto` can route here.
      // A catalogue-driven UI followed the exemption and under-collected.
      // Asserted with no filter so the same shortcut cannot come back.
      for (const m of safetyStockMethods('statistical')) {
        const sl = m.parameters.find((p) => p.name === 'serviceLevel')
        expect(sl, `${m.id} must declare serviceLevel`).toBeDefined()
        expect(sl?.required).toBe(true)
      }
      // No policy may advertise a service level, since none consults one.
      for (const m of safetyStockMethods('policy')) {
        expect(m.parameters.some((p) => p.name === 'serviceLevel')).toBe(false)
      }
    })

    it('declares serviceLevel bounds as the OPEN interval the function enforces', () => {
      // The catalogue said [0, 1] while safetyStock throws on both ends, so a UI
      // validating against it accepted exactly two values the function rejects.
      for (const m of safetyStockMethods('statistical')) {
        const sl = m.parameters.find((p) => p.name === 'serviceLevel')
        expect(sl?.min).toBe(0)
        expect(sl?.max).toBe(1)
        expect(sl?.minExclusive).toBe(true)
        expect(sl?.maxExclusive).toBe(true)
      }
      const input = { meanDemand: 10, meanLeadTime: 5, demandStdDev: 2 }
      expect(() => safetyStock(input, { serviceLevel: 0 })).toThrow(/\(0, 1\)/)
      expect(() => safetyStock(input, { serviceLevel: 1 })).toThrow(/\(0, 1\)/)
      expect(() => safetyStock(input, { serviceLevel: 0.999 })).not.toThrow()
    })

    it('carries the same citation the function reports, or none on both sides', () => {
      // A UI showing the catalogue's reference next to a number the function
      // explained with a different one is worse than showing nothing. Policies
      // are uncited on purpose, so this asserts the ABSENCE agrees too.
      const statInput = {
        meanDemand: 10,
        meanLeadTime: 5,
        demandStdDev: 2,
        leadTimeStdDev: 1,
        maxDemand: 20,
        maxLeadTime: 9,
      }
      for (const m of safetyStockMethods('statistical')) {
        const out = safetyStock(statInput, {
          method: m.id as SafetyStockMethod,
          serviceLevel: 0.95,
        })
        const cited = (out.citations ?? []).length > 0
        expect(
          cited,
          `${m.id}: function cites ${cited}, catalogue ${m.citation !== undefined}`,
        ).toBe(m.citation !== undefined)
      }
      const policyResults = [
        safetyStockPolicy({ method: 'days-of-supply', days: 1, meanDemandPerDay: 1 }),
        safetyStockPolicy({ method: 'fixed', quantity: 1 }),
        safetyStockPolicy({
          method: 'percentage-of-average',
          bufferPercentage: 0.1,
          meanDemandPerPeriod: 1,
        }),
      ]
      for (const out of policyResults) expect(out.citations).toBeUndefined()
      for (const m of safetyStockMethods('policy')) expect(m.citation).toBeUndefined()
    })
  })

  describe('shape', () => {
    it('gives every entry the fields a picker needs, with no blanks', () => {
      for (const m of all) {
        expect(m.id).toMatch(/^[a-z-]+$/)
        expect(m.name.length).toBeGreaterThan(0)
        expect(m.formula).toMatch(/^SS = /)
        expect(m.description.length).toBeGreaterThan(20)
        expect(m.whenToUse.length).toBeGreaterThan(0)
        expect(m.parameters.length).toBeGreaterThan(0)
        for (const p of m.parameters) {
          expect(p.name.length).toBeGreaterThan(0)
          expect(p.unit.length).toBeGreaterThan(0)
          expect(typeof p.required).toBe('boolean')
        }
      }
    })

    it('has unique ids', () => {
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('filters by kind and rejects an unknown kind', () => {
      expect(safetyStockMethods('policy').every((m) => m.kind === 'policy')).toBe(true)
      expect(safetyStockMethods('statistical').every((m) => m.kind === 'statistical')).toBe(true)
      expect(safetyStockMethods('policy').length + safetyStockMethods('statistical').length).toBe(
        all.length,
      )
      expect(() => safetyStockMethods('nonsense' as unknown as 'policy')).toThrow(/statistical/)
    })

    it('is frozen all the way down, not just at the array', () => {
      // Object.freeze is shallow. The catalogue is one shared instance, so a
      // caller mutating a nested parameter would corrupt it for every other
      // caller in the process. Modules are strict mode, so these throw.
      const first = all[0]
      if (!first) throw new Error('catalogue is empty')
      expect(Object.isFrozen(all)).toBe(true)
      // Both branches. `filter` returns a fresh plain array, so the filtered
      // path silently broke the immutability the TSDoc promises for both.
      expect(Object.isFrozen(safetyStockMethods('policy'))).toBe(true)
      expect(Object.isFrozen(safetyStockMethods('statistical'))).toBe(true)
      expect(Object.isFrozen(first)).toBe(true)
      expect(Object.isFrozen(first.parameters)).toBe(true)
      expect(Object.isFrozen(first.parameters[0])).toBe(true)
      expect(Object.isFrozen(first.whenToUse)).toBe(true)
      expect(() => {
        ;(first.parameters[0] as { unit: string }).unit = 'hacked'
      }).toThrow()
    })
  })
})
