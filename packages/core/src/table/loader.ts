/**
 * Loaders that map arbitrary tabular input onto the canonical record types via a
 * column mapping, coercing CSV-style string cells and collecting per-row
 * validation issues rather than throwing on the first bad row.
 *
 * Structural problems throw immediately — that is a configuration mistake. A
 * structural problem is a required column missing entirely, or a column the
 * caller explicitly named in the mapping that does not exist in the input.
 * (Empty input is not structural: it loads as zero records.)
 *
 * Per-row data problems are collected as {@link LoadIssue}s, unless
 * `throwOnIssue` is set. An invalid **required** field (a non-numeric quantity,
 * an unparseable date) skips the row; an invalid **optional** field (a
 * non-numeric unit price) keeps the row and omits the field — but is still
 * recorded as an issue. A genuinely absent optional cell is not an issue.
 */
import type {
  BomLine,
  DemandRecord,
  LeadTimeRecord,
  MasterScheduleRecord,
  StockRecord,
} from '../model'
import { toEpochDay } from '../time/epoch-day'
import { normalizeInput, type RowReader, type TableInput } from './table-source'

/** A single per-row validation problem. */
export interface LoadIssue {
  /** Zero-based row index in the input. */
  row: number
  /** The source column the problem concerns. */
  column: string
  /** Human- and agent-readable description of the problem. */
  problem: string
}

/** The result of a load: the valid records plus any collected issues. */
export interface LoadResult<T> {
  records: T[]
  issues: LoadIssue[]
}

export interface LoadOptions {
  /** Throw on the first data issue instead of collecting it and skipping the row. */
  throwOnIssue?: boolean
}

/** Maps canonical {@link DemandRecord} fields to source column names. */
export interface DemandColumnMap {
  itemId?: string
  date?: string
  quantity?: string
  locationId?: string
  unitPrice?: string
}

/** Maps canonical {@link StockRecord} fields to source column names. */
export interface StockColumnMap {
  itemId?: string
  quantity?: string
  locationId?: string
  unitCost?: string
  timestamp?: string
}

/** Maps canonical {@link LeadTimeRecord} fields to source column names. */
export interface LeadTimeColumnMap {
  itemId?: string
  leadTimeDays?: string
  date?: string
}

/** Maps canonical {@link BomLine} fields to source column names. */
export interface BomColumnMap {
  parentId?: string
  childId?: string
  quantityPer?: string
}

/** Maps canonical {@link MasterScheduleRecord} fields to source column names. */
export interface MasterScheduleColumnMap {
  itemId?: string
  date?: string
  quantity?: string
}

// --- Cell coercion --------------------------------------------------------

