/**
 * Economic order quantity (EOQ) and its extensions: the classic Harris/Wilson
 * lot-size formula, the finite-production-rate (EPQ) variant, and the
 * all-units quantity-discount procedure.
 *
 * @see Harris, F.W. (1913). How Many Parts to Make at Once. Factory, The
 *   Magazine of Management, 10(2), 135-136, 152.
 * @see Silver, E.A., Pyke, D.F. & Thomas, D.J. (2017). Inventory and
 *   Production Management in Supply Chains, 4th ed.
 */
import { type Explained, explain } from '@logistics-ts/core'

export interface EoqInput {
  /** Annual demand (D), units/year. */
  annualDemand: number
  /** Fixed cost per order (S), currency/order. */
  orderCost: number
  /** Holding cost per unit per year (H), currency/unit/year. */
  holdingCostPerUnit: number
}

/**
 * Economic order quantity: `Q* = √(2DS/H)`, the order quantity minimising the
 * sum of annual ordering and holding cost. Assumes instantaneous replenishment,
 * constant demand, and no discounts.
 *
 * @example
 * ```ts
 * eoq({ annualDemand: 1000, orderCost: 10, holdingCostPerUnit: 2 }).value // 100
 * ```
 */
export function eoq(input: EoqInput): Explained<number> {
  const { annualDemand, orderCost, holdingCostPerUnit } = input
  requirePositive('annualDemand', annualDemand)
  requirePositive('orderCost', orderCost)
  requirePositive('holdingCostPerUnit', holdingCostPerUnit)

  const value = Math.sqrt((2 * annualDemand * orderCost) / holdingCostPerUnit)

  return explain(value, {
    method: 'eoq',
    inputs: { annualDemand, orderCost, holdingCostPerUnit },
    reasoning: ['Q* = √(2DS/H) — minimises annual ordering + holding cost'],
    citations: ['Harris, F.W. (1913), Factory: The Magazine of Management'],
  })
}

export interface EpqInput extends EoqInput {
  /** Production/replenishment rate (P), units/year. Must exceed `annualDemand`. */
  productionRate: number
}

/**
 * Economic production quantity: `Q* = √(2DS/H · 1/(1 − D/P))`, EOQ's variant
 * for a finite (gradual) production/replenishment rate `P` rather than
 * instantaneous receipt. As `P → ∞` this reduces to `eoq`.
 *
 * @example
 * ```ts
 * epq({ annualDemand: 1000, orderCost: 10, holdingCostPerUnit: 2, productionRate: 5000 }).value
 * // ≈ 111.8
 * ```
 */
export function epq(input: EpqInput): Explained<number> {
  const { annualDemand, orderCost, holdingCostPerUnit, productionRate } = input
  requirePositive('annualDemand', annualDemand)
  requirePositive('orderCost', orderCost)
  requirePositive('holdingCostPerUnit', holdingCostPerUnit)
  requirePositive('productionRate', productionRate)
  if (productionRate <= annualDemand) {
    throw new Error(
      `epq: productionRate (${productionRate}) must exceed annualDemand (${annualDemand}), or production never catches up to demand`,
    )
  }

  const value = Math.sqrt(
    ((2 * annualDemand * orderCost) / holdingCostPerUnit) *
      (1 / (1 - annualDemand / productionRate)),
  )

  return explain(value, {
    method: 'epq',
    inputs: { annualDemand, orderCost, holdingCostPerUnit, productionRate },
    reasoning: [
      'Q* = √(2DS/H · 1/(1 − D/P)) — EOQ adjusted for a finite production/replenishment rate P',
    ],
    citations: ['Harris, F.W. (1913), Factory: The Magazine of Management'],
  })
}

export interface QuantityDiscountTier {
  /** Minimum order quantity to receive `unitPrice` (inclusive). */
  minQuantity: number
  /** Unit price at this tier. */
  unitPrice: number
}

export interface QuantityDiscountInput {
  /** Annual demand (D), units/year. */
  annualDemand: number
  /** Fixed cost per order (S), currency/order. */
  orderCost: number
  /** Annual holding cost as a fraction of unit price (e.g. `0.2` = 20%/year). */
  holdingCostRate: number
  /** Price breaks, sorted ascending by `minQuantity`; must start at a quantity ≤ 1. */
  tiers: readonly QuantityDiscountTier[]
}

export interface QuantityDiscountResult {
  orderQuantity: number
  tier: QuantityDiscountTier
  totalAnnualCost: number
}

