/**
 * Fill rate (Type-2 service, β) and the bridge between the two service-level
 * definitions the toolkit supports.
 *
 * **Cycle service level (α) ≠ fill rate (β).** Cycle service level — what
 * `safetyStock` targets — is the probability that a replenishment *cycle* does
 * not stock out, `α = Φ(z)`. Fill rate is the fraction of demand *units*
 * satisfied directly from stock, `β = 1 − ESC/Q`, where `ESC` is the expected
 * number of units short per cycle. They answer different questions and are not
 * interchangeable: for a given safety stock, β ≥ α typically, and the gap
 * widens as the order quantity `Q` grows relative to lead-time demand
 * variability (a larger `Q` spreads a fixed per-cycle shortfall over more
 * units). Report β, not α, when the business cares about the share of demand
 * met on time.
 *
 * All three functions here are built on the unit normal loss function
 * `G(z) = φ(z) − z·(1 − Φ(z))` (`normalLossFunction` in `@logistics-ts/core`),
 * the expected shortfall per unit of standard deviation for standard-normal
 * demand.
 *
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and Production
 *   Management in Supply Chains, 4th ed. (fill rate / Type-2 service, ESC).
 * @see Silver, E.A., Pyke, D.F. & Peterson, R. (1998). Inventory Management and
 *   Production Planning and Scheduling, 3rd ed.
 */
import { type Explained, explain, inverseNormalCdf, normalLossFunction } from '@logistics-ts/core'
import { round } from './round'

const SPT_CITATION =
  'Silver, Pyke & Thomas (2017), Inventory and Production Management in Supply Chains'

export interface FillRateInput {
  /**
   * Safety stock held above expected lead-time demand, in demand units. May be
   * negative (a buffer below the mean), which yields a fill rate under 50%.
   */
  safetyStock: number
  /**
   * Standard deviation of demand over the replenishment lead time (σ_L), in the
   * same demand units. Must be finite and positive.
   */
  sigmaLeadTime: number
  /** Replenishment order quantity (Q), in demand units. Must be finite and positive. */
  orderQuantity: number
}

export interface FillRateResult {
  /** Type-2 service level β — fraction of demand units met directly from stock, in [0, 1]. */
  fillRate: number
  /** Expected units short per replenishment cycle, `ESC = σ_L · G(z)`. */
  expectedShortagePerCycle: number
  /** Safety factor `z = safetyStock / σ_L`. */
  z: number
}

/**
 * Fill rate (Type-2 service level, β): the fraction of demand units satisfied
 * directly from stock over a replenishment cycle.
 *
 * Formula (`G` is the unit normal loss function):
 * - `z = safetyStock / σ_L`
 * - `ESC = σ_L · G(z)` — expected units short per cycle
 * - `β = 1 − ESC / Q`
 *
 * This is **not** the cycle service level (α = Φ(z)) that `safetyStock` targets;
 * for the same safety stock, β ≥ α typically. A computed β below 0 (expected
 * shortage exceeds a whole order quantity — a grossly inadequate buffer) is
 * clamped to 0 and flagged in `warnings`.
 *
 * @example
 * ```ts
 * fillRate({ safetyStock: 50, sigmaLeadTime: 50, orderQuantity: 200 }).value
 * // { fillRate: ≈ 0.97917, expectedShortagePerCycle: ≈ 4.1658, z: 1 }
 * ```
 * @see Silver, Pyke & Thomas (2017), §7 — fill rate and expected shortage per cycle.
 */
