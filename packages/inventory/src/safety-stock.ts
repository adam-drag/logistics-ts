/**
 * Safety stock — extra inventory held to buffer demand and lead-time
 * variability so a target service level is met. Implemented as a family of
 * named formulas rather than one function, because the correct formula
 * depends on which sources of variability you have data for.
 *
 * **Cycle service level ≠ fill rate.** Every formula here controls the
 * probability that a replenishment *cycle* does not stock out — not the
 * fraction of demand *units* satisfied (fill rate), which is a stricter,
 * different target. The two diverge meaningfully at low service levels and
 * for lumpy demand. A fill-rate-based safety stock uses the unit normal loss
 * function (`normalLossFunction` in `@logistics-ts/core`) and is a documented
 * gap here, not yet implemented.
 *
 * @see King, P.L. (2011). Crack the Code: Understanding Safety Stock and
 *   Mastering Its Equations. APICS Magazine, July/August 2011.
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and
 *   Production Management in Supply Chains, 4th ed.
 */
import { classifyDemandPattern, type DemandPattern } from '@logistics-ts/classification'
import { type Explained, explain, inverseNormalCdf, standardDeviation } from '@logistics-ts/core'
import { round } from './round'

/** Which safety-stock formula to use. */
export type SafetyStockMethod =
  | 'demand-variability'
  | 'leadtime-variability'
  | 'king'
  | 'max-minus-average'
  | 'auto'

export interface SafetyStockInput {
  /** Mean demand per period (D̄), e.g. units/day. */
  meanDemand: number
  /** Mean replenishment lead time (L̄), in the same period unit as `meanDemand`. */
  meanLeadTime: number
  /** Standard deviation of demand per period (σD). Required for `demand-variability`/`king`. */
  demandStdDev?: number
  /** Standard deviation of lead time (σLT), same unit as `meanLeadTime`. Required for `leadtime-variability`/`king`. */
  leadTimeStdDev?: number
  /** Historical maximum demand per period. Required for `max-minus-average`. */
  maxDemand?: number
  /** Historical maximum lead time. Required for `max-minus-average`. */
  maxLeadTime?: number
  /**
   * Optional raw demand series (zero-filled, e.g. from `bucketize`). When
   * `method: 'auto'` and `demandStdDev`/`pattern` aren't supplied directly,
   * they are derived from this series.
   */
  series?: readonly number[]
  /** Optional pre-computed SBC pattern, to avoid re-running `classifyDemandPattern`. */
  pattern?: DemandPattern
}

export interface SafetyStockOptions {
  /** Which formula to use. Default `'auto'` — picks the richest formula the supplied inputs support. */
  method?: SafetyStockMethod
  /** Target cycle service level, e.g. `0.95` for 95%. Must be in the open interval (0, 1). */
  serviceLevel: number
}

/**
 * Computes safety stock for one item.
 *
 * Formulas (`Z = inverseNormalCdf(serviceLevel)`):
 * - `demand-variability`: `SS = Z · σD · √L̄` — buffers demand variability
 *   only; assumes a fixed lead time.
 * - `leadtime-variability`: `SS = Z · D̄ · σLT` — buffers lead-time
 *   variability only; assumes fixed demand.
 * - `king`: `SS = Z · √(L̄·σD² + D̄²·σLT²)` — the combined formula most
 *   organisations actually use, buffering both sources at once.
 * - `max-minus-average`: `SS = maxDemand·maxLeadTime − meanDemand·meanLeadTime`
 *   — a simple heuristic needing no variance estimate.
 * - `auto`: picks `king` when both σD and σLT are available, else whichever
 *   single-source formula the data supports, else `max-minus-average`; throws
 *   if none of these are computable. When a `series`/`pattern` shows
 *   intermittent/lumpy demand, a warning notes that these Z-score formulas
 *   assume approximately normal demand and are a rougher guide there — no
 *   formula swap is made, since no cited source maps SBC quadrants to a
 *   specific safety-stock formula.
 *
 * @example
 * ```ts
 * safetyStock(
 *   { meanDemand: 100, meanLeadTime: 7, demandStdDev: 20, leadTimeStdDev: 1 },
 *   { method: 'king', serviceLevel: 0.95 },
 * ).value // ≈ 186.1
 * ```
 */