/** Coerces a cell to a non-empty string, or `null` if absent/empty. */
function toStringCell(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

/** Coerces a cell to a finite number (accepting numeric strings), or `null`. */
function toNumberCell(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Validates a cell as a parseable calendar date (`Date` or ISO string). */
function toDateCell(value: unknown): Date | string | null {
  if (!(value instanceof Date) && typeof value !== 'string') return null
  try {
    toEpochDay(value)
    return value
  } catch {
    return null
  }
}

// --- Field readers --------------------------------------------------------

interface FieldContext {
  row: number
  issues: LoadIssue[]
  throwOnIssue: boolean
}

function raise(ctx: FieldContext, column: string, problem: string): undefined {
  const issue: LoadIssue = { row: ctx.row, column, problem }
  if (ctx.throwOnIssue) {
    throw new Error(`Row ${ctx.row}, column "${column}": ${problem}`)
  }
  ctx.issues.push(issue)
  return undefined
}

/** Whether a cell is genuinely absent (as opposed to present but invalid). */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

/** Reads a required non-negative finite number; records an issue on failure. */
function requireQuantity(value: unknown, column: string, ctx: FieldContext): number | undefined {
  const n = toNumberCell(value)
  if (n === null) return raise(ctx, column, 'expected a finite number')
  if (n < 0) return raise(ctx, column, 'must not be negative')
  return n
}

/** Reads an optional non-negative finite number; a present-but-invalid cell is an issue. */
function optionalNumber(value: unknown, column: string, ctx: FieldContext): number | undefined {
  if (isAbsent(value)) return undefined
  return requireQuantity(value, column, ctx)
}

/** Reads an optional calendar date; a present-but-invalid cell is an issue. */
function optionalDate(
  value: unknown,
  column: string,
  ctx: FieldContext,
): Date | string | undefined {
  if (isAbsent(value)) return undefined
  const date = toDateCell(value)
  if (date === null) return raise(ctx, column, 'expected a calendar date (Date or ISO YYYY-MM-DD)')
  return date
}

/** Reads an optional string; a present-but-invalid cell is an issue. */
function optionalString(value: unknown, column: string, ctx: FieldContext): string | undefined {
  if (isAbsent(value)) return undefined
  const s = toStringCell(value)
  if (s === null) return raise(ctx, column, 'expected a string')
  return s
}

// --- Structural check -----------------------------------------------------

/**
 * Throws when a listed column is absent from the input. Callers pass the
 * required columns plus any *explicitly mapped* optional columns (`undefined`
 * entries — unmapped optionals — are ignored). Skipped for empty input, which
 * has no rows to prove any column with.
 */
function requireColumns(reader: RowReader, columns: ReadonlyArray<string | undefined>): void {
  if (reader.numRows === 0) return
  const missing = columns.filter((c): c is string => c !== undefined && !reader.hasColumn(c))
  if (missing.length > 0) {
    // "expected" rather than "required": the list includes explicitly mapped
    // optional columns, so a misspelled optional mapping lands here too.
    throw new Error(`Input is missing expected column(s): ${missing.join(', ')}`)
  }
}

// --- Loaders --------------------------------------------------------------

/**
 * Loads and validates {@link DemandRecord}s from tabular input.
 *
 * @param input - Tabular input ({@link TableInput}): rows of objects, a column
 *   table, or anything {@link normalizeInput} accepts.
 * @param mapping - Source column names per field. Defaults to `itemId`, `date`,
 *   `quantity`, `locationId`, `unitPrice`.
 * @param options - See {@link LoadOptions}.
 * @returns The valid {@link DemandRecord}s plus any collected {@link LoadIssue}s.
 * @example
 * ```ts
 * const { records, issues } = loadDemand(
 *   [
 *     { sku: 'A', when: '2026-01-05', qty: '10' }, // numeric strings are coerced
 *     { sku: 'A', when: 'oops', qty: '3' },
 *   ],
 *   { itemId: 'sku', date: 'when', quantity: 'qty' },
 * )
 *
 * records // [{ itemId: 'A', date: '2026-01-05', quantity: 10 }]
 * issues
 * // [{ row: 1, column: 'when',
 * //    problem: 'expected a calendar date (Date or ISO YYYY-MM-DD)' }]
 * ```
 */
export function loadDemand(
  input: TableInput,
  mapping: DemandColumnMap = {},
  options: LoadOptions = {},
): LoadResult<DemandRecord> {
  const reader = normalizeInput(input)
  const col = {
    itemId: mapping.itemId ?? 'itemId',
    date: mapping.date ?? 'date',
    quantity: mapping.quantity ?? 'quantity',
    locationId: mapping.locationId ?? 'locationId',
    unitPrice: mapping.unitPrice ?? 'unitPrice',
  }
  requireColumns(reader, [
    col.itemId,
    col.date,
    col.quantity,
    mapping.locationId,
    mapping.unitPrice,
  ])

  const throwOnIssue = options.throwOnIssue ?? false
  const records: DemandRecord[] = []
  const issues: LoadIssue[] = []

  for (let row = 0; row < reader.numRows; row++) {
    const ctx: FieldContext = { row, issues, throwOnIssue }

    const itemId = toStringCell(reader.getCell(row, col.itemId))
    if (itemId === null) {
      raise(ctx, col.itemId, 'expected a non-empty item id')
      continue
    }
    const date = toDateCell(reader.getCell(row, col.date))
    if (date === null) {
      raise(ctx, col.date, 'expected a calendar date (Date or ISO YYYY-MM-DD)')
      continue
    }
    const quantity = requireQuantity(reader.getCell(row, col.quantity), col.quantity, ctx)
    if (quantity === undefined) continue

    const record: DemandRecord = { itemId, date, quantity }
    const locationId = optionalString(reader.getCell(row, col.locationId), col.locationId, ctx)
    if (locationId !== undefined) record.locationId = locationId
    const unitPrice = optionalNumber(reader.getCell(row, col.unitPrice), col.unitPrice, ctx)
    if (unitPrice !== undefined) record.unitPrice = unitPrice
    records.push(record)
  }

  return { records, issues }
}

/**
 * Loads and validates {@link StockRecord}s from tabular input.
 *
 * @param input - Tabular input ({@link TableInput}).
 * @param mapping - Source column names per field. Defaults to `itemId`,
 *   `quantity`, `locationId`, `unitCost`, `timestamp`.
 * @param options - See {@link LoadOptions}.
 * @returns The valid {@link StockRecord}s plus any collected {@link LoadIssue}s.
 * @example
 * ```ts
 * const { records, issues } = loadStock([{ itemId: 'A', quantity: 120, unitCost: 4.5 }])
 *
 * records // [{ itemId: 'A', quantity: 120, unitCost: 4.5 }]
 * issues  // []
 * ```
 */
export function loadStock(
  input: TableInput,
  mapping: StockColumnMap = {},
  options: LoadOptions = {},
): LoadResult<StockRecord> {
  const reader = normalizeInput(input)
  const col = {
    itemId: mapping.itemId ?? 'itemId',
    quantity: mapping.quantity ?? 'quantity',
    locationId: mapping.locationId ?? 'locationId',
    unitCost: mapping.unitCost ?? 'unitCost',
    timestamp: mapping.timestamp ?? 'timestamp',
  }
  requireColumns(reader, [
    col.itemId,
    col.quantity,
    mapping.locationId,
    mapping.unitCost,
    mapping.timestamp,
  ])

  const throwOnIssue = options.throwOnIssue ?? false
  const records: StockRecord[] = []
  const issues: LoadIssue[] = []

  for (let row = 0; row < reader.numRows; row++) {
    const ctx: FieldContext = { row, issues, throwOnIssue }

    const itemId = toStringCell(reader.getCell(row, col.itemId))
    if (itemId === null) {
      raise(ctx, col.itemId, 'expected a non-empty item id')
      continue
    }
    const quantity = requireQuantity(reader.getCell(row, col.quantity), col.quantity, ctx)
    if (quantity === undefined) continue

    const record: StockRecord = { itemId, quantity }
    const locationId = optionalString(reader.getCell(row, col.locationId), col.locationId, ctx)
    if (locationId !== undefined) record.locationId = locationId
    const unitCost = optionalNumber(reader.getCell(row, col.unitCost), col.unitCost, ctx)
    if (unitCost !== undefined) record.unitCost = unitCost
    const timestamp = optionalDate(reader.getCell(row, col.timestamp), col.timestamp, ctx)
    if (timestamp !== undefined) record.timestamp = timestamp
    records.push(record)
  }

  return { records, issues }
}

/**
 * Loads and validates {@link LeadTimeRecord}s from tabular input.
 *
 * One record per observed receipt — do **not** pre-average them. Lead-time
 * variability is estimated from the spread across records, so collapsing them to
 * a mean discards exactly the information safety stock needs.
 *
 * @param input - Tabular input ({@link TableInput}).
 * @param mapping - Source column names per field. Defaults to `itemId`,
 *   `leadTimeDays`, `date`.
 * @param options - See {@link LoadOptions}.
 * @returns The valid {@link LeadTimeRecord}s plus any {@link LoadIssue}s.
 * @example
 * ```ts
 * const { records } = loadLeadTimes([
 *   { itemId: 'A', leadTimeDays: 12 },
 *   { itemId: 'A', leadTimeDays: 16 },
 * ])
 *
 * records // [{ itemId: 'A', leadTimeDays: 12 }, { itemId: 'A', leadTimeDays: 16 }]
 * ```
 */
export function loadLeadTimes(
  input: TableInput,
  mapping: LeadTimeColumnMap = {},
  options: LoadOptions = {},
): LoadResult<LeadTimeRecord> {
  const reader = normalizeInput(input)
  const col = {
    itemId: mapping.itemId ?? 'itemId',
    leadTimeDays: mapping.leadTimeDays ?? 'leadTimeDays',
    date: mapping.date ?? 'date',
  }
  requireColumns(reader, [col.itemId, col.leadTimeDays, mapping.date])

  const throwOnIssue = options.throwOnIssue ?? false
  const records: LeadTimeRecord[] = []
  const issues: LoadIssue[] = []

  for (let row = 0; row < reader.numRows; row++) {
    const ctx: FieldContext = { row, issues, throwOnIssue }

    const itemId = toStringCell(reader.getCell(row, col.itemId))
    if (itemId === null) {
      raise(ctx, col.itemId, 'expected a non-empty item id')
      continue
    }
    const leadTimeDays = requireQuantity(
      reader.getCell(row, col.leadTimeDays),
      col.leadTimeDays,
      ctx,
    )
    if (leadTimeDays === undefined) continue

    const record: LeadTimeRecord = { itemId, leadTimeDays }
    const date = optionalDate(reader.getCell(row, col.date), col.date, ctx)
    if (date !== undefined) record.date = date
    records.push(record)
  }

  return { records, issues }
}

/**
 * Loads and validates {@link BomLine}s — the edge list of a product-structure
 * DAG — from tabular input.
 *
 * A row whose `parentId` equals its `childId` is a data problem, not a
 * configuration one, so it is recorded as an issue and the row is skipped,
 * exactly like a negative quantity. That keeps the degenerate self-loop out of
 * the returned BOM rather than deferring it to an exception from `explode` /
 * `planRequirements` (in `@logistics-ts/planning`) once the whole file is
 * loaded — a 10,000-line BOM should report every bad row in one pass.
 *
 * This loader does **not** check the BOM for longer cycles: a cycle is a
 * property of the edge set as a whole, not of any one row, and detecting it is
 * part of the levelling pass in the planning package.
 *
 * @param input - Tabular input ({@link TableInput}): rows of objects, a column
 *   table, or anything {@link normalizeInput} accepts.
 * @param mapping - Source column names per field. Defaults to `parentId`,
 *   `childId`, `quantityPer`.
 * @param options - See {@link LoadOptions}.
 * @returns The valid {@link BomLine}s plus any collected {@link LoadIssue}s.
 * @example
 * ```ts
 * const { records, issues } = loadBom([
 *   { parent: 'BIKE', child: 'WHEEL', per: 2 },
 *   { parent: 'WHEEL', child: 'SPOKE', per: 32 },
 * ], { parentId: 'parent', childId: 'child', quantityPer: 'per' })
 *
 * records // [{ parentId: 'BIKE', childId: 'WHEEL', quantityPer: 2 }, …]
 * issues  // []
 * ```
 */
export function loadBom(
  input: TableInput,
  mapping: BomColumnMap = {},
  options: LoadOptions = {},
): LoadResult<BomLine> {
  const reader = normalizeInput(input)
  const col = {
    parentId: mapping.parentId ?? 'parentId',
    childId: mapping.childId ?? 'childId',
    quantityPer: mapping.quantityPer ?? 'quantityPer',
  }
  requireColumns(reader, [col.parentId, col.childId, col.quantityPer])

  const throwOnIssue = options.throwOnIssue ?? false
  const records: BomLine[] = []
  const issues: LoadIssue[] = []

  for (let row = 0; row < reader.numRows; row++) {
    const ctx: FieldContext = { row, issues, throwOnIssue }

    const parentId = toStringCell(reader.getCell(row, col.parentId))
    if (parentId === null) {
      raise(ctx, col.parentId, 'expected a non-empty item id')
      continue
    }
    const childId = toStringCell(reader.getCell(row, col.childId))
    if (childId === null) {
      raise(ctx, col.childId, 'expected a non-empty item id')
      continue
    }
    if (parentId === childId) {
      raise(ctx, col.childId, `'${childId}' cannot be a component of itself`)
      continue
    }
    const quantityPer = requireQuantity(reader.getCell(row, col.quantityPer), col.quantityPer, ctx)
    if (quantityPer === undefined) continue

    records.push({ parentId, childId, quantityPer })
  }

  return { records, issues }
}

/**
 * Loads and validates {@link MasterScheduleRecord}s — dated independent demand
 * for end items — from tabular input.
 *
 * The records are **dated**, matching every other record type in this package.
 * A multi-level MRP run needs them as period-indexed series instead; convert
 * them with `toMasterSchedule` (in `@logistics-ts/planning`), which buckets
 * every item onto one shared calendar so that period 0 means the same date for
 * every item in the plan.
 *
 * @param input - Tabular input ({@link TableInput}).
 * @param mapping - Source column names per field. Defaults to `itemId`, `date`,
 *   `quantity`.
 * @param options - See {@link LoadOptions}.
 * @returns The valid {@link MasterScheduleRecord}s plus any {@link LoadIssue}s.
 * @example
 * ```ts
 * const { records } = loadMasterSchedule([
 *   { sku: 'BIKE', due: '2026-03-02', qty: 100 },
 *   { sku: 'BIKE', due: '2026-03-09', qty: 150 },
 * ], { itemId: 'sku', date: 'due', quantity: 'qty' })
 *
 * records.length // 2
 * ```
 */
export function loadMasterSchedule(
  input: TableInput,
  mapping: MasterScheduleColumnMap = {},
  options: LoadOptions = {},
): LoadResult<MasterScheduleRecord> {
  const reader = normalizeInput(input)
  const col = {
    itemId: mapping.itemId ?? 'itemId',
    date: mapping.date ?? 'date',
    quantity: mapping.quantity ?? 'quantity',
  }
  requireColumns(reader, [col.itemId, col.date, col.quantity])

  const throwOnIssue = options.throwOnIssue ?? false
  const records: MasterScheduleRecord[] = []
  const issues: LoadIssue[] = []

  for (let row = 0; row < reader.numRows; row++) {
    const ctx: FieldContext = { row, issues, throwOnIssue }

    const itemId = toStringCell(reader.getCell(row, col.itemId))
    if (itemId === null) {
      raise(ctx, col.itemId, 'expected a non-empty item id')
      continue
    }
    const date = toDateCell(reader.getCell(row, col.date))
    if (date === null) {
      raise(ctx, col.date, 'expected a calendar date (Date or ISO YYYY-MM-DD)')
      continue
    }
    const quantity = requireQuantity(reader.getCell(row, col.quantity), col.quantity, ctx)
    if (quantity === undefined) continue

    records.push({ itemId, date, quantity })
  }

  return { records, issues }
}