export function fillRate(input: FillRateInput): Explained<FillRateResult> {
  const { safetyStock, sigmaLeadTime, orderQuantity } = input
  requireFinite('fillRate', 'safetyStock', safetyStock)
  requirePositive('fillRate', 'sigmaLeadTime', sigmaLeadTime)
  requirePositive('fillRate', 'orderQuantity', orderQuantity)

  const z = safetyStock / sigmaLeadTime
  const expectedShortagePerCycle = sigmaLeadTime * normalLossFunction(z)
  let fill = 1 - expectedShortagePerCycle / orderQuantity

  const warnings: string[] = []
  if (fill < 0) {
    warnings.push(
      `expected shortage per cycle (${round(expectedShortagePerCycle)}) exceeds the order quantity (${orderQuantity}); fill rate clamped to 0 — the buffer is far too small for this order quantity`,
    )
    fill = 0
  }

  return explain(
    { fillRate: fill, expectedShortagePerCycle, z },
    {
      method: 'fill-rate',
      inputs: {
        safetyStock,
        sigmaLeadTime,
        orderQuantity,
        z: round(z),
      },
      reasoning: [
        'z = safetyStock / σ_L — safety factor in standard deviations of lead-time demand',
        `ESC = σ_L · G(z) = ${round(expectedShortagePerCycle)} — expected units short per cycle (G is the unit normal loss function)`,
        `β = 1 − ESC / Q = ${round(fill)} — Type-2 service (fraction of demand units filled from stock)`,
        'β is the fill rate, not the cycle service level α = Φ(z); for a fixed safety stock β ≥ α typically',
      ],
      citations: [SPT_CITATION],
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  )
}

export interface SafetyStockForFillRateInput {
  /** Target Type-2 service level β. Must be in the open interval (0, 1). */
  targetFillRate: number
  /**
   * Standard deviation of demand over the replenishment lead time (σ_L), in
   * demand units. Must be finite and positive.
   */
  sigmaLeadTime: number
  /** Replenishment order quantity (Q), in demand units. Must be finite and positive. */
  orderQuantity: number
}

export interface SafetyStockForFillRateResult {
  /** Safety stock delivering the target fill rate, `SS = z · σ_L`. May be negative for a low target. */
  safetyStock: number
  /** Safety factor `z` solving `G(z) = (1 − β)·Q / σ_L`. */
  z: number
}

/**
 * Inverts {@link fillRate}: the safety stock needed to hit a target Type-2
 * service level β.
 *
 * Solves `G(z) = (1 − β)·Q / σ_L` for `z`, then returns `SS = z · σ_L`. The unit
 * normal loss function `G` is continuous and strictly monotone **decreasing** on
 * ℝ (from +∞ as z → −∞ to 0 as z → +∞), so the root is unique and found by
 * **bisection** on `normalLossFunction` — no new dependency and no closed-form
 * inverse. `z` (hence `SS`) is negative when the target fill rate is low enough
 * that `(1 − β)·Q / σ_L > G(0) = 0.3989`; that is flagged in `warnings`.
 *
 * The target is a fill rate (β), not a cycle service level (α); the two differ.
 *
 * @example
 * ```ts
 * safetyStockForFillRate({ targetFillRate: 0.97917, sigmaLeadTime: 50, orderQuantity: 200 }).value
 * // { safetyStock: ≈ 50, z: ≈ 1 }  — round-trips with the fillRate example above
 * ```
 * @see Silver, Pyke & Thomas (2017), §7 — inverting the loss function for a target fill rate.
 */
export function safetyStockForFillRate(
  input: SafetyStockForFillRateInput,
): Explained<SafetyStockForFillRateResult> {
  const { targetFillRate, sigmaLeadTime, orderQuantity } = input
  if (!(targetFillRate > 0 && targetFillRate < 1)) {
    throw new Error(
      `safetyStockForFillRate: targetFillRate must be in (0, 1) (got ${targetFillRate})`,
    )
  }
  requirePositive('safetyStockForFillRate', 'sigmaLeadTime', sigmaLeadTime)
  requirePositive('safetyStockForFillRate', 'orderQuantity', orderQuantity)

  const targetLoss = ((1 - targetFillRate) * orderQuantity) / sigmaLeadTime
  const z = solveLossFunction(targetLoss)
  const safetyStock = z * sigmaLeadTime

  const warnings: string[] = []
  if (safetyStock < 0) {
    warnings.push(
      `target fill rate ${targetFillRate} needs less than mean lead-time demand as cover; safety stock is negative (${round(safetyStock)})`,
    )
  }

  return explain(
    { safetyStock, z },
    {
      method: 'safety-stock-for-fill-rate',
      inputs: {
        targetFillRate,
        sigmaLeadTime,
        orderQuantity,
        targetLoss: round(targetLoss),
        z: round(z),
      },
      reasoning: [
        `solve G(z) = (1 − β)·Q / σ_L = ${round(targetLoss)} for z by bisection (G is monotone decreasing)`,
        `z = ${round(z)}, so SS = z · σ_L = ${round(safetyStock)}`,
        'target is a fill rate (β), not a cycle service level (α); the required buffers differ',
      ],
      citations: [SPT_CITATION],
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  )
}

export interface ServiceMetricsInput {
  /**
   * Target cycle service level α — the probability a cycle does not stock out.
   * Must be in the open interval (0, 1).
   */
  cycleServiceLevel: number
  /**
   * Standard deviation of demand over the replenishment lead time (σ_L), in
   * demand units. Must be finite and positive.
   */
  sigmaLeadTime: number
  /** Replenishment order quantity (Q), in demand units. Must be finite and positive. */
  orderQuantity: number
}

export interface ServiceMetricsResult {
  /** Cycle service level α — the input target, echoed back (probability a cycle does not stock out). */
  cycleServiceLevel: number
  /** Fill rate β = 1 − ESC/Q delivered by the same safety stock. */
  fillRate: number
  /** Safety stock implied by the cycle service level, `SS = z · σ_L`. */
  safetyStock: number
  /** Safety factor `z = Φ⁻¹(α)`. */
  z: number
  /** Expected units short per cycle at this buffer, `ESC = σ_L · G(z)`. */
  expectedShortagePerCycle: number
}

/**
 * Bridges the two service-level definitions: given a target **cycle service
 * level** α (what `safetyStock` targets), reports the safety stock it implies
 * and the **fill rate** β that same buffer delivers — making the α ≠ β gap
 * explicit in one result.
 *
 * - `z = Φ⁻¹(α)` (via `inverseNormalCdf`), so `SS = z · σ_L`.
 * - `β = 1 − σ_L·G(z) / Q` (a thin composition over {@link fillRate}).
 *
 * Because β counts unit-level fills over a whole order quantity while α counts
 * whole cycles, β ≥ α for the same buffer, typically by a wide margin — the same
 * 95% cycle service level can be a 97–99% fill rate at a realistic Q. Quote the
 * one the business actually manages to.
 *
 * @example
 * ```ts
 * serviceMetrics({ cycleServiceLevel: 0.95, sigmaLeadTime: 50, orderQuantity: 200 }).value
 * // { cycleServiceLevel: ≈ 0.95, fillRate: ≈ 0.9948, safetyStock: ≈ 82.24, z: ≈ 1.6449, ... }
 * ```
 * @see Silver, Pyke & Thomas (2017), §7 — cycle service level vs fill rate.
 */
export function serviceMetrics(input: ServiceMetricsInput): Explained<ServiceMetricsResult> {
  const { cycleServiceLevel, sigmaLeadTime, orderQuantity } = input
  if (!(cycleServiceLevel > 0 && cycleServiceLevel < 1)) {
    throw new Error(
      `serviceMetrics: cycleServiceLevel must be in (0, 1) (got ${cycleServiceLevel})`,
    )
  }
  requirePositive('serviceMetrics', 'sigmaLeadTime', sigmaLeadTime)
  requirePositive('serviceMetrics', 'orderQuantity', orderQuantity)

  const z = inverseNormalCdf(cycleServiceLevel)
  const safetyStock = z * sigmaLeadTime
  const fill = fillRate({ safetyStock, sigmaLeadTime, orderQuantity })
  const { fillRate: beta, expectedShortagePerCycle } = fill.value

  const warnings: string[] = []
  if (beta < cycleServiceLevel) {
    warnings.push(
      `fill rate β (${round(beta)}) is below cycle service level α (${cycleServiceLevel}) — the order quantity Q (${orderQuantity}) is small relative to σ_L (${sigmaLeadTime}), so each cycle's expected shortage is spread over few units; β ≥ α is only a tendency, not a law`,
    )
  }

  return explain(
    {
      // Echo the caller's target α verbatim — a caller who asks for 0.95 reads
      // 0.95 back. β below is derived from z, so the α/β comparison stands.
      cycleServiceLevel,
      fillRate: beta,
      safetyStock,
      z,
      expectedShortagePerCycle,
    },
    {
      method: 'service-metrics',
      inputs: {
        cycleServiceLevel,
        sigmaLeadTime,
        orderQuantity,
        z: round(z),
      },
      reasoning: [
        `z = Φ⁻¹(α) = ${round(z)} for cycle service level α = ${cycleServiceLevel}`,
        `SS = z · σ_L = ${round(safetyStock)}`,
        `fill rate β = ${round(beta)} at this buffer — usually β ≥ α (β counts unit fills over the order quantity Q, α counts whole cycles), though β can fall below α when Q is small relative to σ_L`,
        'cycle service level (α) and fill rate (β) are different service definitions; do not conflate them',
      ],
      citations: [SPT_CITATION],
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  )
}

/**
 * Solves `G(z) = target` for `z` by bisection, where `G` is the unit normal
 * loss function (continuous, strictly decreasing from +∞ at z → −∞ to 0 at
 * z → +∞). `target` must be positive (G's range is (0, ∞)).
 */
function solveLossFunction(target: number): number {
  // Bracket [lo, hi] with G(lo) ≥ target ≥ G(hi). G decreasing ⇒ lo < hi.
  let lo = -1
  let hi = 1
  const MAX_EXPANSION = 200
  for (let i = 0; normalLossFunction(lo) < target && i < MAX_EXPANSION; i++) lo *= 2
  for (let i = 0; normalLossFunction(hi) > target && i < MAX_EXPANSION; i++) hi *= 2

  for (let i = 0; i < 200 && hi - lo > 1e-12; i++) {
    const mid = (lo + hi) / 2
    if (normalLossFunction(mid) > target) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return (lo + hi) / 2
}

function requireFinite(fn: string, name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${fn}: ${name} must be finite (got ${value})`)
  }
}

function requirePositive(fn: string, name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fn}: ${name} must be finite and positive (got ${value})`)
  }
}