/**
 * All-units quantity-discount EOQ. For each price tier, computes the EOQ at
 * that tier's price; a tier whose unconstrained EOQ falls below its own
 * `minQuantity` is clamped up to `minQuantity` (cost is increasing throughout
 * the tier's range, so the boundary minimises it); a tier whose unconstrained
 * EOQ reaches or exceeds the next tier's `minQuantity` is dominated by that
 * next tier (ordering enough to cross into it is cheaper) and is skipped.
 * Returns the tier and quantity with the lowest total annual cost
 * (`D·price + D/Q·S + Q/2·holdingCostRate·price`).
 *
 * @example
 * ```ts
 * eoqWithQuantityDiscounts({
 *   annualDemand: 5000, orderCost: 49, holdingCostRate: 0.2,
 *   tiers: [{ minQuantity: 1, unitPrice: 5.0 }, { minQuantity: 500, unitPrice: 4.65 }, { minQuantity: 1000, unitPrice: 4.6 }],
 * }).value // { orderQuantity: 1000, tier: { minQuantity: 1000, unitPrice: 4.6 }, totalAnnualCost: 23705 }
 * ```
 */
export function eoqWithQuantityDiscounts(
  input: QuantityDiscountInput,
): Explained<QuantityDiscountResult> {
  const { annualDemand, orderCost, holdingCostRate, tiers } = input
  requirePositive('annualDemand', annualDemand)
  requirePositive('orderCost', orderCost)
  requirePositive('holdingCostRate', holdingCostRate)
  if (tiers.length === 0) throw new Error('eoqWithQuantityDiscounts: tiers must be non-empty')
  if ((tiers[0] as QuantityDiscountTier).minQuantity > 1) {
    throw new Error(
      `eoqWithQuantityDiscounts: tiers[0].minQuantity must be ≤ 1 (got ${(tiers[0] as QuantityDiscountTier).minQuantity}) — otherwise quantities below it have no price tier`,
    )
  }
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i] as QuantityDiscountTier
    requirePositive(`tiers[${i}].unitPrice`, tier.unitPrice)
    if (!Number.isFinite(tier.minQuantity) || tier.minQuantity <= 0) {
      throw new Error(
        `tiers[${i}].minQuantity must be finite and positive (got ${tier.minQuantity})`,
      )
    }
    const prev = tiers[i - 1]
    if (prev !== undefined && tier.minQuantity <= prev.minQuantity) {
      throw new Error('eoqWithQuantityDiscounts: tiers must be sorted ascending by minQuantity')
    }
  }

  const totalCost = (quantity: number, unitPrice: number): number =>
    annualDemand * unitPrice +
    (annualDemand / quantity) * orderCost +
    (quantity / 2) * holdingCostRate * unitPrice

  const evaluated: { tier: QuantityDiscountTier; quantity: number; cost: number }[] = []
  const reasoning: string[] = []
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i] as QuantityDiscountTier
    const nextMin = tiers[i + 1]?.minQuantity ?? Number.POSITIVE_INFINITY
    const unconstrained = Math.sqrt(
      (2 * annualDemand * orderCost) / (holdingCostRate * tier.unitPrice),
    )

    if (unconstrained >= nextMin) {
      reasoning.push(
        `tier @${tier.unitPrice}: unconstrained EOQ ${round4(unconstrained)} reaches the next price break; dominated, skipped`,
      )
      continue
    }
    const quantity = Math.max(unconstrained, tier.minQuantity)
    const cost = totalCost(quantity, tier.unitPrice)
    evaluated.push({ tier, quantity, cost })
    reasoning.push(
      `tier @${tier.unitPrice}: Q=${round4(quantity)}, total annual cost=${round4(cost)}`,
    )
  }

  evaluated.sort((a, b) => a.cost - b.cost)
  const winner = evaluated[0]
  if (winner === undefined) {
    throw new Error('eoqWithQuantityDiscounts: no tier produced a feasible order quantity')
  }

  reasoning.push(
    `selected tier @${winner.tier.unitPrice} (Q=${round4(winner.quantity)}) — lowest total annual cost`,
  )

  return explain(
    { orderQuantity: winner.quantity, tier: winner.tier, totalAnnualCost: winner.cost },
    {
      method: 'eoq-quantity-discount',
      inputs: { annualDemand, orderCost, holdingCostRate, tiers: tiers.length },
      reasoning,
      citations: [
        'Harris, F.W. (1913), Factory: The Magazine of Management',
        'Silver, Pyke & Thomas (2017), Inventory and Production Management',
      ],
    },
  )
}

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be finite and positive (got ${value})`)
  }
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4
}
