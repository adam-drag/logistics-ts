/**
 * The {@link Explained} result wrapper — the cross-cutting contract that every
 * numeric output in logistics-ts returns. Instead of a bare number, callers get
 * the value alongside a machine-readable account of how it was derived, so that
 * humans and AI agents can inspect the method, the inputs, and the reasoning.
 */

/**
 * A computed result paired with a machine-readable explanation of how it was
 * derived.
 *
 * @typeParam T - The type of the computed value.
 */
export interface Explained<T> {
  /** The computed value. */
  value: T
  /** Identifier of the method used, e.g. `"king-formula"`. */
  method: string
  /** Every input value that fed the computation, keyed by name. */
  inputs: Record<string, number | string>
  /** Human- and agent-readable bullet points explaining the result. */
  reasoning: string[]
  /** Optional literature citations backing the method. */
  citations?: string[]
  /** Optional caveats, e.g. low sample size or an undefined-metric condition. */
  warnings?: string[]
}

/** The explanation metadata of an {@link Explained} result, without its value. */
export type Explanation<T> = Omit<Explained<T>, 'value'>

/**
 * Constructs an {@link Explained} result from a value and its explanation.
 *
 * @example
 * ```ts
 * explain(120, {
 *   method: 'king-formula',
 *   inputs: { serviceLevel: 0.95, leadTimeDays: 14 },
 *   reasoning: ['95% service level', 'demand variability dominates'],
 * })
 * ```
 */
export function explain<T>(value: T, explanation: Explanation<T>): Explained<T> {
  return { value, ...explanation }
}
