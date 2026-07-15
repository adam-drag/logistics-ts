/**
 * logistics-ts — a modular TypeScript supply-chain intelligence toolkit.
 *
 * This umbrella package re-exports the focused packages under namespaces so
 * applications and AI agents can reach everything from a single import:
 *
 * ```ts
 * import { core, inventory, classification, forecasting } from 'logistics-ts'
 * ```
 *
 * Prefer the individual `@logistics-ts/*` packages when you want the smallest
 * install and best tree-shaking. See plans/v0.1.md for the roadmap.
 */

export * as classification from '@logistics-ts/classification'
export * as core from '@logistics-ts/core'
export * as forecasting from '@logistics-ts/forecasting'
export * as inventory from '@logistics-ts/inventory'

export {
  type AbcXyzOptions,
  InventoryAnalyzer,
  type InventoryAnalyzerInput,
} from './inventory-analyzer'
