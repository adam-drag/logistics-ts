import { describe, expect, it } from 'vitest'
import { type Explained, explain } from './explained'

describe('explain', () => {
  it('wraps a value with its explanation metadata', () => {
    const result: Explained<number> = explain(120, {
      method: 'king-formula',
      inputs: { serviceLevel: 0.95, leadTimeDays: 14 },
      reasoning: ['95% service level', 'demand variability dominates'],
    })

    expect(result.value).toBe(120)
    expect(result.method).toBe('king-formula')
    expect(result.inputs.serviceLevel).toBe(0.95)
    expect(result.reasoning).toHaveLength(2)
  })

  it('preserves optional citations and warnings', () => {
    const result = explain(0, {
      method: 'stub',
      inputs: {},
      reasoning: [],
      citations: ['King (2011)'],
      warnings: ['only 3 periods of history'],
    })

    expect(result.citations).toEqual(['King (2011)'])
    expect(result.warnings).toEqual(['only 3 periods of history'])
  })
})
