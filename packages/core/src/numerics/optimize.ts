/**
 * Nelder–Mead simplex minimiser — a derivative-free optimiser used to fit
 * smoothing parameters (e.g. α, β, γ for exponential smoothing) by minimising a
 * sum-of-squared-errors objective. Dependency-free.
 *
 * The search is unconstrained; to impose bounds (such as 0 ≤ α ≤ 1), have the
 * objective return a large penalty outside the feasible region.
 *
 * @see Nelder, J.A. & Mead, R. (1965). A simplex method for function
 *   minimization. The Computer Journal, 7(4), 308–313.
 */

/** A scalar objective over an n-dimensional parameter vector. */
export type Objective = (x: readonly number[]) => number

export interface NelderMeadOptions {
  /** Initial simplex edge length per dimension. Default 0.1. */
  step?: number
  /** Maximum iterations before giving up. Default 200. */
  maxIterations?: number
  /**
   * Convergence tolerance on the spread of objective values across the simplex.
   * Default 1e-8.
   */
  tolerance?: number
}

export interface NelderMeadResult {
  /** The best parameter vector found. */
  x: number[]
  /** The objective value at {@link NelderMeadResult.x}. */
  fx: number
  /** Iterations performed. */
  iterations: number
  /** Whether the tolerance was met before `maxIterations`. */
  converged: boolean
}

interface Vertex {
  x: number[]
  fx: number
}

/** Minimises `f` starting from `x0` using the Nelder–Mead simplex method. */
export function nelderMead(
  f: Objective,
  x0: readonly number[],
  options: NelderMeadOptions = {},
): NelderMeadResult {
  const { step = 0.1, maxIterations = 200, tolerance = 1e-8 } = options
  const n = x0.length

  // Standard reflection / expansion / contraction / shrink coefficients.
  const alpha = 1
  const gamma = 2
  const rho = 0.5
  const sigma = 0.5

  // Build the initial simplex: x0 plus one offset vertex per dimension.
  const simplex: Vertex[] = [{ x: [...x0], fx: f(x0) }]
  for (let i = 0; i < n; i++) {
    const x = [...x0]
    x[i] = (x[i] ?? 0) + step
    simplex.push({ x, fx: f(x) })
  }

  let iterations = 0
  let converged = false

  for (; iterations < maxIterations; iterations++) {
    simplex.sort((p, q) => p.fx - q.fx)
    const best = simplex[0] as Vertex
    const worst = simplex[n] as Vertex
    const secondWorst = simplex[n - 1] as Vertex

    // Converged when the best and worst objective values are within tolerance.
    if (Math.abs(worst.fx - best.fx) <= tolerance) {
      converged = true
      break
    }

    // Centroid of every vertex except the worst.
    const centroid = new Array<number>(n).fill(0)
    for (let i = 0; i < n; i++) {
      const v = simplex[i] as Vertex
      for (let j = 0; j < n; j++) centroid[j] = (centroid[j] as number) + (v.x[j] as number)
    }
    for (let j = 0; j < n; j++) centroid[j] = (centroid[j] as number) / n

    const reflected = evaluate(f, combine(centroid, worst.x, alpha))

    if (reflected.fx < best.fx) {
      // Reflection beat the best — try expanding further in that direction.
      const expanded = evaluate(f, combine(centroid, worst.x, alpha * gamma))
      simplex[n] = expanded.fx < reflected.fx ? expanded : reflected
    } else if (reflected.fx < secondWorst.fx) {
      // Reflection is a middling improvement — accept it.
      simplex[n] = reflected
    } else {
      // Reflection is poor — contract towards the centroid.
      const contracted = evaluate(f, combine(centroid, worst.x, rho))
      if (contracted.fx < worst.fx) {
        simplex[n] = contracted
      } else {
        // Contraction failed too — shrink the whole simplex towards the best.
        for (let i = 1; i <= n; i++) {
          const v = simplex[i] as Vertex
          const x = v.x.map((xi, j) => (best.x[j] as number) + sigma * (xi - (best.x[j] as number)))
          simplex[i] = evaluate(f, x)
        }
      }
    }
  }

  simplex.sort((p, q) => p.fx - q.fx)
  const best = simplex[0] as Vertex
  return { x: best.x, fx: best.fx, iterations, converged }
}

/** Reflects the worst point through the centroid by `coefficient`. */
function combine(
  centroid: readonly number[],
  worst: readonly number[],
  coefficient: number,
): number[] {
  return centroid.map((c, j) => c + coefficient * (c - (worst[j] as number)))
}

function evaluate(f: Objective, x: number[]): Vertex {
  return { x, fx: f(x) }
}
