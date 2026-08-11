/**
 * The greedy run-extension scaffold shared by the Silver-Meal and
 * least-unit-cost heuristics. Both walk the horizon placing an order at the
 * first period with positive demand, then extend that order's coverage one
 * period at a time while a per-run criterion keeps improving — they differ
 * ONLY in that criterion (cost per period vs cost per unit), so the stopping
 * semantics live here once and cannot drift apart between the two rules.
 *
 * Internal — not re-exported from the package index.
 */
import type { LotSizingCostParams, PlannedOrder } from './types'

/** The state of a candidate run, scored by a rule's criterion (lower is better). */
export interface RunCandidate {
  /** Setup + holding cost of covering the whole candidate run. */
  cost: number
  /** Number of periods the candidate run spans (≥ 1). */
  periods: number
  /** Total demand covered by the candidate run (> 0, see `greedyLotRuns`). */
  units: number
}

/**
 * Builds the order list by greedy run extension.
 *
 * Starting a run at period `t` (always a period with positive demand), the run
 * is extended to include period `e` while `criterion` does **not strictly
 * increase**; the first strict increase stops the run, which then covers
 * `t … e−1`. A *tie* therefore extends the run — this is the textbook phrasing
 * ("stop when the criterion increases") and it is what lets a zero-demand
 * period be absorbed into the current run rather than triggering a spurious
 * new order.
 *
 * Periods with zero demand are never chosen as a run *start*: entering them
 * with zero inventory, no order can be required, so the scan simply advances.
 * That also guarantees `units > 0` for every candidate, so a cost-per-unit
 * criterion can never divide by zero.
 *
 * Holding is accrued with the same end-of-period coverage convention as
 * `accumulateLotCost`: extending a run started at `t` to include period `e`
 * adds `h · (e − t) · d_e`.
 *
 * @param demand - Per-period demand vector, non-negative (validated by callers).
 * @param params - Setup cost `S` and holding cost `h` per unit per period.
 * @param criterion - Scores a candidate run; the run extends while this does not
 *   strictly increase. Lower is better.
 * @returns Planned order receipts, ascending by period; each order's quantity is
 *   exactly the demand of the run it covers (so callers may score the resulting
 *   plan with the coverage helper `accumulateLotCost`).
 */
export function greedyLotRuns(
  demand: readonly number[],
  params: LotSizingCostParams,
  criterion: (candidate: RunCandidate) => number,
): PlannedOrder[] {
  const { setupCost, holdingCostPerUnitPerPeriod: h } = params
  const horizon = demand.length
  const orders: PlannedOrder[] = []

  let period = 0
  while (period < horizon) {
    const d = demand[period] ?? 0
    if (d === 0) {
      // Zero demand and zero inventory entering this period: no order needed.
      period++
      continue
    }

    let runHolding = 0
    let units = d
    let best = criterion({ cost: setupCost, periods: 1, units })
    let end = period + 1

    for (let e = period + 1; e < horizon; e++) {
      const de = demand[e] ?? 0
      const nextHolding = runHolding + h * (e - period) * de
      const nextUnits = units + de
      const next = criterion({
        cost: setupCost + nextHolding,
        periods: e - period + 1,
        units: nextUnits,
      })
      // Stop at the FIRST strict increase; a tie extends the run.
      if (next > best) break
      runHolding = nextHolding
      units = nextUnits
      best = next
      end = e + 1
    }

    orders.push({ period, quantity: units })
    period = end
  }

  return orders
}
