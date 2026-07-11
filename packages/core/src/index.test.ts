import { describe, expect, it } from 'vitest'
import { type Explained, explain } from './index'

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
})
