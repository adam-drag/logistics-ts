/**
 * Deterministic synthetic supply-chain data. Given a seed, this produces a
 * repeatable catalogue of demand history, on-hand stock, and observed lead
 * times — so that examples, demos, and AI agents can exercise the library with
 * zero setup and realistic demand shapes.
 */
import type { DateInput, DemandRecord, LeadTimeRecord, StockRecord } from '../model'
import type { Granularity } from '../time/bucketize'
import { formatEpochDay, fromEpochDay, toEpochDay } from '../time/epoch-day'

/** The statistical character of an item's demand. */
export type DemandProfile =
  | 'smooth' // low-variability demand every period
  | 'seasonal' // sinusoidal seasonality
  | 'trending' // steady growth
  | 'intermittent' // sporadic demand, stable size (high ADI, low CV²)
  | 'lumpy' // sporadic demand, erratic size (high ADI, high CV²)
  | 'mixed' // a catalogue mixing all of the above across items

export interface GenerateOptions {
  /** Number of items (SKUs) to generate. Default 10. */
  items?: number
  /** Number of periods of history per item. Default 24. */
  periods?: number
  /** Demand profile applied to every item, or `'mixed'` to vary it. Default `'mixed'`. */
  profile?: DemandProfile
  /** Spacing between periods. Default `'month'`. */
  granularity?: Granularity
  /** Date of the first period. Default `'2024-01-01'`. */
  startDate?: DateInput
  /** Seed for the PRNG. The same seed always yields the same dataset. Default 1. */
  seed?: number
}

/** A self-contained synthetic dataset. */
export interface ExampleDataset {
  demand: DemandRecord[]
  stock: StockRecord[]
  leadTimes: LeadTimeRecord[]
}

const BASE_PROFILES: readonly DemandProfile[] = [
  'smooth',
  'seasonal',
  'trending',
  'intermittent',
  'lumpy',
]

/** A small, fast, seedable PRNG (mulberry32) yielding numbers in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** A standard-normal sample via the Box–Muller transform. */
function gaussian(rng: () => number): number {
  let u = 0
  while (u === 0) u = rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Advances a start date by `index` periods of the given granularity, as ISO. */
function periodDate(startEpochDay: number, index: number, granularity: Granularity): string {
  if (granularity !== 'month') {
    const step = granularity === 'week' ? 7 : 1
    return formatEpochDay(startEpochDay + index * step)
  }
  const start = fromEpochDay(startEpochDay)
  const monthOrdinal = start.getUTCFullYear() * 12 + start.getUTCMonth() + index
  const year = Math.floor(monthOrdinal / 12)
  const month = monthOrdinal % 12
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(start.getUTCDate(), daysInMonth)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Demand quantity for a period under a profile; 0 means "no demand". */
function demandForPeriod(
  profile: DemandProfile,
  level: number,
  period: number,
  periods: number,
  rng: () => number,
): number {
  switch (profile) {
    case 'smooth':
      return Math.max(0, Math.round(level + gaussian(rng) * level * 0.1))
    case 'seasonal': {
      const seasonal = 1 + 0.5 * Math.sin((2 * Math.PI * period) / 12)
      return Math.max(0, Math.round(level * seasonal + gaussian(rng) * level * 0.1))
    }
    case 'trending': {
      const growth = 1 + (0.8 * period) / Math.max(1, periods - 1)
      return Math.max(0, Math.round(level * growth + gaussian(rng) * level * 0.1))
    }
    case 'intermittent':
      // Demand occurs ~30% of periods, at a fairly stable size.
      return rng() < 0.3 ? Math.max(1, Math.round(level + gaussian(rng) * level * 0.15)) : 0
    case 'lumpy':
      // Demand occurs ~25% of periods, at a highly variable size.
      return rng() < 0.25 ? Math.max(1, Math.round(level * (0.2 + rng() * 2.8))) : 0
    case 'mixed':
      return demandForPeriod('smooth', level, period, periods, rng)
  }
}

/**
 * Generates a deterministic synthetic dataset.
 *
 * @example
 * ```ts
 * const { demand, stock, leadTimes } = generateExampleData({ items: 20, periods: 36 })
 * ```
 */
export function generateExampleData(options: GenerateOptions = {}): ExampleDataset {
  const {
    items = 10,
    periods = 24,
    profile = 'mixed',
    granularity = 'month',
    startDate = '2024-01-01',
    seed = 1,
  } = options

  const rng = mulberry32(seed)
  const startEpochDay = toEpochDay(startDate)

  const demand: DemandRecord[] = []
  const stock: StockRecord[] = []
  const leadTimes: LeadTimeRecord[] = []

  for (let i = 0; i < items; i++) {
    const itemId = `SKU-${String(i + 1).padStart(4, '0')}`
    const itemProfile =
      profile === 'mixed' ? (BASE_PROFILES[i % BASE_PROFILES.length] as DemandProfile) : profile

    const level = Math.round(20 + rng() * 180)
    const unitPrice = Math.round((5 + rng() * 95) * 100) / 100
    const unitCost = Math.round(unitPrice * (0.4 + rng() * 0.3) * 100) / 100

    for (let period = 0; period < periods; period++) {
      const quantity = demandForPeriod(itemProfile, level, period, periods, rng)
      // Emit only realised demand; zero periods are absent, as in real
      // transactional data. bucketize() re-introduces the zeros densely.
      if (quantity > 0) {
        demand.push({
          itemId,
          date: periodDate(startEpochDay, period, granularity),
          quantity,
          unitPrice,
        })
      }
    }

    stock.push({
      itemId,
      quantity: Math.round(level * (0.5 + rng() * 2.5)),
      unitCost,
    })

    // A handful of lead-time observations around an item-specific mean.
    const leadTimeMean = Math.round(7 + rng() * 23)
    for (let k = 0; k < 5; k++) {
      leadTimes.push({
        itemId,
        leadTimeDays: Math.max(1, Math.round(leadTimeMean + gaussian(rng) * leadTimeMean * 0.2)),
      })
    }
  }

  return { demand, stock, leadTimes }
}
