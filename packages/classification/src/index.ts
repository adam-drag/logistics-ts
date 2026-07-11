/**
 * @logistics-ts/classification — inventory and demand classification.
 *
 * ABC (value), XYZ (variability), FSN (movement), the ABC-XYZ policy matrix, and
 * the Syntetos–Boylan–Croston demand-pattern classifier that drives forecasting
 * method selection. Every classifier returns an `Explained` result.
 */
export {
  type AbcItem,
  type AbcOptions,
  type AbcClassification,
  abc,
} from './abc'
export {
  type XyzOptions,
  type XyzClassification,
  xyz,
} from './xyz'
export {
  type FsnOptions,
  type FsnClassification,
  fsn,
} from './fsn'
export {
  type AbcXyzClass,
  type AbcXyzCell,
  abcXyzMatrix,
} from './matrix'
export {
  type DemandPattern,
  type DemandPatternOptions,
  type DemandPatternResult,
  classifyDemandPattern,
} from './demand-pattern'
