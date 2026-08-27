/**
 * Doctests for the `@example` blocks in this package — see the note in
 * `packages/core/src/doctest.test.ts` for why these exist. When you change an
 * `@example`, change the matching assertion here.
 */
import { bucketize } from '@logistics-ts/core'
import { describe, expect, it } from 'vitest'
import { fsn } from './fsn'
import { xyz } from './xyz'

// The series both examples are written against.
const series = bucketize(
  [
    { itemId: 'STEADY', date: '2026-01-05', quantity: 10 },
    { itemId: 'STEADY', date: '2026-01-12', quantity: 11 },
    { itemId: 'STEADY', date: '2026-01-19', quantity: 9 },
    { itemId: 'SPIKY', date: '2026-01-05', quantity: 1 },
    { itemId: 'SPIKY', date: '2026-01-12', quantity: 40 },
    { itemId: 'SPIKY', date: '2026-01-19', quantity: 2 },
  ],
  'week',
)

describe('@example blocks in classification', () => {
  it('xyz.ts', () => {
    expect(xyz(series).value).toEqual([
      { itemId: 'SPIKY', class: 'Z', coefficientOfVariation: 1.5511819670374223 },
      { itemId: 'STEADY', class: 'X', coefficientOfVariation: 0.1 },
    ])
  })

  it('fsn.ts', () => {
    expect(fsn(series).value).toEqual([
      { itemId: 'SPIKY', class: 'F', movementRatio: 1 },
      { itemId: 'STEADY', class: 'F', movementRatio: 1 },
    ])
  })
})
