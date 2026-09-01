import type { DemandRecord, LeadTimeRecord, StockRecord } from '@logistics-ts/core'
import { describe, expect, it } from 'vitest'
import { aggregateItems, DAYS_PER_PERIOD } from './aggregate'

/**
 * `aggregateItems` is internal — not re-exported from the package index — but it
 * is the shared feeder for `coverage`, `turnover`, `issues` and the analyzer's
 * safety-stock path, so every one of those inherits whatever it gets wrong.
 *
 * It had no test file until an audit of PR #44 went looking. Its behaviour was
 * correct; what was missing was any assertion holding it there. Each documented
 * promise on `ItemAggregate` is pinned below, named after the promise it guards,
 * because those are the sentences the callers were written against.
 *
 * The two NaN contracts are the load-bearing ones: `NaN !== undefined`, so a
 * derived NaN passes an "is this present?" check and travels silently (it even
 * serialises to `null` through JSON). Callers are supposed to test these with
 * `Number.isFinite`, which is only safe while the NaN stays exactly where the
 * doc says it is.
 */
describe('aggregateItems', () => {
  const stock: StockRecord[] = [
    { itemId: 'B', quantity: 30, locationId: 'MAIN' },
    { itemId: 'B', quantity: 12, locationId: 'OVERFLOW' },
    { itemId: 'A', quantity: 5 },
  ]
  const demand: DemandRecord[] = [
    { itemId: 'A', date: '2026-01-01', quantity: 4 },
    { itemId: 'A', date: '2026-01-02', quantity: 6 },
    { itemId: 'A', date: '2026-01-03', quantity: 8 },
  ]
  const leadTimes: LeadTimeRecord[] = [
    { itemId: 'A', leadTimeDays: 4 },
    { itemId: 'A', leadTimeDays: 8 },
  ]

  describe('the item set', () => {
    it('covers the union of ids across stock, demand and lead times, sorted', () => {
      const rows = aggregateItems(
        [{ itemId: 'stock-only', quantity: 1 }],
        [{ itemId: 'demand-only', date: '2026-01-01', quantity: 1 }],
        [{ itemId: 'leadtime-only', leadTimeDays: 3 }],
      )
      expect(rows.map((r) => r.itemId)).toEqual(['demand-only', 'leadtime-only', 'stock-only'])
    })

    it('gives an item with stock but no demand a row, so dead-stock checks can see it', () => {
      const rows = aggregateItems([{ itemId: 'DEAD', quantity: 99 }], [])
      expect(rows).toHaveLength(1)
      expect(rows[0]?.series.buckets).toEqual([])
      expect(rows[0]?.stockOnHand).toBe(99)
    })
  })

  describe('demand statistics', () => {
    it('reports 0, not NaN, for an item with no demand history', () => {
      const row = aggregateItems([{ itemId: 'DEAD', quantity: 99 }], [])[0]
      // The doc says "0 for an item with no demand history (not NaN)" — and
      // mean([]) is NaN, so this is a real branch, not a tautology.
      expect(row?.meanDemandPerPeriod).toBe(0)
      expect(row?.demandStdDevPerPeriod).toBe(0)
    })

    it('reports 0 standard deviation with fewer than two periods', () => {
      const row = aggregateItems([], [{ itemId: 'A', date: '2026-01-01', quantity: 7 }])[0]
      expect(row?.series.buckets).toHaveLength(1)
      expect(row?.meanDemandPerPeriod).toBe(7)
      expect(row?.demandStdDevPerPeriod).toBe(0)
    })

    it('means and deviates over the dense bucketed series', () => {
      const row = aggregateItems([], demand)[0]
      // Daily buckets 4, 6, 8 → mean 6; sample sd = sqrt(((−2)²+0²+2²)/2) = 2.
      expect(row?.meanDemandPerPeriod).toBeCloseTo(6, 12)
      expect(row?.demandStdDevPerPeriod).toBeCloseTo(2, 12)
    })

    it('averages over zero-filled gaps rather than over observed days only', () => {
      // Two records five days apart: bucketize zero-fills the gap, so the mean
      // is over 5 daily buckets (10/5 = 2), not over the 2 days that had sales.
      const row = aggregateItems(
        [],
        [
          { itemId: 'A', date: '2026-01-01', quantity: 4 },
          { itemId: 'A', date: '2026-01-05', quantity: 6 },
        ],
      )[0]
      expect(row?.series.buckets).toHaveLength(5)
      expect(row?.meanDemandPerPeriod).toBeCloseTo(2, 12)
    })
  })

  describe('stock', () => {
    it('sums on-hand across every location', () => {
      const row = aggregateItems(stock, []).find((r) => r.itemId === 'B')
      expect(row?.stockOnHand).toBe(42)
    })

    it('reports 0 for an item that has demand but no stock record', () => {
      const row = aggregateItems([], demand)[0]
      expect(row?.stockOnHand).toBe(0)
    })
  })

  describe('lead times', () => {
    it('means and deviates over the observations', () => {
      const row = aggregateItems([], demand, leadTimes)[0]
      expect(row?.meanLeadTimeDays).toBeCloseTo(6, 12)
      // Sample sd of {4, 8} = sqrt(((−2)² + 2²)/1) = sqrt(8).
      expect(row?.leadTimeStdDevDays).toBeCloseTo(Math.sqrt(8), 12)
    })

    it('reports NaN — not 0 — when the item has no lead-time records', () => {
      const row = aggregateItems([], demand)[0]
      expect(row?.meanLeadTimeDays).toBeNaN()
      expect(row?.leadTimeStdDevDays).toBeNaN()
      // The distinction that matters to callers: NaN is not absence, and the
      // `!== undefined` idiom cannot tell them apart.
      expect(row?.meanLeadTimeDays).not.toBeUndefined()
      expect(Number.isFinite(row?.meanLeadTimeDays)).toBe(false)
    })

    it('reports a NaN deviation with a single observation, but a real mean', () => {
      const row = aggregateItems([], demand, [{ itemId: 'A', leadTimeDays: 5 }])[0]
      expect(row?.meanLeadTimeDays).toBe(5)
      expect(row?.leadTimeStdDevDays).toBeNaN()
    })
  })

  describe('granularity', () => {
    it('buckets by day when the option is omitted', () => {
      // The default had no test until this file existed. A default no test walks
      // is exactly how the simulatePolicy leadTimePeriods bug survived review.
      const row = aggregateItems([], demand)[0]
      expect(row?.series.granularity).toBe('day')
      expect(row?.series.buckets).toHaveLength(3)
      expect(row?.meanDemandPerPeriod).toBeCloseTo(6, 12)
    })

    it('collapses the same records into one bucket at weekly granularity', () => {
      // 2026-01-01..03 fall in one ISO week, so the mean becomes the total.
      const row = aggregateItems([], demand, [], { granularity: 'week' })[0]
      expect(row?.series.granularity).toBe('week')
      expect(row?.series.buckets).toHaveLength(1)
      expect(row?.meanDemandPerPeriod).toBeCloseTo(18, 12)
      expect(row?.demandStdDevPerPeriod).toBe(0)
    })

    it('carries the requested granularity onto an item with no demand at all', () => {
      // The fallback series is built by hand rather than by bucketize, so it is
      // the one place granularity could silently revert to the default.
      const row = aggregateItems([{ itemId: 'DEAD', quantity: 1 }], [], [], {
        granularity: 'month',
      })[0]
      expect(row?.series.granularity).toBe('month')
      expect(row?.series.itemId).toBe('DEAD')
    })
  })

  describe('DAYS_PER_PERIOD', () => {
    it('converts each granularity to days, with month on the 365-day year', () => {
      // Callers combine leadTimeDays (always days) with meanDemandPerPeriod
      // (whatever granularity was bucketed at); this table is the only bridge,
      // and a wrong entry silently rescales every reorder point built on it.
      expect(DAYS_PER_PERIOD.day).toBe(1)
      expect(DAYS_PER_PERIOD.week).toBe(7)
      expect(DAYS_PER_PERIOD.month).toBeCloseTo(30.4166666, 6)
      // Consistent with turnover.ts's annualisation: 12 months make a 365-day year.
      expect(DAYS_PER_PERIOD.month * 12).toBeCloseTo(365, 10)
    })
  })

  describe('edge cases', () => {
    it('returns no rows for entirely empty input', () => {
      expect(aggregateItems([], [])).toEqual([])
    })

    it('treats a zero-quantity stock record as an item that exists with no stock', () => {
      const rows = aggregateItems([{ itemId: 'Z', quantity: 0 }], [])
      expect(rows).toHaveLength(1)
      expect(rows[0]?.stockOnHand).toBe(0)
    })
  })
})
