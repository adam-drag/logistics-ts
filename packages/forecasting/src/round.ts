/**
 * Rounds a number to 6 decimal places for use in explanation `inputs` and
 * `reasoning` strings, keeping them readable without hiding real precision.
 * `NaN` passes through unchanged (`Math.round(NaN)` is `NaN`). Internal —
 * not re-exported from the package index.
 */
export function round(x: number): number {
  return Math.round(x * 1e6) / 1e6
}
