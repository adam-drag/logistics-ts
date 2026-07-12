import { describe, expect, it } from 'vitest'
import { tsb } from './tsb'

describe('tsb (hand-computed, α_z=α_p=0.5)', () => {
  // t0=1(4): z=4,p=1/2. t2 zero: p=.25. t3 zero: p=.125. t4(2): z=3,p=.5625 → rate 1.6875
  const { value } = tsb([0, 4, 0, 0, 2], { alphaDemand: 0.5, alphaProbability: 0.5 })

  it('forecasts probability × size', () => {
    expect(value.forecast[0]).toBeCloseTo(1.6875, 10)
    expect(value.params.probability).toBeCloseTo(0.5625, 6)
    expect(value.params.size).toBeCloseTo(3, 6)
  })

  it('decays the fitted rate across a zero run', () => {
    expect(value.fitted[2]).toBeCloseTo(2.0, 10) // 0.5·4
    expect(value.fitted[3]).toBeCloseTo(1.0, 10) // 0.25·4
    expect(value.fitted[4]).toBeCloseTo(0.5, 10) // 0.125·4
  })
})

describe('tsb obsolescence behaviour', () => {
  it('drives the forecast toward zero after a long trailing zero run', () => {
    const early = tsb([5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], {
      alphaDemand: 0.2,
      alphaProbability: 0.2,
    })
    // probability decayed heavily; forecast far below the demand size
    expect(early.value.forecast[0]).toBeLessThan(1)
    expect(early.value.params.probability as number).toBeLessThan(0.2)
  })

  it('forecasts zero with a warning when there is no demand', () => {
    const r = tsb([0, 0, 0, 0])
    expect(r.value.forecast).toEqual([0])
    expect(r.warnings?.[0]).toMatch(/no demand/)
  })
})

describe('tsb validation', () => {
  it('rejects empty series, out-of-range alphas, and bad horizon', () => {
    expect(() => tsb([])).toThrow(/non-empty/)
    expect(() => tsb([1, 0], { alphaDemand: 0 })).toThrow(/alphaDemand/)
    expect(() => tsb([1, 0], { alphaProbability: 1 })).toThrow(/alphaProbability/)
    expect(() => tsb([1, 0], { horizon: 0 })).toThrow(/positive integer/)
  })
})
