/**
 * Demand-pattern classification via the Syntetos–Boylan–Croston (SBC) scheme.
 * Two statistics place a series in one of four quadrants:
 *
 * - **ADI** — average demand interval (periods per demand occurrence);
 * - **CV²** — squared coefficient of variation of the non-zero demand sizes.
 *
 * The quadrant drives forecasting method selection (see M3): smooth/erratic
 * series suit exponential smoothing, intermittent/lumpy series suit Croston and
 * its variants.
 *
 * @see Syntetos, A.A., Boylan, J.E. & Croston, J.D. (2005). On the categorization
 *   of demand patterns. Journal of the Operational Research Society, 56(5),
 *   495–503.
 */
import {
  type Explained,
  averageDemandInterval,
  explain,
  squaredCvOfNonZero,
} from '@logistics-ts/core'

/** One of the four SBC demand patterns. */
export type DemandPattern = 'smooth' | 'erratic' | 'intermittent' | 'lumpy'

export interface DemandPatternOptions {
  /** ADI boundary between frequent and intermittent demand. Default 1.32. */
  adiCutoff?: number
  /** CV² boundary between stable and variable demand size. Default 0.49. */
  cv2Cutoff?: number
}

export interface DemandPatternResult {
  pattern: DemandPattern
  /** Average demand interval. */
  adi: number
  /** Squared coefficient of variation of non-zero demand sizes. */
  cv2: number
  /** Forecasting method families suited to this pattern (see M3). */
  recommendedMethods: string[]
}

const RECOMMENDED: Record<DemandPattern, string[]> = {
  smooth: ['SES', 'Holt', 'Holt-Winters'],
  erratic: ['SES', 'Holt'],
  intermittent: ['Croston', 'SBA'],
  lumpy: ['SBA', 'TSB'],
}

const DESCRIPTION: Record<DemandPattern, string> = {
  smooth: 'frequent demand of stable size',
  erratic: 'frequent demand of highly variable size',
  intermittent: 'sporadic demand of stable size',
  lumpy: 'sporadic demand of highly variable size',
}

/**
 * Classifies a demand series into an SBC pattern.
 *
 * @param series - Demand per period, **including zero periods** (use
 *   {@link bucketize} from core to produce a dense, zero-filled series).
 * @param options - Optional cutoff overrides.
 *
 * @example
 * ```ts
 * classifyDemandPattern([0, 4, 0, 0, 6, 0, 5]).value.pattern // 'intermittent'
 * ```
 */
export function classifyDemandPattern(
  series: readonly number[],
  options: DemandPatternOptions = {},
): Explained<DemandPatternResult> {
  const { adiCutoff = 1.32, cv2Cutoff = 0.49 } = options

  const adi = averageDemandInterval(series)
  const cv2 = squaredCvOfNonZero(series)
  const warnings: string[] = []

  // With no demand at all ADI is undefined; with a single demand CV² is
  // undefined. Treat an undefined CV² as 0 (no measurable size variation) and
  // an undefined ADI as "not intermittent", then flag the low-data caveat.
  const nonZero = series.filter((v) => v !== 0).length
  if (nonZero === 0) warnings.push('series has no demand; classification is not meaningful')
  else if (nonZero < 2) warnings.push('fewer than two demand occurrences; CV² is unreliable')

  const effectiveAdi = Number.isNaN(adi) ? 1 : adi
  const effectiveCv2 = Number.isNaN(cv2) ? 0 : cv2

  const intermittent = effectiveAdi >= adiCutoff
  const variable = effectiveCv2 >= cv2Cutoff
  const pattern: DemandPattern = intermittent
    ? variable
      ? 'lumpy'
      : 'intermittent'
    : variable
      ? 'erratic'
      : 'smooth'

  // A series with no demand has no method to recommend; otherwise copy so
  // callers can't mutate the shared RECOMMENDED constant.
  const recommendedMethods = nonZero === 0 ? [] : [...RECOMMENDED[pattern]]

  return explain(
    { pattern, adi, cv2, recommendedMethods },
    {
      method: 'syntetos-boylan-croston',
      inputs: { adi: round(adi), cv2: round(cv2), adiCutoff, cv2Cutoff },
      reasoning: [
        `ADI ${fmt(adi)} ${intermittent ? '≥' : '<'} ${adiCutoff} → ${intermittent ? 'sporadic' : 'frequent'} demand`,
        `CV² ${fmt(cv2)} ${variable ? '≥' : '<'} ${cv2Cutoff} → ${variable ? 'variable' : 'stable'} demand size`,
        `classified as ${pattern}: ${DESCRIPTION[pattern]}`,
        recommendedMethods.length > 0
          ? `suited to ${recommendedMethods.join(', ')}`
          : 'no demand to forecast',
      ],
      citations: ['Syntetos, Boylan & Croston (2005), JORS 56(5)'],
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  )
}

function round(x: number): number {
  return Number.isNaN(x) ? Number.NaN : Math.round(x * 1000) / 1000
}

function fmt(x: number): string {
  return Number.isNaN(x) ? 'n/a' : String(round(x))
}
