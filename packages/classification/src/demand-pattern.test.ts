import { describe, expect, it } from 'vitest'
import { classifyDemandPattern } from './demand-pattern'

describe('classifyDemandPattern (SBC)', () => {
  it('classifies frequent, stable demand as smooth', () => {
    const { value } = classifyDemandPattern([10, 11, 9, 10, 12, 10, 9, 11])
    expect(value.pattern).toBe('smooth')
    expect(value.recommendedMethods).toContain('SES')
  })

  it('classifies frequent, highly variable demand as erratic', () => {
    const { value } = classifyDemandPattern([1, 50, 2, 40, 3, 60, 1, 45])
    expect(value.pattern).toBe('erratic')
  })

  it('classifies sporadic, stable-size demand as intermittent', () => {
    const { value } = classifyDemandPattern([0, 5, 0, 0, 5, 0, 5, 0, 0, 5])
    expect(value.pattern).toBe('intermittent')
    expect(value.adi).toBeCloseTo(2.5, 10)
    expect(value.cv2).toBeCloseTo(0, 10)
    expect(value.recommendedMethods).toEqual(['Croston', 'SBA'])
  })

  it('classifies sporadic, variable-size demand as lumpy', () => {
    const { value } = classifyDemandPattern([0, 2, 0, 0, 50, 0, 3, 0, 0, 40])
    expect(value.pattern).toBe('lumpy')
    expect(value.adi).toBeCloseTo(2.5, 10)
    expect(value.cv2).toBeGreaterThan(0.49)
  })

  it('honours custom cutoffs', () => {
    // With a very high ADI cutoff, the sporadic series is treated as frequent.
    const { value } = classifyDemandPattern([0, 5, 0, 0, 5, 0, 5, 0, 0, 5], { adiCutoff: 5 })
    expect(value.pattern).toBe('smooth')
  })

  it('warns when there is no demand', () => {
    const { value, warnings } = classifyDemandPattern([0, 0, 0, 0])
    expect(warnings?.[0]).toMatch(/no demand/i)
    expect(value.pattern).toBeDefined()
  })

  it('warns when there is a single demand occurrence', () => {
    const { warnings } = classifyDemandPattern([0, 7, 0, 0])
    expect(warnings?.[0]).toMatch(/fewer than two/i)
  })

  it('returns an explanation with method and citation', () => {
    const { method, citations, reasoning } = classifyDemandPattern([0, 5, 0, 5])
    expect(method).toBe('syntetos-boylan-croston')
    expect(citations?.[0]).toMatch(/Syntetos/)
    expect(reasoning.length).toBeGreaterThan(0)
  })
})
