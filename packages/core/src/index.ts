/**
 * @logistics-ts/core — foundational types, data loading, time bucketization,
 * shared numerics, and synthetic data for the logistics-ts toolkit.
 *
 * See plans/v0.1.md for the roadmap. This package has no runtime dependencies.
 */

// Result wrapper
export { type Explained, type Explanation, explain } from './explained'

// Data model
export type { DateInput, DemandRecord, LeadTimeRecord, StockRecord } from './model'
export {
  inverseNormalCdf,
  normalCdf,
  normalLossFunction,
  normalPdf,
} from './numerics/normal'
export {
  type NelderMeadOptions,
  type NelderMeadResult,
  nelderMead,
  type Objective,
} from './numerics/optimize'
// Numerics
export {
  averageDemandInterval,
  coefficientOfVariation,
  mean,
  squaredCvOfNonZero,
  standardDeviation,
  variance,
} from './numerics/stats'
// Synthetic data
export {
  type DemandProfile,
  type ExampleDataset,
  type GenerateOptions,
  generateExampleData,
} from './synthetic/generate'
export {
  type DemandColumnMap,
  type LeadTimeColumnMap,
  type LoadIssue,
  type LoadOptions,
  type LoadResult,
  loadDemand,
  loadLeadTimes,
  loadStock,
  type StockColumnMap,
} from './table/loader'
// Tabular input + loaders
export type {
  ColumnarInput,
  RowInput,
  TableInput,
  TableSource,
} from './table/table-source'
export {
  type BucketizeOptions,
  bucketize,
  type DemandBucket,
  type DemandSeries,
  type Granularity,
} from './time/bucketize'
// Time
export {
  formatEpochDay,
  fromEpochDay,
  isoWeekday,
  toEpochDay,
} from './time/epoch-day'
