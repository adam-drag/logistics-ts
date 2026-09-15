/**
 * Student's t critical values, as a published table.
 *
 * A slope estimated from a short demand series needs a t distribution, not a
 * normal one. With 12 periods the regression has 10 degrees of freedom and the
 * two-tailed 95% critical value is 2.228 against the normal's 1.960 — 14%
 * wider, which is the difference between calling a trend and not calling one.
 * Substituting `z` here because "n is usually large enough" is exactly the
 * unstated assumption this library exists to avoid.
 *
 * **Why a table rather than an inverse-CDF.** Inverting the t CDF means
 * inverting the regularised incomplete beta function, which is genuinely
 * tricky numerics — the category where {@link ../../../.claude/skills/verify-numerics}
 * says to reach for a trusted dependency, and `core` takes none. A published
 * table is exact at every value it lists, verifiable against the definition,
 * and costs nothing. The trade is that only the three tabulated confidence
 * levels are supported, and {@link tCriticalTwoTailed} throws rather than
 * interpolating between levels.
 *
 * The values are checked in `student-t.test.ts` against the t density itself by
 * numerical integration, not against another table — so a typo in a digit fails
 * the suite rather than silently widening or narrowing every interval.
 *
 * @see Abramowitz, M. & Stegun, I.A. (1964). Handbook of Mathematical
 *   Functions, Table 26.10 (percentage points of the t distribution).
 */

/** Confidence levels the table carries. Anything else throws. */
export type TConfidenceLevel = 0.9 | 0.95 | 0.99

/**
 * Degrees of freedom the table lists, ascending. `Infinity` is the normal
 * limit, where the critical value equals `inverseNormalCdf((1 + c) / 2)`.
 */
const DF_ROWS: readonly number[] = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  40,
  50,
  60,
  80,
  100,
  120,
  Number.POSITIVE_INFINITY,
]

/**
 * Two-tailed critical values `t_{(1+c)/2, ν}`, indexed to match `DF_ROWS`.
 * Each column is a confidence level; the last entry of each is the normal limit.
 */
const TABLE: Readonly<Record<TConfidenceLevel, readonly number[]>> = {
  0.9: [
    6.314, 2.92, 2.353, 2.132, 2.015, 1.943, 1.895, 1.86, 1.833, 1.812, 1.796, 1.782, 1.771, 1.761,
    1.753, 1.746, 1.74, 1.734, 1.729, 1.725, 1.721, 1.717, 1.714, 1.711, 1.708, 1.706, 1.703, 1.701,
    1.699, 1.697, 1.684, 1.676, 1.671, 1.664, 1.66, 1.658, 1.645,
  ],
  0.95: [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16,
    2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052,
    2.048, 2.045, 2.042, 2.021, 2.009, 2.0, 1.99, 1.984, 1.98, 1.96,
  ],
  0.99: [
    63.657, 9.925, 5.841, 4.604, 4.032, 3.707, 3.499, 3.355, 3.25, 3.169, 3.106, 3.055, 3.012,
    2.977, 2.947, 2.921, 2.898, 2.878, 2.861, 2.845, 2.831, 2.819, 2.807, 2.797, 2.787, 2.779,
    2.771, 2.763, 2.756, 2.75, 2.704, 2.678, 2.66, 2.639, 2.626, 2.617, 2.576,
  ],
}

/** The confidence levels the table carries, for error messages and callers. */
export const T_CONFIDENCE_LEVELS: readonly TConfidenceLevel[] = Object.freeze([0.9, 0.95, 0.99])

function isTConfidenceLevel(c: number): c is TConfidenceLevel {
  return c === 0.9 || c === 0.95 || c === 0.99
}

/**
 * Two-tailed Student's t critical value: the `t` with `P(|T_ν| ≤ t) = c`.
 *
 * Use it to test an estimate against zero at confidence `c`: the estimate is
 * significant when `|estimate / standardError| ≥ tCriticalTwoTailed(ν, c)`.
 *
 * **Untabulated degrees of freedom round DOWN to the nearest listed row**, which
 * returns a larger critical value than the exact one. That is deliberate and
 * one-directional: the result is conservative, so this function never makes a
 * borderline effect look significant when it is not. For `ν = 45` it returns the
 * `ν = 40` value of 2.021 rather than the exact 2.014.
 *
 * @param degreesOfFreedom - `ν ≥ 1`. Must be a positive integer, or `Infinity`
 *   for the normal limit. Non-integers round down, so `ν` need not be exact.
 * @param confidenceLevel - One of 0.90, 0.95, 0.99. Other values throw rather
 *   than interpolate, because interpolating between tabulated levels is not
 *   accurate and a silently-wrong critical value is worse than an error.
 * @returns The critical value, always ≥ the corresponding normal quantile.
 * @throws Error naming the supported levels, or rejecting `ν < 1`.
 *
 * @example
 * ```ts
 * tCriticalTwoTailed(10, 0.95)       // 2.228  — a 12-period regression slope
 * tCriticalTwoTailed(Infinity, 0.95) // 1.96   — the normal limit
 * tCriticalTwoTailed(45, 0.95)       // 2.021  — rounds down to the ν = 40 row
 * ```
 */
export function tCriticalTwoTailed(degreesOfFreedom: number, confidenceLevel: number): number {
  if (!isTConfidenceLevel(confidenceLevel)) {
    throw new Error(
      `tCriticalTwoTailed: confidenceLevel must be one of ${T_CONFIDENCE_LEVELS.join(', ')} ` +
        `(got ${confidenceLevel}) — the table carries no other level, and interpolating between ` +
        'levels is not accurate enough to do silently',
    )
  }
  if (Number.isNaN(degreesOfFreedom) || degreesOfFreedom < 1) {
    throw new Error(
      `tCriticalTwoTailed: degreesOfFreedom must be at least 1 (got ${degreesOfFreedom})`,
    )
  }

  const column = TABLE[confidenceLevel]
  // Walk down to the largest tabulated ν that does not exceed the one asked
  // for. Critical values fall as ν rises, so this over-states, never under.
  let index = 0
  for (let i = 0; i < DF_ROWS.length; i++) {
    if ((DF_ROWS[i] as number) <= degreesOfFreedom) index = i
    else break
  }
  return column[index] as number
}