export function safetyStock(
  input: SafetyStockInput,
  options: SafetyStockOptions,
): Explained<number> {
  const { serviceLevel } = options
  if (!(serviceLevel > 0 && serviceLevel < 1)) {
    throw new Error(`safetyStock: serviceLevel must be in (0, 1) (got ${serviceLevel})`)
  }
  const z = inverseNormalCdf(serviceLevel)

  const { meanDemand, meanLeadTime } = input
  requireNonNegative('meanDemand', meanDemand)
  requireNonNegative('meanLeadTime', meanLeadTime)
  requireNonNegative('demandStdDev', input.demandStdDev)
  requireNonNegative('leadTimeStdDev', input.leadTimeStdDev)
  requireNonNegative('maxDemand', input.maxDemand)
  requireNonNegative('maxLeadTime', input.maxLeadTime)

  const warnings: string[] = []

  let demandStdDev = input.demandStdDev
  let pattern = input.pattern
  if (input.series !== undefined) {
    if (demandStdDev === undefined) {
      // standardDeviation is NaN with fewer than two data points (or a
      // NaN-contaminated series) — leave demandStdDev unset rather than
      // letting a NaN "value" satisfy `!== undefined` checks below and
      // silently produce a NaN safety stock.
      const derived = standardDeviation(input.series)
      if (Number.isFinite(derived)) {
        demandStdDev = derived
      } else {
        warnings.push(
          'series has fewer than two data points; could not derive demandStdDev from it',
        )
      }
    }
    if (pattern === undefined) pattern = classifyDemandPattern(input.series).value.pattern
  }

  const requestedMethod = options.method ?? 'auto'

  let resolvedMethod: Exclude<SafetyStockMethod, 'auto'>
  if (requestedMethod === 'auto') {
    if (demandStdDev !== undefined && input.leadTimeStdDev !== undefined) {
      resolvedMethod = 'king'
    } else if (input.leadTimeStdDev !== undefined) {
      resolvedMethod = 'leadtime-variability'
    } else if (demandStdDev !== undefined) {
      resolvedMethod = 'demand-variability'
    } else if (input.maxDemand !== undefined && input.maxLeadTime !== undefined) {
      resolvedMethod = 'max-minus-average'
    } else {
      throw new Error(
        'safetyStock: auto requires demandStdDev (or series), leadTimeStdDev, or maxDemand+maxLeadTime',
      )
    }
    if (pattern === 'intermittent' || pattern === 'lumpy') {
      warnings.push(
        `demand pattern is ${pattern}; Z-score safety stock assumes approximately normal demand and is a rougher guide here — consider it a starting point`,
      )
    }
  } else {
    resolvedMethod = requestedMethod
  }

  const inputs: Record<string, number | string> = {
    meanDemand,
    meanLeadTime,
    serviceLevel,
    z: round(z),
  }
  let value: number
  let reasoning: string
  let citation: string

  switch (resolvedMethod) {
    case 'demand-variability': {
      if (demandStdDev === undefined) {
        throw new Error("safetyStock: method 'demand-variability' requires demandStdDev or series")
      }
      value = z * demandStdDev * Math.sqrt(meanLeadTime)
      inputs.demandStdDev = demandStdDev
      reasoning = 'SS = Z · σD · √L̄ — buffers demand variability, assumes a fixed lead time'
      citation = 'Silver, Pyke & Thomas (2017), Inventory and Production Management'
      break
    }
    case 'leadtime-variability': {
      const leadTimeStdDev = input.leadTimeStdDev
      if (leadTimeStdDev === undefined) {
        throw new Error("safetyStock: method 'leadtime-variability' requires leadTimeStdDev")
      }
      value = z * meanDemand * leadTimeStdDev
      inputs.leadTimeStdDev = leadTimeStdDev
      reasoning = 'SS = Z · D̄ · σLT — buffers lead-time variability, assumes fixed demand'
      citation = 'Silver, Pyke & Thomas (2017), Inventory and Production Management'
      break
    }
    case 'king': {
      const leadTimeStdDev = input.leadTimeStdDev
      if (demandStdDev === undefined || leadTimeStdDev === undefined) {
        throw new Error(
          "safetyStock: method 'king' requires demandStdDev (or series) and leadTimeStdDev",
        )
      }
      value =
        z * Math.sqrt(meanLeadTime * demandStdDev ** 2 + meanDemand ** 2 * leadTimeStdDev ** 2)
      inputs.demandStdDev = demandStdDev
      inputs.leadTimeStdDev = leadTimeStdDev
      reasoning = 'SS = Z · √(L̄·σD² + D̄²·σLT²) — buffers demand and lead-time variability together'
      citation = 'King, P.L. (2011), APICS Magazine'
      break
    }
    case 'max-minus-average': {
      const { maxDemand, maxLeadTime } = input
      if (maxDemand === undefined || maxLeadTime === undefined) {
        throw new Error(
          "safetyStock: method 'max-minus-average' requires maxDemand and maxLeadTime",
        )
      }
      value = maxDemand * maxLeadTime - meanDemand * meanLeadTime
      inputs.maxDemand = maxDemand
      inputs.maxLeadTime = maxLeadTime
      reasoning =
        'SS = maxDemand·maxLeadTime − meanDemand·meanLeadTime — a heuristic buffer needing no variance estimate'
      citation = 'Silver, Pyke & Thomas (2017), Inventory and Production Management'
      break
    }
  }

  if (value < 0) {
    warnings.push(
      'computed safety stock was negative (the worst case does not exceed the average case); clamped to 0',
    )
    value = 0
  }

  return explain(value, {
    method: requestedMethod === 'auto' ? `auto-${resolvedMethod}` : resolvedMethod,
    inputs,
    reasoning: [reasoning],
    citations: [citation],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}

function requireNonNegative(name: string, value: number | undefined): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`safetyStock: ${name} must be finite and non-negative (got ${value})`)
  }
}
