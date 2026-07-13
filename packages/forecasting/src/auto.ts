/**
 * Automatic forecasting-method selection. It classifies the series' demand
 * pattern (Syntetos–Boylan–Croston), draws the candidate methods suited to that
 * quadrant, backtests each by rolling-origin, and returns the forecast from the
 * candidate with the lowest MASE — with an explanation naming the quadrant, the
 * candidates, and their scores. This is the library's flagship "explainable
 * auto" surface.
 *
 * @see Syntetos, Boylan & Croston (2005) for the quadrants; Hyndman & Koehler
 *   (2006) for MASE; Hyndman & Athanasopoulos (2021), fpp3 §5.10 for
 *   time-series cross-validation.
 */
import { classifyDemandPattern } from '@logistics-ts/classification'
import { explain } from '@logistics-ts/core'
import { type BacktestResult, backtest } from './backtest'
import { croston } from './croston'
import { holt } from './holt'
import { holtWinters } from './holt-winters'
import { round } from './round'
import { sba } from './sba'
import { ses } from './ses'
import { tsb } from './tsb'
import type { ForecastResult } from './types'

export interface AutoForecastOptions {
  /** Periods ahead to forecast. Default 1. */
  horizon?: number
  /**
   * Seasonal cycle length `m`. When provided and the series is long enough
   * (≥ 2·m) and non-intermittent, Holt-Winters joins the candidate set and the
   * MASE scale becomes seasonal.
   */
  seasonLength?: number
}

interface Candidate {
  name: string
  /** Point-forecast adapter for backtesting; returns `NaN`s when it cannot fit. */
  forecaster: (train: readonly number[], h: number) => number[]
  /** Full-series fit producing the final explained forecast. */
  run: (series: readonly number[], horizon: number) => ForecastResult
}

/**
 * Chooses and runs the best forecasting method for a series.
 *
 * Routing: SBC smooth/erratic series draw {SES, Holt, damped Holt, and
 * Holt-Winters when `seasonLength` fits}; intermittent/lumpy series draw {SBA,
 * Croston, TSB} with SBA as the fallback default. Each candidate is scored by
 * one-step rolling-origin MASE and the lowest wins; the winner is refit on the
 * full series for the requested `horizon`.
 *
 * @param series - Demand per period, oldest → newest, zero-filled. Non-empty.
 * @param options - `horizon` (default 1) and optional `seasonLength`.
 * @returns A {@link ForecastResult}; `method` is `auto-<winner>` and the
 *   reasoning records the quadrant, candidates, and their MASE scores.
 *
 * @example
 * ```ts
 * autoForecast([0, 0, 4, 0, 0, 6, 0, 3, 0, 0, 5], { horizon: 2 }).method
 * // e.g. 'auto-sba' — an intermittent series routed to the intermittent family
 * ```
 */
