import { describe, expect, it } from 'vitest'
import { inverseNormalCdf } from './normal'
import { T_CONFIDENCE_LEVELS, type TConfidenceLevel, tCriticalTwoTailed } from './student-t'

/**
 * The table is checked against the t **density**, not against another table.
 *
 * Copying a published table and then testing it by copying the same table again
 * is an algebraic tautology: it proves the two copies match, which is the one
 * thing that is never in doubt. So these tests integrate the density numerically
 * and assert that each tabulated critical value really does cut off the right
 * probability. A single mistyped digit fails the suite.
 *
 * The density is used unnormalised, so no gamma function is needed: the
 * normalising constant cancels in `P = ∫₋∞ˣ f / ∫₋∞^∞ f`.
 */

/**
 * Unnormalised t density under the substitution `t = tan θ`, which maps the
 * infinite range onto `[−π/2, π/2]` so a fixed-step rule can integrate the
 * whole real line including both tails.
 *
 * With `t = tan θ`, `dt = sec²θ dθ`, and dropping the constant `ν^((ν+1)/2)`
 * that cancels in the ratio:
 *
 *   `g(θ) = cosθ^(ν−1) / (cos²θ + sin²θ/ν)^((ν+1)/2)`
 *
 * Computed in logs, because for `ν = 120` the direct form overflows.
 */
function integrand(theta: number, df: number): number {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  if (c === 0) {
    // The θ = ±π/2 endpoints, i.e. |t| → ∞. Zero mass for ν > 1; for ν = 1 the
    // Cauchy limit is exactly 1, and log(0)·0 would be NaN, so short-circuit.
    return df === 1 ? 1 : 0
  }
  const logG = (df - 1) * Math.log(c) - ((df + 1) / 2) * Math.log(c * c + (s * s) / df)
  return Math.exp(logG)
}

/** Composite Simpson's rule over `[a, b]` with `n` (even) intervals. */
function simpson(a: number, b: number, n: number, f: (x: number) => number): number {
  const h = (b - a) / n
  let sum = f(a) + f(b)
  for (let i = 1; i < n; i++) {
    sum += f(a + i * h) * (i % 2 === 0 ? 2 : 4)
  }
  return (sum * h) / 3
}

/** `P(T_ν ≤ x)` by numerical integration of the density above. */
function tCdf(x: number, df: number): number {
  const n = 20000
  const half = Math.PI / 2
  const total = simpson(-half, half, n, (t) => integrand(t, df))
  const lower = simpson(-half, Math.atan(x), n, (t) => integrand(t, df))
  return lower / total
}

const FINITE_DF = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 40, 50, 60, 80, 100, 120,
]

