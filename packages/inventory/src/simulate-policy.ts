/**
 * Discrete-event evaluation of a replenishment policy over a demand path:
 * `(s,Q)`, `(R,S)` and `(s,S)`.
 *
 * This answers the question the analytic formulas cannot: *what would this
 * policy actually have done?* `fillRate` gives the expected β for normal
 * lead-time demand under a set of modelling assumptions; this walks a concrete
 * demand path period by period and reports what was realised. Use it to
 * sanity-check a policy against history, to compare candidate parameters, or to
 * see where the analytic assumptions break down.
 *
 * **The simulation is deterministic.** Given the same demand path and policy it
 * always produces the same result — there is no seed and no random number
 * generator here. Randomness, if you want a Monte-Carlo study, belongs in how
 * you *generate* the demand paths you feed it (`generateExampleData` in
 * `@logistics-ts/core` is seeded), which keeps this function exactly testable
 * and keeps the stochastic part where you can control it.
 *
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and Production
 *   Management in Supply Chains, 4th ed. — `(s,Q)`, `(R,S)`, `(s,S)` policy
 *   definitions and performance measures.
 */
import { type Explained, explain } from '@logistics-ts/core'
import { round } from './round'

const SPT_CITATION =
  'Silver, Pyke & Thomas (2017), Inventory and Production Management in Supply Chains'

/**
 * A replenishment policy and its parameters.
 *
 * Every policy decides using the **inventory position** (on-hand + on-order −
 * backorders), never on-hand alone. Reordering on on-hand is the classic
 * inventory-simulation bug: it ignores stock already in transit and reorders
 * every period until the first delivery lands.
 */
export type PolicyOptions =
  | {
      /** Continuous review: order `orderQuantity` whenever position drops to `reorderPoint`. */
      policy: '(s,Q)'
      /** Reorder point `s` (units). Order when inventory position ≤ this. */
      reorderPoint: number
      /** Fixed order quantity `Q` (units). Must be positive. */
      orderQuantity: number
    }
  | {
      /** Periodic review: every `reviewPeriods`, order up to `orderUpToLevel`. */
      policy: '(R,S)'
      /** Review interval `R` in periods. Reviews happen at period 0, R, 2R, … */
      reviewPeriods: number
      /** Order-up-to level `S` (units). */
      orderUpToLevel: number
    }
  | {
      /** Periodic review with a trigger: every `reviewPeriods`, if position ≤ `s`, order up to `S`. */
      policy: '(s,S)'
      /** Review interval `R` in periods. */
      reviewPeriods: number
      /** Reorder point `s` (units) — the trigger checked at each review. */
      reorderPoint: number
      /** Order-up-to level `S` (units). Must be ≥ `reorderPoint`. */
      orderUpToLevel: number
    }

/** How demand that cannot be met from stock is treated. */
export type UnmetDemandMode = 'backorder' | 'lost-sales'

/** Input to {@link simulatePolicy}. */
export interface SimulatePolicyInput {
  /**
   * Demand per period (units/period), index = period. Every entry must be
   * finite and non-negative. Zero periods are meaningful and must be present.
   */
  demand: readonly number[]
  /** The policy to evaluate. */
  policy: PolicyOptions
  /** On-hand stock before period 0 (units). Defaults to `0`. */
  initialOnHand?: number
  /**
   * Replenishment lead time in **periods**, never days. An order placed in
   * period `t` arrives at the start of period `t + leadTimePeriods`. Defaults
   * to `0` (same-period delivery).
   */
  leadTimePeriods?: number
  /**
   * What happens to demand that on-hand cannot cover. Defaults to
   * `'backorder'`: the shortfall is carried and satisfied by the next delivery,
   * which is the convention the analytic `fillRate` formula assumes. Under
   * `'lost-sales'` the shortfall simply vanishes, which is the right model for
   * retail but is **not** comparable to `fillRate`.
   */
  unmetDemand?: UnmetDemandMode
}

/** One period of the simulated record. */
export interface PolicyRow {
  /** Zero-based period index. */
  period: number
  /** Demand in this period (units). */
  demand: number
  /** Stock arriving at the start of this period (units). */
  received: number
  /** Demand satisfied from stock in this period (units). */
  satisfied: number
  /** Demand not satisfied in this period (units) — backordered or lost. */
  short: number
  /** On-hand stock at the end of this period (units). Never negative. */
  onHand: number
  /** Outstanding backorders at the end of this period (units). Always `0` under lost sales. */
  backorders: number
  /** Inventory position at the end of this period: on-hand + on-order − backorders. */
  inventoryPosition: number
  /** Quantity ordered in this period (units); `0` when no order was placed. */
  ordered: number
}

