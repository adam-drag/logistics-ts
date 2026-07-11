/**
 * The canonical record types every logistics-ts analysis speaks. Loaders map
 * arbitrary user data onto these shapes (see {@link ./table/loader}); all
 * algorithms consume them rather than raw user objects.
 *
 * Dates are treated as **calendar dates**, never instants. A `Date` or an ISO
 * date string (`"2026-01-31"`) is accepted for a record's date field. Records
 * preserve whatever `DateInput` you pass; date arithmetic (bucketization,
 * lead-time spans) converts to an integer epoch-day at computation time — it
 * does not rewrite the stored value (see {@link ./time/epoch-day}).
 */

/** A date at the API boundary: a `Date` or an ISO `YYYY-MM-DD` string. */
export type DateInput = Date | string

/**
 * A quantity of an item demanded (sold/shipped/consumed) on a date. The atomic
 * input to forecasting and demand classification.
 */
export interface DemandRecord {
  /** Stable identifier of the item (SKU). */
  itemId: string
  /** Calendar date the demand occurred. */
  date: DateInput
  /** Quantity demanded. Must be finite and non-negative. */
  quantity: number
  /** Optional stocking location, for location-aware analysis. */
  locationId?: string
  /** Optional unit price at the time, used for value-based ABC classification. */
  unitPrice?: number
}

/** A snapshot of on-hand stock for an item. */
export interface StockRecord {
  /** Stable identifier of the item (SKU). */
  itemId: string
  /** Quantity on hand. Must be finite and non-negative. */
  quantity: number
  /** Optional stocking location. */
  locationId?: string
  /** Optional unit cost, used for value-based classification and coverage. */
  unitCost?: number
  /** Optional time the snapshot was taken. */
  timestamp?: DateInput
}

/**
 * An observed replenishment lead time for an item — one record per receipt or
 * purchase order — so that lead-time variability (σ_LT) can be estimated.
 */
export interface LeadTimeRecord {
  /** Stable identifier of the item (SKU). */
  itemId: string
  /** Observed lead time in days. Must be finite and non-negative. */
  leadTimeDays: number
  /** Optional date the receipt/order was observed. */
  date?: DateInput
}
