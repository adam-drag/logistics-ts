/**
 * @logistics-ts/core — foundational types and utilities.
 *
 * M0 scaffold: this package currently exposes only the cross-cutting
 * {@link Explained} result wrapper. The data model, column store, loader, and
 * shared numerics land in M1 (see plans/v0.1.md).
 */

/**
 * A computed result paired with a machine-readable explanation of how it was
 * derived. Every numeric output in logistics-ts is wrapped in this so that
 * humans — and AI agents — can see the method, the inputs, and the reasoning.
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
  /** Optional caveats, e.g. low sample size or undefined-metric conditions. */
  warnings?: string[]
}

/** Constructs an {@link Explained} result. */
export function explain<T>(value: T, meta: Omit<Explained<T>, 'value'>): Explained<T> {
  return { value, ...meta }
}
