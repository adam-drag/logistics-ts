import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME, explain } from './index'

describe('@logistics-ts/inventory scaffold', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@logistics-ts/inventory')
  })

  it('re-exports the Explained helper from core', () => {
    const result = explain(42, { method: 'stub', inputs: {}, reasoning: [] })
    expect(result.value).toBe(42)
  })
})
