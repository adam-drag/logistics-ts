/**
 * Input abstractions for the loaders. logistics-ts accepts three shapes of
 * tabular input and normalises them to a single row reader:
 *
 * - **row input** — an array of plain objects (`{ sku, qty, ... }[]`);
 * - **columnar input** — an object of parallel arrays (`{ sku: [...], qty: [...] }`);
 * - **{@link TableSource}** — the seam a future DuckDB/Parquet adapter implements
 *   to hand column-oriented data to the loaders without materialising objects.
 */

/** A column-oriented source of tabular data. The adapter seam. */
export interface TableSource {
  /** Number of rows. */
  readonly numRows: number
  /** Names of the available columns. */
  readonly columnNames: readonly string[]
  /** Returns the values of a column as an indexable, row-aligned sequence. */
  getColumn(name: string): ArrayLike<unknown>
}

/**
 * An array of row objects keyed by column name. Typed to `object` so that
 * typed record arrays (interfaces, which TypeScript does not consider
 * assignable to an index signature) are accepted without a cast.
 */
export type RowInput = ReadonlyArray<object>

/** An object of parallel, row-aligned column arrays. */
export type ColumnarInput = Record<string, ArrayLike<unknown>>

/** Any accepted tabular input. */
export type TableInput = RowInput | ColumnarInput | TableSource

/** A uniform, shape-agnostic reader over normalised tabular input. */
export interface RowReader {
  readonly numRows: number
  /** Whether a source column is present in the input. */
  hasColumn(name: string): boolean
  /** Reads a single cell; returns `undefined` when the column or row is absent. */
  getCell(row: number, column: string): unknown
}

function isTableSource(input: TableInput): input is TableSource {
  return (
    !Array.isArray(input) &&
    typeof (input as TableSource).getColumn === 'function' &&
    typeof (input as TableSource).numRows === 'number'
  )
}

/** Normalises any {@link TableInput} into a {@link RowReader}. */
export function normalizeInput(input: TableInput): RowReader {
  if (Array.isArray(input)) {
    const rows = input as RowInput
    // Homogeneous rows are assumed: the first row defines the column set.
    const columns = new Set(rows.length > 0 ? Object.keys(rows[0] as object) : [])
    return {
      numRows: rows.length,
      hasColumn: (name) => columns.has(name),
      getCell: (row, column) => (rows[row] as Record<string, unknown> | undefined)?.[column],
    }
  }

  if (isTableSource(input)) {
    const columns = new Set(input.columnNames)
    const cache = new Map<string, ArrayLike<unknown>>()
    const column = (name: string) => {
      let col = cache.get(name)
      if (!col) {
        col = input.getColumn(name)
        cache.set(name, col)
      }
      return col
    }
    return {
      numRows: input.numRows,
      hasColumn: (name) => columns.has(name),
      getCell: (row, name) => (columns.has(name) ? column(name)[row] : undefined),
    }
  }

  // Columnar input: an object of parallel arrays.
  const columnar = input as ColumnarInput
  const names = Object.keys(columnar)
  let numRows = 0
  for (const name of names) numRows = Math.max(numRows, columnar[name]?.length ?? 0)
  const columns = new Set(names)
  return {
    numRows,
    hasColumn: (name) => columns.has(name),
    getCell: (row, name) => columnar[name]?.[row],
  }
}
