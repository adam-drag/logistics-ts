/**
 * The safety-stock method catalogue, as **data**.
 *
 * Every method in this package documents its formula, units and constraints in
 * TSDoc. TSDoc is compile-time: a UI rendering a method picker at runtime, or an
 * agent choosing a method from a list, cannot read it. This module exposes the
 * same information as values, so a caller can build a form, validate a
 * parameter against its real range, or explain the trade-off to a user without
 * hard-coding a copy of this library's semantics.
 *
 * The catalogue spans **both families**. `kind: 'statistical'` methods take a
 * service level and buffer measured variability. `kind: 'policy'` methods hold
 * what a human asked for and guarantee nothing. Presenting them in one list
 * with that field attached is the point: a picker that shows "fixed quantity"
 * next to "King's formula" without distinguishing them invites the user to
 * believe both deliver a service level.
 *
 * @see safetyStock for the statistical family, safetyStockPolicy for policies.
 */

/** Which family a method belongs to, and therefore what it can promise. */
export type SafetyStockMethodKind = 'statistical' | 'policy'

/** One tunable parameter of a method, with the range a UI should enforce. */
export interface SafetyStockParameterInfo {
  /** Field name, matching the option or input property the caller must set. */
  name: string
  /** What the parameter means, in one line. */
  description: string
  /** Unit of measure, e.g. `'units/day'`, `'days'`, `'fraction'`. */
  unit: string
  /** Inclusive lower bound the function enforces, when it has one. */
  min?: number
  /** Inclusive upper bound the function enforces, when it has one. */
  max?: number
  /** Whether the function throws if this is absent. */
  required: boolean
}

/** Everything a UI or agent needs to offer a method and validate its inputs. */
export interface SafetyStockMethodInfo {
  /** The `method` string the function accepts, and the one it reports back. */
  id: string
  /** Which family it belongs to. */
  kind: SafetyStockMethodKind
  /** Short human name for a picker. */
  name: string
  /** The formula, written the way the TSDoc writes it. */
  formula: string
  /** One or two sentences on what it does and what it assumes. */
  description: string
  /** Conditions under which this is the right choice. */
  whenToUse: readonly string[]
  /** The parameters the caller supplies. */
  parameters: readonly SafetyStockParameterInfo[]
  /** Literature reference, where the method has one. */
  citation?: string
}

const SERVICE_LEVEL: SafetyStockParameterInfo = {
  name: 'serviceLevel',
  description: 'Target cycle service level: the probability a cycle does not stock out',
  unit: 'fraction',
  min: 0,
  max: 1,
  required: true,
}

/**
 * Freezes a method entry all the way down. `Object.freeze` is shallow, so
 * freezing only the array would leave every entry, and every parameter inside
 * it, mutable by any caller — and the catalogue is a single shared instance.
 */
function deepFreeze(info: SafetyStockMethodInfo): SafetyStockMethodInfo {
  Object.freeze(info.whenToUse)
  for (const p of info.parameters) Object.freeze(p)
  Object.freeze(info.parameters)
  return Object.freeze(info)
}

