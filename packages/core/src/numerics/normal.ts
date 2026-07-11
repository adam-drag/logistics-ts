/**
 * Standard-normal distribution helpers. These back service-level → z-score
 * conversions (safety stock) and the unit normal loss integral (fill-rate).
 */

/** Standard-normal probability density function, φ(z). */
export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
}

/**
 * Error function, erf(x), via the Abramowitz & Stegun 7.1.26 rational
 * approximation. Maximum absolute error ≈ 1.5 × 10⁻⁷.
 *
 * @see Abramowitz, M. & Stegun, I.A. (1964). Handbook of Mathematical Functions,
 *   formula 7.1.26.
 */
function erf(x: number): number {
  const sign = Math.sign(x)
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

/**
 * Standard-normal cumulative distribution function, Φ(z). Accuracy follows the
 * underlying erf approximation — absolute error ≈ 1.5 × 10⁻⁷, coarser than
 * {@link inverseNormalCdf}'s 1.15 × 10⁻⁹ and inherited by
 * {@link normalLossFunction}.
 */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

/**
 * Inverse standard-normal CDF (the quantile / probit function): returns the z
 * such that Φ(z) = p.
 *
 * Uses Acklam's rational approximation, with a relative error below
 * 1.15 × 10⁻⁹ across the open interval (0, 1). Returns `-Infinity` at p = 0,
 * `+Infinity` at p = 1, and `NaN` outside [0, 1].
 *
 * @example
 * ```ts
 * inverseNormalCdf(0.95)  // ≈ 1.6448536  (95% service level)
 * inverseNormalCdf(0.975) // ≈ 1.9599640
 * ```
 * @see Acklam, P.J. (2003). An algorithm for computing the inverse normal
 *   cumulative distribution function.
 */
export function inverseNormalCdf(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return Number.NaN
  if (p === 0) return Number.NEGATIVE_INFINITY
  if (p === 1) return Number.POSITIVE_INFINITY

  // Coefficients for Acklam's rational approximation.
  const [a1, a2, a3, a4, a5, a6] = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ]
  const [b1, b2, b3, b4, b5] = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ]
  const [c1, c2, c3, c4, c5, c6] = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ]
  const [d1, d2, d3, d4] = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ]

  // Break-points defining the central region vs the two tails.
  const pLow = 0.02425
  const pHigh = 1 - pLow

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    )
  }
  if (p <= pHigh) {
    const q = p - 0.5
    const r = q * q
    return (
      ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
    )
  }
  const q = Math.sqrt(-2 * Math.log(1 - p))
  return (
    -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
    ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
  )
}

/**
 * Unit normal loss function, E(z) = φ(z) − z · (1 − Φ(z)): the expected shortfall
 * per unit of standard deviation for a standard-normal demand. Used to translate
 * a target **fill rate** (units satisfied) into safety stock — as distinct from
 * a cycle service level (order cycles without stockout).
 *
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and Production
 *   Management in Supply Chains, 4th ed.
 */
export function normalLossFunction(z: number): number {
  return normalPdf(z) - z * (1 - normalCdf(z))
}
