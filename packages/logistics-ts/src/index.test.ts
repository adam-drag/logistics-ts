import { describe, expect, it } from 'vitest'
import { classification, core, forecasting, inventory } from './index'

describe('logistics-ts umbrella', () => {
  it('re-exports every focused package under a namespace', () => {
    expect(typeof core.explain).toBe('function')
    expect(typeof classification.classifyDemandPattern).toBe('function')
    expect(inventory.PACKAGE_NAME).toBe('@logistics-ts/inventory')
    expect(forecasting.PACKAGE_NAME).toBe('@logistics-ts/forecasting')
  })
})
