/**
 * Input guards shared by the lot-sizing rules. They throw an `Error` naming the
 * offending field, matching the fail-fast style of the sibling packages.
 * Internal — not re-exported from the package index.
 */

/** Throws unless `value` is a finite number `≥ 0`. */
export function requireNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative (got ${value})`)
  }
}

/** Throws unless `value` is a finite number `> 0`. */
export function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be finite and positive (got ${value})`)
  }
}

/**
 * Throws unless `value` is an integer period index in `[0, upperExclusive)`.
 * `Number.isInteger` also rejects `NaN` and `±Infinity`.
 */
export function requirePeriodInRange(name: string, value: number, upperExclusive: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= upperExclusive) {
    throw new Error(`${name} must be an integer period in [0, ${upperExclusive}) (got ${value})`)
  }
}
