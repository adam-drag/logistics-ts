/**
 * Safety stock set by **policy** rather than by statistics.
 *
 * These are the buffer rules practitioners actually configure in an ERP: hold
 * two weeks of cover, hold a flat 500 units, hold 30% of average demand. They
 * are not {@link safetyStock}, and the separation is deliberate.
 *
 * **A policy buffer carries no service-level guarantee.** The statistical
 * formulas in `safety-stock.ts` answer "how much stock makes a stockout less
 * than 5% likely, given how variable demand and lead time are?" Nothing here
 * asks that question. A policy sets a number because a human decided on a
 * number, and the resulting protection depends entirely on variability nobody
 * measured. The two families live in separate functions so that no caller can
 * pass a `serviceLevel` to a rule that ignores it, and so that no result can be
 * labelled "95% service" when it was really "someone said two weeks".
 *
 * Policies are still worth shipping. They are legitimate, widely used, and
 * often the only option for an item with too little history to estimate a
 * standard deviation from. Use {@link safetyStockMethods} to present the whole
 * catalogue, statistical and policy alike, with the trade-off attached.
 *
 * **No citations, deliberately.** Every statistical formula in this package
 * carries a literature reference, and these carry none. They are practitioner
 * conventions rather than results from a paper: "hold two weeks of cover" is a
 * business decision, and `fixed` is a person typing a number. An earlier draft
 * attached Silver, Pyke & Thomas to all three, which was a citation of
 * convenience — the reference was not checked, and a textbook attribution would
 * have implied a derivation none of them has. The repo rule is to say so and
 * stop rather than invent one, so the `citations` field is absent and this
 * paragraph explains the absence.
 */
import { type Explained, explain } from '@logistics-ts/core'
import { round } from './round'

/** Which policy rule sets the buffer. */
export type SafetyStockPolicyMethod = 'days-of-supply' | 'fixed' | 'percentage-of-average'

/**
 * A policy rule and everything it needs.
 *
 * Each variant carries its own inputs, and **every quantity names its unit in
 * its own field**. That is not cosmetic. Mixing a lead time in days with a mean
 * demand in weekly buckets is the single most common way these calculations go
 * wrong, and a shared `meanDemand` field with the period left implicit is how
 * it happens. `days-of-supply` therefore demands `meanDemandPerDay` and nothing
 * else will typecheck.
 */
export type SafetyStockPolicyOptions =
  | {
      /** Hold enough to cover `days` of average demand. */
      method: 'days-of-supply'
      /** Days of cover to hold. Must be finite and non-negative. */
      days: number
      /**
       * Average demand per **day**, in units. If your demand series is bucketed
       * weekly or monthly, convert before calling: this field is days because
       * the method is days.
       */
      meanDemandPerDay: number
    }
  | {
      /** Hold a flat quantity, set by a planner. */
      method: 'fixed'
      /** The buffer, in units. Must be finite and non-negative. */
      quantity: number
    }
  | {
      /** Hold a percentage of average demand per period. */
      method: 'percentage-of-average'
      /** Buffer as a fraction of mean demand, e.g. `0.3` for 30%. Non-negative. */
      bufferPercentage: number
      /**
       * Mean demand per period, in units. The period is whatever you bucketed
       * at, and the result is a buffer in that same period's units.
       */
      meanDemandPerPeriod: number
    }

/**
 * Computes a safety stock buffer from a policy rule.
 *
 * Formulas:
 * - `days-of-supply`: `SS = meanDemandPerDay × days`
 * - `fixed`: `SS = quantity`
 * - `percentage-of-average`: `SS = meanDemandPerPeriod × bufferPercentage`
 *
 * Units: the result is in units of stock. For `days-of-supply` the inputs are
 * per-day, so the buffer covers whole days. For `percentage-of-average` the
 * buffer is in the same period unit as the mean you supplied.
 *
 * Every result carries a warning stating that a policy buffer implies no
 * service level, because the number looks exactly like a statistical safety
 * stock once it reaches a UI and nothing else distinguishes them.
 *
 * @param options - The rule and its inputs.
 * @returns An `Explained<number>` buffer in units.
 * @throws Error naming the offending field when an input is invalid.
 * @example
 * ```ts
 * // Two weeks of cover on an item averaging 4.92 units/day.
 * const ss = safetyStockPolicy({
 *   method: 'days-of-supply',
 *   days: 14,
 *   meanDemandPerDay: 4.92,
 * })
 *
 * ss.value   // 68.88
 * ss.method  // 'days-of-supply'
 * ```
 */
export function safetyStockPolicy(options: SafetyStockPolicyOptions): Explained<number> {
  if (options === null || typeof options !== 'object') {
    throw new Error(`safetyStockPolicy: options must be an object (got ${typeof options})`)
  }

  const policyWarning =
    'a policy buffer implies NO service level — it holds what you asked for, and the protection that delivers depends on demand and lead-time variability this method never looked at; use safetyStock() when you need a stated service level'

  if (options.method === 'days-of-supply') {
    requireNonNegative('days', options.days)
    requireNonNegative('meanDemandPerDay', options.meanDemandPerDay)
    const value = options.meanDemandPerDay * options.days
    return explain(value, {
      method: 'days-of-supply',
      inputs: { days: options.days, meanDemandPerDay: options.meanDemandPerDay },
      reasoning: [
        `SS = meanDemandPerDay × days = ${round(options.meanDemandPerDay)} × ${options.days} = ${round(value)} unit(s)`,
        `holds ${options.days} day(s) of average demand as cover, regardless of how variable that demand is`,
      ],
      warnings: [policyWarning],
    })
  }

  if (options.method === 'fixed') {
    requireNonNegative('quantity', options.quantity)
    return explain(options.quantity, {
      method: 'fixed',
      inputs: { quantity: options.quantity },
      reasoning: [
        `SS = ${round(options.quantity)} unit(s), set directly rather than derived`,
        'a planner override: the number came from a person, so this function computes nothing and reports what it was given',
      ],
      warnings: [policyWarning],
    })
  }

  if (options.method === 'percentage-of-average') {
    requireNonNegative('bufferPercentage', options.bufferPercentage)
    requireNonNegative('meanDemandPerPeriod', options.meanDemandPerPeriod)
    const value = options.meanDemandPerPeriod * options.bufferPercentage
    return explain(value, {
      method: 'percentage-of-average',
      inputs: {
        bufferPercentage: options.bufferPercentage,
        meanDemandPerPeriod: options.meanDemandPerPeriod,
      },
      reasoning: [
        `SS = meanDemandPerPeriod × bufferPercentage = ${round(options.meanDemandPerPeriod)} × ${options.bufferPercentage} = ${round(value)} unit(s)`,
        `holds ${round(options.bufferPercentage * 100)}% of average demand as cover; the buffer scales with demand level but not with demand variability`,
      ],
      warnings: [policyWarning],
    })
  }

  throw new Error(
    `safetyStockPolicy: unknown method ${JSON.stringify((options as { method: unknown }).method)} — valid policies are 'days-of-supply', 'fixed', 'percentage-of-average'`,
  )
}

function requireNonNegative(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`safetyStockPolicy: ${name} must be finite and non-negative (got ${value})`)
  }
}