describe('tCriticalTwoTailed', () => {
  describe('every tabulated value cuts off the probability it claims', () => {
    // Tolerance arithmetic: the table is rounded to 3 decimals, so a value is
    // up to 5e-4 away from exact. That displaces the probability by at most
    // 5e-4 × f(x), and the density at the critical point peaks around 0.058
    // (the normal limit at 1.96), giving ~3e-5. Simpson at n = 20000 over a
    // range of π contributes far less. 1e-4 leaves a wide margin without being
    // loose enough to hide a wrong digit, which would move the probability by
    // orders of magnitude more.
    const TOLERANCE = 1e-4

    for (const level of T_CONFIDENCE_LEVELS) {
      it(`holds across every degree of freedom at c = ${level}`, () => {
        const target = (1 + level) / 2
        for (const df of FINITE_DF) {
          const t = tCriticalTwoTailed(df, level)
          expect(tCdf(t, df), `df=${df}, c=${level}, t=${t}`).toBeCloseTo(target, 0)
          expect(Math.abs(tCdf(t, df) - target), `df=${df}, c=${level}, t=${t}`).toBeLessThan(
            TOLERANCE,
          )
        }
      })
    }
  })

  it('agrees with the normal quantile at infinite degrees of freedom', () => {
    // An independent check on the last row: as ν → ∞ the t distribution IS the
    // standard normal, and inverseNormalCdf is separately golden-tested against
    // a published z-table.
    for (const level of T_CONFIDENCE_LEVELS) {
      const t = tCriticalTwoTailed(Number.POSITIVE_INFINITY, level)
      const z = inverseNormalCdf((1 + level) / 2)
      expect(t, `c=${level}`).toBeCloseTo(z, 3)
    }
  })

  it('reproduces the textbook values a planner would look up', () => {
    // Spot values from a standard two-tailed t-table, named so a reader can
    // check them by hand.
    expect(tCriticalTwoTailed(1, 0.95)).toBe(12.706)
    expect(tCriticalTwoTailed(10, 0.95)).toBe(2.228)
    expect(tCriticalTwoTailed(30, 0.95)).toBe(2.042)
    expect(tCriticalTwoTailed(10, 0.9)).toBe(1.812)
    expect(tCriticalTwoTailed(10, 0.99)).toBe(3.169)
  })

  describe('the conservative rounding contract', () => {
    it('rounds an untabulated df DOWN, returning a LARGER critical value', () => {
      // Documented as one-directional: never makes a borderline effect look
      // significant when it is not. ν = 45 sits between the 40 and 50 rows.
      expect(tCriticalTwoTailed(45, 0.95)).toBe(tCriticalTwoTailed(40, 0.95))
      expect(tCriticalTwoTailed(45, 0.95)).toBeGreaterThan(tCriticalTwoTailed(50, 0.95))
      // And the direction holds in general, not just at 45.
      for (const df of [31, 55, 75, 99, 119, 500, 10000]) {
        const exactRowBelow = FINITE_DF.filter((d) => d <= df).at(-1) as number
        expect(tCriticalTwoTailed(df, 0.95), `df=${df}`).toBe(
          tCriticalTwoTailed(exactRowBelow, 0.95),
        )
      }
    })

    it('never returns less than the normal quantile', () => {
      // The normal limit is the floor of the whole table. A value below it
      // would mean a t interval narrower than a z interval, which is backwards.
      for (const level of T_CONFIDENCE_LEVELS) {
        const floor = inverseNormalCdf((1 + level) / 2)
        for (const df of FINITE_DF) {
          expect(tCriticalTwoTailed(df, level), `df=${df}, c=${level}`).toBeGreaterThanOrEqual(
            floor,
          )
        }
      }
    })

    it('decreases monotonically as degrees of freedom rise', () => {
      for (const level of T_CONFIDENCE_LEVELS) {
        const values = [...FINITE_DF, Number.POSITIVE_INFINITY].map((df) =>
          tCriticalTwoTailed(df, level),
        )
        for (let i = 1; i < values.length; i++) {
          expect((values[i] as number) <= (values[i - 1] as number), `c=${level}, i=${i}`).toBe(
            true,
          )
        }
      }
    })

    it('widens as the confidence level rises, at every df', () => {
      for (const df of FINITE_DF) {
        expect(tCriticalTwoTailed(df, 0.9)).toBeLessThan(tCriticalTwoTailed(df, 0.95))
        expect(tCriticalTwoTailed(df, 0.95)).toBeLessThan(tCriticalTwoTailed(df, 0.99))
      }
    })

    it('accepts a non-integer df by rounding down', () => {
      expect(tCriticalTwoTailed(10.9, 0.95)).toBe(tCriticalTwoTailed(10, 0.95))
    })
  })

  describe('validation', () => {
    it('rejects an untabulated confidence level, listing the supported ones', () => {
      // Interpolating between levels is not accurate, and the whole point of
      // the table is that it does not guess. 0.975 is the tempting near-miss.
      expect(() => tCriticalTwoTailed(10, 0.975)).toThrow(/0\.9, 0\.95, 0\.99/)
      expect(() => tCriticalTwoTailed(10, 0.5)).toThrow(/confidenceLevel/)
      expect(() => tCriticalTwoTailed(10, Number.NaN)).toThrow(/confidenceLevel/)
    })

    it('rejects fewer than one degree of freedom', () => {
      expect(() => tCriticalTwoTailed(0, 0.95)).toThrow(/degreesOfFreedom/)
      expect(() => tCriticalTwoTailed(-1, 0.95)).toThrow(/degreesOfFreedom/)
      expect(() => tCriticalTwoTailed(Number.NaN, 0.95)).toThrow(/degreesOfFreedom/)
    })

    it('types the supported levels so a bad literal fails the build', () => {
      // If a level is added to the table, this Record gains a missing key and
      // typecheck fails — the same compile-time exhaustiveness trick the safety
      // stock catalogue uses.
      const covered: Record<TConfidenceLevel, true> = { 0.9: true, 0.95: true, 0.99: true }
      expect(Object.keys(covered)).toHaveLength(T_CONFIDENCE_LEVELS.length)
    })
  })
})