/** What the policy achieved over the demand path. */
export interface PolicyPerformance {
  /** The full period-by-period record. */
  rows: PolicyRow[]
  /**
   * Realised fill rate (Type-2, β): the fraction of total demand **units**
   * satisfied directly from stock. `1` when total demand is zero.
   */
  fillRate: number
  /**
   * Realised cycle service level (Type-1, α): the fraction of replenishment
   * cycles that ended without a stockout. A cycle runs from one order arrival
   * to the next. `1` when no cycle completed.
   */
  cycleServiceLevel: number
  /** Mean end-of-period on-hand stock (units). */
  averageOnHand: number
  /** Mean end-of-period inventory position (units). */
  averageInventoryPosition: number
  /** Number of replenishment orders placed. */
  orderCount: number
  /** Number of periods in which some demand went unmet. */
  stockoutPeriods: number
  /** Total units of demand not satisfied from stock over the whole path. */
  totalUnitsShort: number
  /** Total demand over the path (units). */
  totalDemand: number
}

/**
 * Simulates a replenishment policy over a demand path and reports what it
 * achieved.
 *
 * **Sequence within each period** (this is a modelling convention, and different
 * textbooks order it differently — compare carefully before matching a
 * reference):
 *
 * 1. **Receive** any orders due to arrive this period, and immediately apply
 *    them to outstanding backorders.
 * 2. **Meet demand** from on-hand. Any shortfall is backordered or lost per
 *    {@link SimulatePolicyInput.unmetDemand}.
 * 3. **Review and order** per the policy, using the inventory position *after*
 *    demand.
 *
 * Every policy decides on **inventory position** (on-hand + on-order −
 * backorders), not on-hand, so stock already in transit is never ordered twice.
 *
 * Units: everything is in the item's own units, and every index is a **period**,
 * never a date. `leadTimePeriods` is counted in those same periods.
 *
 * Constraints: every demand entry must be finite and non-negative; policy
 * parameters must be finite, and quantities/intervals positive.
 *
 * @param input - The demand path, policy and starting conditions.
 * @returns An `Explained` {@link PolicyPerformance} with the full period record.
 * @throws Error naming the offending field when an input is invalid.
 * @example
 * ```ts
 * // (s,Q): order 40 whenever position falls to 20 or below, 1-period lead time.
 * const sim = simulatePolicy({
 *   demand: [10, 10, 10, 10, 10, 10],
 *   policy: { policy: '(s,Q)', reorderPoint: 20, orderQuantity: 40 },
 *   initialOnHand: 50,
 *   leadTimePeriods: 1,
 * })
 *
 * sim.value.fillRate      // 1 — never ran out
 * sim.value.orderCount    // 1
 * sim.value.totalUnitsShort // 0
 * ```
 */
