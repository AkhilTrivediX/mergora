/** Locale-neutral delimiters supported by the Data Grid CSV serializer. */
export type DataGridCsvDelimiter = "," | ";" | "\t" | "|";

/** Deterministic line endings supported by the Data Grid CSV serializer. */
export type DataGridCsvNewline = "\n" | "\r\n";

/**
 * Spreadsheet formula protection applied to text cells and headers.
 *
 * The default, `"apostrophe"`, prefixes formula-like text with an apostrophe.
 * Set this to `false` only when the complete data set is trusted and the
 * receiving application requires the original text byte-for-byte.
 */
export type DataGridCsvFormulaProtection = "apostrophe" | false;

/** Canonical values accepted from a Data Grid CSV column accessor. */
export type DataGridCsvValue = string | number | boolean | Date | null | undefined;

export interface DataGridCsvColumn<TRow extends object> {
  /** Stable identifier used for configuration validation and safe error context. */
  readonly id: string;
  /** Explicit, non-empty column heading written when `includeHeader` is enabled. */
  readonly header: string;
  /** Returns the canonical value for this column and supplied row. */
  readonly accessor: (row: TRow, rowIndex: number) => DataGridCsvValue;
}

export interface DataGridCsvOptions<TRow extends object> {
  /**
   * Exact row model to serialize, in output order. Consumers can supply their
   * full, filtered, selected, or filtered-selected row model without giving the
   * serializer ownership of Data Grid state.
   */
  readonly rows: readonly TRow[];
  /** Explicit columns, preserved in the declared order. */
  readonly columns: readonly DataGridCsvColumn<TRow>[];
  /** Locale-neutral field delimiter. Defaults to a comma. */
  readonly delimiter?: DataGridCsvDelimiter;
  /** Spreadsheet formula protection. Defaults to `"apostrophe"`. */
  readonly formulaProtection?: DataGridCsvFormulaProtection;
  /** Prepends a UTF-8 byte-order-mark character. Defaults to `false`. */
  readonly includeBom?: boolean;
  /** Writes the explicit column headers. Defaults to `true`. */
  readonly includeHeader?: boolean;
  /** Deterministic record separator. Defaults to CRLF. */
  readonly newline?: DataGridCsvNewline;
}

const supportedDelimiters: ReadonlySet<string> = new Set([",", ";", "\t", "|"]);
const supportedNewlines: ReadonlySet<string> = new Set(["\n", "\r\n"]);

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function assertBooleanOption(name: string, value: unknown): asserts value is boolean | undefined {
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`Mergora Data Grid CSV ${name} must be a boolean when provided.`);
  }
}

function assertConfiguration<TRow extends object>(
  options: DataGridCsvOptions<TRow>,
): asserts options is DataGridCsvOptions<TRow> {
  if (!isPlainRecord(options)) {
    throw new TypeError("Mergora Data Grid CSV options must be a plain object.");
  }
  if (!Array.isArray(options.rows)) {
    throw new TypeError("Mergora Data Grid CSV rows must be an array.");
  }
  if (!Array.isArray(options.columns) || options.columns.length === 0) {
    throw new TypeError("Mergora Data Grid CSV columns must be a non-empty array.");
  }

  const columnIds = new Set<string>();
  for (const column of options.columns) {
    if (!isPlainRecord(column)) {
      throw new TypeError("Mergora Data Grid CSV columns must be plain objects.");
    }
    if (typeof column.id !== "string" || column.id.trim().length === 0) {
      throw new TypeError("Mergora Data Grid CSV column ids must be non-empty strings.");
    }
    if (columnIds.has(column.id)) {
      throw new TypeError(`Mergora Data Grid CSV column id "${column.id}" must be unique.`);
    }
    columnIds.add(column.id);
    if (typeof column.header !== "string" || column.header.trim().length === 0) {
      throw new TypeError(
        `Mergora Data Grid CSV column "${column.id}" must have a non-empty header.`,
      );
    }
    if (typeof column.accessor !== "function") {
      throw new TypeError(
        `Mergora Data Grid CSV column "${column.id}" must provide an accessor function.`,
      );
    }
  }

  if (options.delimiter !== undefined && !supportedDelimiters.has(options.delimiter)) {
    throw new TypeError(
      "Mergora Data Grid CSV delimiter must be a comma, semicolon, tab, or pipe.",
    );
  }
  if (options.newline !== undefined && !supportedNewlines.has(options.newline)) {
    throw new TypeError("Mergora Data Grid CSV newline must be LF or CRLF.");
  }
  if (
    options.formulaProtection !== undefined &&
    options.formulaProtection !== false &&
    options.formulaProtection !== "apostrophe"
  ) {
    throw new TypeError('Mergora Data Grid CSV formulaProtection must be "apostrophe" or false.');
  }
  assertBooleanOption("includeBom", options.includeBom);
  assertBooleanOption("includeHeader", options.includeHeader);
}

function isFormulaLikeText(value: string): boolean {
  const firstCharacter = value.at(0);
  if (firstCharacter === "\t" || firstCharacter === "\r" || firstCharacter === "\n") {
    return true;
  }

  const withoutLeadingFormatting = value.replace(/^[\p{White_Space}\p{Cc}\p{Cf}]*/u, "");
  return /^[=+@-]/u.test(withoutLeadingFormatting);
}

function serializeValue(value: DataGridCsvValue, columnId: string, rowIndex: number): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        `Mergora Data Grid CSV column "${columnId}" returned a non-finite number for row ${rowIndex}.`,
      );
    }
    return String(value);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) {
      throw new TypeError(
        `Mergora Data Grid CSV column "${columnId}" returned an invalid date for row ${rowIndex}.`,
      );
    }
    return value.toISOString();
  }

  throw new TypeError(
    `Mergora Data Grid CSV column "${columnId}" returned an unsupported value for row ${rowIndex}.`,
  );
}

function serializeCell(
  value: string,
  delimiter: DataGridCsvDelimiter,
  formulaProtection: DataGridCsvFormulaProtection,
  protectFormula = true,
): string {
  const protectedValue =
    protectFormula && formulaProtection === "apostrophe" && isFormulaLikeText(value)
      ? `'${value}`
      : value;
  if (
    protectedValue.includes(delimiter) ||
    protectedValue.includes('"') ||
    protectedValue.includes("\r") ||
    protectedValue.includes("\n")
  ) {
    return `"${protectedValue.replaceAll('"', '""')}"`;
  }
  return protectedValue;
}

/**
 * Serializes a consumer-supplied Data Grid row model without browser, download,
 * network, or storage side effects. Column and row order are preserved exactly.
 */
export function createDataGridCsv<TRow extends object>(options: DataGridCsvOptions<TRow>): string {
  assertConfiguration(options);

  const delimiter = options.delimiter ?? ",";
  const formulaProtection = options.formulaProtection ?? "apostrophe";
  const newline = options.newline ?? "\r\n";
  const records: string[] = [];

  if (options.includeHeader !== false) {
    records.push(
      options.columns
        .map((column) => serializeCell(column.header, delimiter, formulaProtection))
        .join(delimiter),
    );
  }

  for (const [rowIndex, row] of options.rows.entries()) {
    records.push(
      options.columns
        .map((column) => {
          const value = column.accessor(row, rowIndex);
          return serializeCell(
            serializeValue(value, column.id, rowIndex),
            delimiter,
            formulaProtection,
            typeof value === "string",
          );
        })
        .join(delimiter),
    );
  }

  const csv = records.join(newline);
  return options.includeBom === true ? `\uFEFF${csv}` : csv;
}
