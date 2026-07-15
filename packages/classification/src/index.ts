/**
 * @logistics-ts/classification — inventory and demand classification.
 *
 * ABC (value), XYZ (variability), FSN (movement), the ABC-XYZ policy matrix, and
 * the Syntetos–Boylan–Croston demand-pattern classifier that drives forecasting
 * method selection. Every classifier returns an `Explained` result.
 */
export {
  type AbcClassification,
  type AbcItem,
  type AbcOptions,
  abc,
} from './abc'
export {
  classifyDemandPattern,
  type DemandPattern,
  type DemandPatternOptions,
  type DemandPatternResult,
} from './demand-pattern'
export {
  type FsnClassification,
  type FsnOptions,
  fsn,
} from './fsn'
export {
  type AbcXyzCell,
  type AbcXyzClass,
  abcXyzMatrix,
} from './matrix'
export {
  type XyzClassification,
  type XyzOptions,
  xyz,
} from './xyz'