export function simulatePolicy(input: SimulatePolicyInput): Explained<PolicyPerformance> {
  const { demand, policy } = input
  const initialOnHand = input.initialOnHand ?? 0
  const leadTimePeriods = input.leadTimePeriods ?? 0
  const unmetDemand = input.unmetDemand ?? 'backorder'

  if (!Array.isArray(demand)) {
    throw new Error(`simulatePolicy: demand must be an array (got ${typeof demand})`)
  }
  for (const [period, q] of demand.entries()) {
    if (typeof q !== 'number' || !Number.isFinite(q) || q < 0) {
      throw new Error(
        `simulatePolicy: demand[${period}] must be finite and non-negative (got ${q})`,
      )
    }
  }
  requireFinite('initialOnHand', initialOnHand)
  if (initialOnHand < 0) {
    throw new Error(`simulatePolicy: initialOnHand must not be negative (got ${initialOnHand})`)
  }
  if (!Number.isInteger(leadTimePeriods) || leadTimePeriods < 0) {
    throw new Error(
      `simulatePolicy: leadTimePeriods must be a non-negative integer number of periods (got ${leadTimePeriods})`,
    )
  }
  if (unmetDemand !== 'backorder' && unmetDemand !== 'lost-sales') {
    throw new Error(
      `simulatePolicy: unmetDemand must be 'backorder' or 'lost-sales' (got ${JSON.stringify(unmetDemand)})`,
    )
  }
  validatePolicy(policy)

  const horizon = demand.length
  // Arrivals indexed by the period they land in. Sized to cover orders placed
  // in the final period, which arrive beyond the horizon and are never received
  // — they still count as on-order for the position, which is correct.
  const arrivals = new Array<number>(horizon + leadTimePeriods + 1).fill(0)

  let onHand = initialOnHand
  let backorders = 0
  let onOrder = 0
  let orderCount = 0
  let stockoutPeriods = 0
  let totalUnitsShort = 0
  let totalDemand = 0
  let onHandSum = 0
  let positionSum = 0

  // A "cycle" runs from one order arrival to the next; it counts as a stockout
  // cycle if any demand went unmet while it was open. This is the realised
  // analogue of the alpha that `safetyStock` targets.
  let cyclesCompleted = 0
  let cyclesWithStockout = 0
  let currentCycleStockedOut = false

  const rows: PolicyRow[] = []

  for (let period = 0; period < horizon; period++) {
    // 1. Receive.
    const received = arrivals[period] ?? 0
    if (received > 0) {
      onOrder -= received
      // A new cycle begins at each arrival; close the previous one first.
      cyclesCompleted++
      if (currentCycleStockedOut) cyclesWithStockout++
      currentCycleStockedOut = false
      // Arrivals clear backorders before they become available stock.
      const clearing = Math.min(backorders, received)
      backorders -= clearing
      onHand += received - clearing
    }

    // 2. Meet demand.
    const d = demand[period] ?? 0
    totalDemand += d
    const satisfied = Math.min(onHand, d)
    const short = d - satisfied
    onHand -= satisfied
    if (short > 0) {
      stockoutPeriods++
      totalUnitsShort += short
      currentCycleStockedOut = true
      if (unmetDemand === 'backorder') backorders += short
    }

    // 3. Review and order, on the position AFTER demand.
    const positionBeforeOrder = onHand + onOrder - backorders
    const ordered = decideOrder(policy, period, positionBeforeOrder)
    if (ordered > 0) {
      orderCount++
      onOrder += ordered
      const due = period + leadTimePeriods
      arrivals[due] = (arrivals[due] ?? 0) + ordered
    }

    const inventoryPosition = onHand + onOrder - backorders
    onHandSum += onHand
    positionSum += inventoryPosition

    rows.push({
      period,
      demand: d,
      received,
      satisfied,
      short,
      onHand,
      backorders,
      inventoryPosition,
      ordered,
    })
  }

  const fillRate = totalDemand === 0 ? 1 : (totalDemand - totalUnitsShort) / totalDemand
  const cycleServiceLevel =
    cyclesCompleted === 0 ? 1 : (cyclesCompleted - cyclesWithStockout) / cyclesCompleted
  const averageOnHand = horizon === 0 ? 0 : onHandSum / horizon
  const averageInventoryPosition = horizon === 0 ? 0 : positionSum / horizon

  const warnings: string[] = []
  if (unmetDemand === 'lost-sales') {
    warnings.push(
      'unmetDemand is lost-sales, so unmet demand vanishes rather than being carried — the realised fillRate is NOT comparable to the analytic fillRate(), which assumes backordering',
    )
  }
  if (cyclesCompleted === 0 && orderCount > 0) {
    warnings.push(
      `${orderCount} order(s) were placed but none arrived within the ${horizon}-period horizon (lead time ${leadTimePeriods}), so cycleServiceLevel is reported as 1 on no evidence — lengthen the demand path`,
    )
  }
  if (totalDemand === 0) {
    warnings.push(
      'total demand over the path is zero, so fillRate is reported as 1 by convention — there was nothing to fill',
    )
  }

  return explain(
    {
      rows,
      fillRate,
      cycleServiceLevel,
      averageOnHand,
      averageInventoryPosition,
      orderCount,
      stockoutPeriods,
      totalUnitsShort,
      totalDemand,
    },
    {
      method: 'simulate-policy',
      inputs: {
        policy: policy.policy,
        periods: horizon,
        leadTimePeriods,
        initialOnHand,
        unmetDemand,
        ...policyInputs(policy),
      },
      reasoning: [
        `simulated ${policy.policy} over ${horizon} period(s) of demand totalling ${round(totalDemand)} unit(s), with a ${leadTimePeriods}-period lead time and ${unmetDemand} for unmet demand`,
        'each period receives due orders (which clear backorders first), then meets demand from on-hand, then reviews — so an order placed this period reflects demand already served',
        'ordering decisions use the INVENTORY POSITION (on-hand + on-order − backorders), not on-hand, so stock already in transit is never ordered twice',
        `realised fill rate ${round(fillRate)} = ${round(totalDemand - totalUnitsShort)} of ${round(totalDemand)} demanded unit(s) served from stock; ${totalUnitsShort > 0 ? `${round(totalUnitsShort)} unit(s) short across ${stockoutPeriods} period(s)` : 'no period went short'}`,
        `realised cycle service level ${round(cycleServiceLevel)} over ${cyclesCompleted} completed cycle(s) (a cycle runs between order arrivals and counts as a miss if any demand went unmet while open)`,
        `${orderCount} order(s) placed; average on-hand ${round(averageOnHand)}, average inventory position ${round(averageInventoryPosition)}`,
      ],
      citations: [SPT_CITATION],
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  )
}

/** Decides this period's order quantity for the policy. Returns `0` for no order. */
function decideOrder(policy: PolicyOptions, period: number, position: number): number {
  if (policy.policy === '(s,Q)') {
    // Continuous review: reviewed every period. A single lot may not lift the
    // position above s (deep backorder, or Q smaller than a demand spike), so
    // order whole lots until it does — ordering one lot and waiting would
    // silently under-replenish.
    if (position > policy.reorderPoint) return 0
    const deficit = policy.reorderPoint - position
    const lots = Math.floor(deficit / policy.orderQuantity) + 1
    return lots * policy.orderQuantity
  }
  if (policy.policy === '(R,S)') {
    if (period % policy.reviewPeriods !== 0) return 0
    return Math.max(0, policy.orderUpToLevel - position)
  }
  if (period % policy.reviewPeriods !== 0) return 0
  if (position > policy.reorderPoint) return 0
  return Math.max(0, policy.orderUpToLevel - position)
}

/** The policy's own parameters, for the `Explained` inputs record. */
function policyInputs(policy: PolicyOptions): Record<string, number> {
  if (policy.policy === '(s,Q)') {
    return { reorderPoint: policy.reorderPoint, orderQuantity: policy.orderQuantity }
  }
  if (policy.policy === '(R,S)') {
    return { reviewPeriods: policy.reviewPeriods, orderUpToLevel: policy.orderUpToLevel }
  }
  return {
    reviewPeriods: policy.reviewPeriods,
    reorderPoint: policy.reorderPoint,
    orderUpToLevel: policy.orderUpToLevel,
  }
}

function validatePolicy(policy: PolicyOptions): void {
  if (policy === null || typeof policy !== 'object') {
    throw new Error(`simulatePolicy: policy must be an object (got ${typeof policy})`)
  }
  if (policy.policy === '(s,Q)') {
    requireFinite('policy.reorderPoint', policy.reorderPoint)
    requirePositive('policy.orderQuantity', policy.orderQuantity)
    return
  }
  if (policy.policy === '(R,S)') {
    requirePositiveInteger('policy.reviewPeriods', policy.reviewPeriods)
    requireFinite('policy.orderUpToLevel', policy.orderUpToLevel)
    return
  }
  if (policy.policy === '(s,S)') {
    requirePositiveInteger('policy.reviewPeriods', policy.reviewPeriods)
    requireFinite('policy.reorderPoint', policy.reorderPoint)
    requireFinite('policy.orderUpToLevel', policy.orderUpToLevel)
    if (policy.orderUpToLevel < policy.reorderPoint) {
      throw new Error(
        `simulatePolicy: policy.orderUpToLevel (${policy.orderUpToLevel}) must be >= policy.reorderPoint (${policy.reorderPoint}) — an order-up-to level below the trigger orders nothing`,
      )
    }
    return
  }
  throw new Error(
    `simulatePolicy: unknown policy ${JSON.stringify((policy as { policy: unknown }).policy)} — valid policies are '(s,Q)', '(R,S)', '(s,S)'`,
  )
}

function requireFinite(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`simulatePolicy: ${name} must be finite (got ${value})`)
  }
}

function requirePositive(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`simulatePolicy: ${name} must be finite and positive (got ${value})`)
  }
}

function requirePositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`simulatePolicy: ${name} must be a positive integer (got ${value})`)
  }
}