export function autoForecast(
  series: readonly number[],
  options: AutoForecastOptions = {},
): ForecastResult {
  const { horizon = 1 } = options
  if (series.length === 0) throw new Error('autoForecast requires a non-empty series')
  if (!Number.isInteger(horizon) || horizon < 1)
    throw new Error(`horizon must be a positive integer (got ${horizon})`)
  const m = options.seasonLength
  if (m !== undefined && (!Number.isInteger(m) || m < 2))
    throw new Error(`seasonLength must be an integer ≥ 2 (got ${m})`)

  const classification = classifyDemandPattern(series)
  const pattern = classification.value.pattern
  const intermittent = pattern === 'intermittent' || pattern === 'lumpy'

  const candidates = intermittent ? intermittentCandidates() : smoothCandidates(series, m)
  const defaultName = intermittent ? 'sba' : 'ses'
  const seasonality = !intermittent && m !== undefined ? m : 1

  // Score every candidate by rolling-origin MASE; a candidate that cannot be
  // backtested on this series (too short, no finite forecast) is skipped.
  const scored = candidates.map((c) => {
    let result: BacktestResult | undefined
    try {
      result = backtest(series, c.forecaster, { horizon: 1, seasonality }).value
    } catch {
      result = undefined
    }
    const mase = result && Number.isFinite(result.mase) ? result.mase : Number.POSITIVE_INFINITY
    return { candidate: c, mase, ran: result !== undefined }
  })

  const ranked = [...scored].sort((a, b) => a.mase - b.mase)
  const best = ranked[0]
  const backtested = best !== undefined && Number.isFinite(best.mase)
  const winner = backtested
    ? (best as (typeof scored)[number]).candidate
    : (candidates.find((c) => c.name === defaultName) ?? (candidates[0] as Candidate))

  const forecast = winner.run(series, horizon)

  // Distinguish the fallback cause: no candidate could run at all (series too
  // short for any rolling origin) vs. runs that all scored a non-finite MASE
  // (e.g. a constant series makes the naive scale zero).
  const anyRan = scored.some((s) => s.ran)
  const fallbackCause = anyRan
    ? 'no candidate produced a finite backtest MASE (a constant series makes the naive MASE scale zero)'
    : 'series has too little history for any rolling-origin backtest, so no candidate produced a finite backtest MASE'

  const warnings = [...(forecast.warnings ?? [])]
  if (!backtested)
    warnings.push(`${fallbackCause}; fell back to the ${pattern} default (${defaultName})`)

  const scoreLine = scored
    .map((s) => `${s.candidate.name} MASE ${Number.isFinite(s.mase) ? round(s.mase) : 'n/a'}`)
    .join(', ')

  return explain(forecast.value, {
    method: `auto-${winner.name}`,
    inputs: {
      pattern,
      candidates: candidates.map((c) => c.name).join(', '),
      selected: winner.name,
      horizon,
      periods: series.length,
      ...(backtested ? { winningMase: round((best as (typeof scored)[number]).mase) } : {}),
    },
    reasoning: [
      `SBC pattern: ${pattern} → ${intermittent ? 'intermittent' : 'smooth/erratic'} candidate family`,
      backtested
        ? `rolling-origin MASE — ${scoreLine}`
        : `no candidate scored a finite MASE (${scoreLine || 'no candidates scored'})`,
      `selected ${winner.name}${backtested ? ' (lowest MASE)' : ` (${pattern} default)`}`,
      ...forecast.reasoning.map((r) => `[${winner.name}] ${r}`),
    ],
    citations: [
      'Syntetos, Boylan & Croston (2005), JORS 56(5)',
      'Hyndman & Koehler (2006), IJF 22(4)',
      ...(forecast.citations ?? []),
    ],
    ...(warnings.length > 0 ? { warnings } : {}),
  })
}

/** Candidate set for smooth/erratic series. */
function smoothCandidates(series: readonly number[], m: number | undefined): Candidate[] {
  const list: Candidate[] = [
    {
      name: 'ses',
      forecaster: guard((t, h) => ses(t, { horizon: h }).value.forecast, 1),
      run: (s, h) => ses(s, { horizon: h }),
    },
    {
      name: 'holt',
      forecaster: guard((t, h) => holt(t, { horizon: h }).value.forecast, 2),
      run: (s, h) => holt(s, { horizon: h }),
    },
    {
      name: 'holt-damped',
      forecaster: guard((t, h) => holt(t, { damped: true, horizon: h }).value.forecast, 2),
      run: (s, h) => holt(s, { damped: true, horizon: h }),
    },
  ]
  if (m !== undefined && series.length >= 2 * m) {
    list.push({
      name: 'holt-winters',
      forecaster: guard(
        (t, h) => holtWinters(t, { seasonLength: m, horizon: h }).value.forecast,
        2 * m,
      ),
      run: (s, h) => holtWinters(s, { seasonLength: m, horizon: h }),
    })
  }
  return list
}

/** Candidate set for intermittent/lumpy series. */
function intermittentCandidates(): Candidate[] {
  return [
    {
      name: 'sba',
      forecaster: guard((t, h) => sba(t, { horizon: h }).value.forecast, 1),
      run: (s, h) => sba(s, { horizon: h }),
    },
    {
      name: 'croston',
      forecaster: guard((t, h) => croston(t, { horizon: h }).value.forecast, 1),
      run: (s, h) => croston(s, { horizon: h }),
    },
    {
      name: 'tsb',
      forecaster: guard((t, h) => tsb(t, { horizon: h }).value.forecast, 1),
      run: (s, h) => tsb(s, { horizon: h }),
    },
  ]
}

/** Wraps a forecaster so an under-length or throwing fit yields `NaN`s (skipped). */
function guard(
  fn: (train: readonly number[], h: number) => number[],
  minLength: number,
): (train: readonly number[], h: number) => number[] {
  return (train, h) => {
    if (train.length < minLength) return new Array<number>(h).fill(Number.NaN)
    try {
      return fn(train, h)
    } catch {
      return new Array<number>(h).fill(Number.NaN)
    }
  }
}
