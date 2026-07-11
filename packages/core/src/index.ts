/**
 * @logistics-ts/core — foundational types, data loading, time bucketization,
 * shared numerics, and synthetic data for the logistics-ts toolkit.
 *
 * See plans/v0.1.md for the roadmap. This package has no runtime dependencies.
 */

// Result wrapper
export { type Explained, type Explanation, explain } from './explained'

// Data model
export type { DateInput, DemandRecord, StockRecord, LeadTimeRecord } from './model'

// Tabular input + loaders
export type {
  TableSource,
  TableInput,
  RowInput,
  ColumnarInput,
} from './table/table-source'
export {
  type LoadIssue,
  type LoadResult,
  type LoadOptions,
  type DemandColumnMap,
  type StockColumnMap,
  type LeadTimeColumnMap,
  loadDemand,
  loadStock,
  loadLeadTimes,
} from './table/loader'

// Time
export {
  toEpochDay,
  fromEpochDay,
  formatEpochDay,
  isoWeekday,
} from './time/epoch-day'
export {
  type Granularity,
  type DemandBucket,
  type DemandSeries,
  type BucketizeOptions,
  bucketize,
} from './time/bucketize'

// Numerics
export {
  mean,
  variance,
  standardDeviation,
  coefficientOfVariation,
  squaredCvOfNonZero,
  averageDemandInterval,
} from './numerics/stats'
export {
  normalPdf,
  normalCdf,
  inverseNormalCdf,
  normalLossFunction,
} from './numerics/normal'
export {
  type Objective,
  type NelderMeadOptions,
  type NelderMeadResult,
  nelderMead,
} from './numerics/optimize'

// Synthetic data
export {
  type DemandProfile,
  type GenerateOptions,
  type ExampleDataset,
  generateExampleData,
} from './synthetic/generate'
