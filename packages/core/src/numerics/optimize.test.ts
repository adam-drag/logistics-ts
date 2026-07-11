import { describe, expect, it } from 'vitest'
import { nelderMead } from './optimize'

describe('nelderMead', () => {
  it('finds the minimum of a shifted quadratic bowl', () => {
    const f = (x: readonly number[]) => (x[0]! - 3) ** 2 + (x[1]! + 1) ** 2
    const result = nelderMead(f, [0, 0])

    expect(result.converged).toBe(true)
    expect(result.x[0]).toBeCloseTo(3, 4)
    expect(result.x[1]).toBeCloseTo(-1, 4)
    expect(result.fx).toBeCloseTo(0, 8)
  })

  it('solves the Rosenbrock function (minimum at [1, 1])', () => {
    const rosenbrock = (x: readonly number[]) => 100 * (x[1]! - x[0]! ** 2) ** 2 + (1 - x[0]!) ** 2
    const result = nelderMead(rosenbrock, [-1.2, 1], { maxIterations: 2000, tolerance: 1e-12 })

    expect(result.x[0]).toBeCloseTo(1, 3)
    expect(result.x[1]).toBeCloseTo(1, 3)
  })

  it('respects a penalty that bounds the search', () => {
    // Minimise (α - 2)² but constrain α ≤ 1 via a penalty; optimum sits at 1.
    const f = (x: readonly number[]) => {
      const a = x[0]!
      if (a > 1) return 1e9
      return (a - 2) ** 2
    }
    const result = nelderMead(f, [0], { step: 0.2 })
    expect(result.x[0]).toBeCloseTo(1, 3)
  })
})