// Annotated on the way in, not just on the way out: without a contextual type
// the array literal widens `kind` to `string` and the entries stop satisfying
// SafetyStockMethodInfo. Vitest does not typecheck, so only `pnpm check` catches it.
const ENTRIES: SafetyStockMethodInfo[] = [
  {
    id: 'demand-variability',
    kind: 'statistical',
    name: 'Demand variability',
    formula: 'SS = Z · σD · √L̄',
    description:
      'Buffers variability in demand only, assuming the lead time is fixed. The most common formula, and the right one when suppliers are reliable.',
    whenToUse: [
      'Lead time is stable or contractually fixed',
      'You have enough demand history to estimate a standard deviation',
    ],
    parameters: [
      SERVICE_LEVEL,
      {
        name: 'meanLeadTime',
        description: 'Mean replenishment lead time, in the same period unit as demand',
        unit: 'periods',
        min: 0,
        required: true,
      },
      {
        name: 'demandStdDev',
        description: 'Standard deviation of demand per period',
        unit: 'units/period',
        min: 0,
        required: true,
      },
    ],
    citation: 'Silver, Pyke & Thomas (2017)',
  },
  {
    id: 'leadtime-variability',
    kind: 'statistical',
    name: 'Lead-time variability',
    formula: 'SS = Z · D̄ · σLT',
    description:
      'Buffers variability in lead time only, assuming demand is steady. Use when the supplier is the unreliable part.',
    whenToUse: [
      'Demand is smooth but delivery dates are not',
      'You have a history of actual receipt dates',
    ],
    parameters: [
      SERVICE_LEVEL,
      {
        name: 'meanDemand',
        description: 'Mean demand per period',
        unit: 'units/period',
        min: 0,
        required: true,
      },
      {
        name: 'leadTimeStdDev',
        description: 'Standard deviation of lead time, same unit as the mean lead time',
        unit: 'periods',
        min: 0,
        required: true,
      },
    ],
    citation: 'Silver, Pyke & Thomas (2017)',
  },
  {
    id: 'king',
    kind: 'statistical',
    name: "King's formula",
    formula: 'SS = Z · √(L̄ · σD² + D̄² · σLT²)',
    description:
      'Combines demand and lead-time variability in one term. The most complete of the statistical formulas, and the one to prefer when both inputs are available.',
    whenToUse: ['Both demand and lead time vary', 'You have history for both, not just one'],
    parameters: [
      SERVICE_LEVEL,
      {
        name: 'meanDemand',
        description: 'Mean demand per period',
        unit: 'units/period',
        min: 0,
        required: true,
      },
      {
        name: 'meanLeadTime',
        description: 'Mean replenishment lead time',
        unit: 'periods',
        min: 0,
        required: true,
      },
      {
        name: 'demandStdDev',
        description: 'Standard deviation of demand per period',
        unit: 'units/period',
        min: 0,
        required: true,
      },
      {
        name: 'leadTimeStdDev',
        description: 'Standard deviation of lead time',
        unit: 'periods',
        min: 0,
        required: true,
      },
    ],
    citation: 'King, P.L. (2011), Crack the Code, APICS Magazine',
  },
  {
    id: 'max-minus-average',
    kind: 'statistical',
    name: 'Maximum minus average',
    formula: 'SS = (Dmax · Lmax) − (D̄ · L̄)',
    description:
      'Covers the gap between the worst observed case and the average case. Distribution-free, so it needs no standard deviation, but it is sensitive to a single extreme observation.',
    whenToUse: [
      'Too little history to estimate a standard deviation',
      'You want a buffer justified by observed extremes rather than by a normal assumption',
    ],
    parameters: [
      {
        name: 'meanDemand',
        description: 'Mean demand per period',
        unit: 'units/period',
        min: 0,
        required: true,
      },
      {
        name: 'meanLeadTime',
        description: 'Mean replenishment lead time',
        unit: 'periods',
        min: 0,
        required: true,
      },
      {
        name: 'maxDemand',
        description: 'Highest observed demand in a period',
        unit: 'units/period',
        min: 0,
        required: true,
      },
      {
        name: 'maxLeadTime',
        description: 'Longest observed lead time',
        unit: 'periods',
        min: 0,
        required: true,
      },
    ],
    citation: 'Silver, Pyke & Thomas (2017)',
  },
  {
    id: 'days-of-supply',
    kind: 'policy',
    name: 'Days of supply',
    formula: 'SS = meanDemandPerDay × days',
    description:
      'Holds a fixed number of days of cover. Simple to explain and to agree with a supplier, but the protection it delivers depends on variability it never measures.',
    whenToUse: [
      'The business already thinks in weeks of cover',
      'Too little history for a statistical method, and you need a defensible number today',
    ],
    parameters: [
      {
        name: 'days',
        description: 'Days of cover to hold',
        unit: 'days',
        min: 0,
        required: true,
      },
      {
        name: 'meanDemandPerDay',
        description: 'Average demand per day — per DAY, because the method is in days',
        unit: 'units/day',
        min: 0,
        required: true,
      },
    ],
    citation: 'Silver, Pyke & Thomas (2017)',
  },
  {
    id: 'fixed',
    kind: 'policy',
    name: 'Fixed quantity',
    formula: 'SS = quantity',
    description:
      'A planner sets the buffer directly. Computes nothing, and reports what it was given so the override is visible in the explanation rather than hidden in a database column.',
    whenToUse: [
      'A person has made a judgement call that should not be recalculated',
      'A contractual or regulatory minimum applies',
    ],
    parameters: [
      {
        name: 'quantity',
        description: 'The buffer to hold',
        unit: 'units',
        min: 0,
        required: true,
      },
    ],
  },
  {
    id: 'percentage-of-average',
    kind: 'policy',
    name: 'Percentage of average',
    formula: 'SS = meanDemandPerPeriod × bufferPercentage',
    description:
      'Holds a percentage of average demand. Scales with demand level but not with demand variability, so two items with the same average and very different volatility get the same buffer.',
    whenToUse: [
      'A blanket buffer policy across many items',
      'A starting point before enough history exists to do better',
    ],
    parameters: [
      {
        name: 'bufferPercentage',
        description: 'Buffer as a fraction of mean demand, e.g. 0.3 for 30%',
        unit: 'fraction',
        min: 0,
        required: true,
      },
      {
        name: 'meanDemandPerPeriod',
        description: 'Mean demand per period, in whatever period you bucketed at',
        unit: 'units/period',
        min: 0,
        required: true,
      },
    ],
  },
]

const CATALOGUE: readonly SafetyStockMethodInfo[] = Object.freeze(ENTRIES.map(deepFreeze))

/**
 * Returns the full safety-stock method catalogue, statistical and policy alike.
 *
 * The array and its contents are frozen, so a caller cannot mutate the shared
 * catalogue and corrupt it for everyone else in the process.
 *
 * @param kind - Optional filter. Omit for every method.
 * @returns The matching method descriptions.
 * @example
 * ```ts
 * safetyStockMethods('policy').map((m) => m.id)
 * // ['days-of-supply', 'fixed', 'percentage-of-average']
 *
 * safetyStockMethods().find((m) => m.id === 'king')?.formula
 * // 'SS = Z · √(L̄ · σD² + D̄² · σLT²)'
 * ```
 */
export function safetyStockMethods(kind?: SafetyStockMethodKind): readonly SafetyStockMethodInfo[] {
  if (kind === undefined) return CATALOGUE
  if (kind !== 'statistical' && kind !== 'policy') {
    throw new Error(
      `safetyStockMethods: kind must be 'statistical' or 'policy' when given (got ${JSON.stringify(kind)})`,
    )
  }
  return CATALOGUE.filter((m) => m.kind === kind)
}
