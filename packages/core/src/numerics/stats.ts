/**
 * Descriptive statistics used throughout logistics-ts. Sample statistics use the
 * unbiased (n − 1) denominator by default; pass `population: true` for the
 * biased (n) form where the data is the whole population.
 */

/** Arithmetic mean. Returns `NaN` for an empty input. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/**
 * Variance. Sample (n − 1) by default; population (n) when `population` is true.
 * Returns `NaN` for the sample form given fewer than two values, and for the
 * population form given an empty input.
 */
export function variance(values: readonly number[], population = false): number {
  const n = values.length
  if (population ? n === 0 : n < 2) return Number.NaN
  const m = mean(values)
  let sumSq = 0
  for (const v of values) {
    const d = v - m
    sumSq += d * d
  }
  return sumSq / (population ? n : n - 1)
}

/** Standard deviation — the square root of {@link variance}. */
export function standardDeviation(values: readonly number[], population = false): number {
  return Math.sqrt(variance(values, population))
}

/**
 * Coefficient of variation: standard deviation divided by the mean. A unitless
 * measure of relative dispersion. Returns `NaN` when the mean is zero.
 */
export function coefficientOfVariation(values: readonly number[], population = false): number {
  const m = mean(values)
  if (m === 0) return Number.NaN
  return standardDeviation(values, population) / m
}

/**
 * Squared coefficient of variation (CV²) of the **non-zero** values only.
 *
 * This is the demand-lumpiness axis of the Syntetos–Boylan–Croston
 * classification: CV² is computed over demand *sizes* (the periods with demand),
 * ignoring the zero periods. Returns `NaN` when there are fewer than two
 * non-zero values.
 *
 * @see Syntetos, A.A., Boylan, J.E. & Croston, J.D. (2005). On the categorization
 *   of demand patterns. Journal of the Operational Research Society, 56(5).
 */
export function squaredCvOfNonZero(values: readonly number[]): number {
  const nonZero = values.filter((v) => v !== 0)
  const cv = coefficientOfVariation(nonZero)
  return cv * cv
}

/**
 * Average Demand Interval (ADI): the mean number of periods between consecutive
 * non-zero demands, measured across the full series length.
 *
 * Defined as `periods / numberOfNonZeroDemands`. This is the demand-intermittence
 * axis of the Syntetos–Boylan–Croston classification. Returns `NaN` when there
 * are no non-zero demands.
 *
 * @param series - Demand per period, including zero periods.
 * @see Syntetos, Boylan & Croston (2005).
 */
export function averageDemandInterval(series: readonly number[]): number {
  if (series.length === 0) return Number.NaN
  let nonZeroCount = 0
  for (const v of series) if (v !== 0) nonZeroCount++
  if (nonZeroCount === 0) return Number.NaN
  return series.length / nonZeroCount
}
