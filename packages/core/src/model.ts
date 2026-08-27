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

/**
 * One edge of a bill-of-materials: the parent item consumes `quantityPer` units
 * of the child item per unit of parent produced.
 *
 * A `BomRecord` is the edge list of a **product-structure DAG**. It must be
 * acyclic — an item that is transitively its own component cannot be planned,
 * and {@link explode} rejects it naming the offending edge.
 *
 * @see Orlicky, J. (1975). Material Requirements Planning, McGraw-Hill —
 *   product structure and low-level codes.
 */
export interface BomLine {
  /** Stable identifier of the assembly that consumes the child. */
  parentId: string
  /** Stable identifier of the component consumed. */
  childId: string
  /**
   * Units of `childId` consumed per unit of `parentId` (units/unit). Must be
   * finite and non-negative; scrap/yield allowances belong in this factor.
   */
  quantityPer: number
}

/** A complete bill of materials: the edge list of the product-structure DAG. */
export type BomRecord = BomLine[]

/**
 * One line of a master production schedule: the independent demand that drives
 * an MRP run. Reuses the calendar-date boundary convention of the other records.
 */
export interface MasterScheduleRecord {
  /** Stable identifier of the end item being scheduled. */
  itemId: string
  /** Calendar date the quantity is required. */
  date: DateInput
  /** Quantity required. Must be finite and non-negative. */
  quantity: number
}
