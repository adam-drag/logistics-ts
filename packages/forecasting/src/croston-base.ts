/**
 * Shared Croston recursion, used by {@link croston} and {@link sba}. Internal —
 * not re-exported from the package index.
 *
 * Croston's method decomposes an intermittent series into two sub-series that
 * are each simple-exponentially smoothed on **demand periods only**: the
 * non-zero demand size `z` and the inter-demand interval `q`. The per-period
 * demand rate is `ẑ / q̂`.
 *
 * @see Croston, J.D. (1972). Forecasting and stock control for intermittent
 *   demands. Operational Research Quarterly, 23(3), 289–303.
 */

export interface CrostonRecursion {
  /** Smoothed non-zero demand size `ẑ`. */
  size: number
  /** Smoothed inter-demand interval `q̂` (periods per demand). */
  interval: number
  /** Base per-period demand rate `ẑ / q̂` (before any bias correction). */
  rate: number
  /**
   * One-step-ahead fitted rate per period: the rate known *before* observing
   * that period. `NaN` until the first demand has been seen. Length = series.
   */
  fitted: number[]
  /** Number of non-zero demand occurrences. */
  occurrences: number
}

/**
 * Runs the Croston size/interval smoothing over a series.
 *
 * Initialisation follows the common convention: at the first demand (index
 * `t₀`) `ẑ = y_{t₀}` and `q̂ = t₀ + 1` (periods elapsed through the first
 * demand). Thereafter, on each demand at interval `Δ` from the previous one,
 * `ẑ ← α·y + (1−α)·ẑ` and `q̂ ← α·Δ + (1−α)·q̂`.
 *
 * @param series - Demand per period, oldest → newest, zero-filled.
 * @param alpha - Smoothing constant `α ∈ (0, 1)`.
 */
export function crostonRecursion(series: readonly number[], alpha: number): CrostonRecursion {
  const fitted: number[] = new Array(series.length).fill(Number.NaN)
  let size = Number.NaN
  let interval = Number.NaN
  let rate = Number.NaN
  let lastDemand = -1
  let occurrences = 0

  for (let t = 0; t < series.length; t++) {
    fitted[t] = rate // one-step forecast for period t = rate known before t
    const y = series[t] as number
    if (y > 0) {
      occurrences++
      if (lastDemand === -1) {
        size = y
        interval = t + 1
      } else {
        const delta = t - lastDemand
        size = alpha * y + (1 - alpha) * size
        interval = alpha * delta + (1 - alpha) * interval
      }
      lastDemand = t
      rate = size / interval
    }
  }

  return { size, interval, rate, fitted, occurrences }
}
