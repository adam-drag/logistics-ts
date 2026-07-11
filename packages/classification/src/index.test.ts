import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from './index'

describe('@logistics-ts/classification scaffold', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@logistics-ts/classification')
  })
})
