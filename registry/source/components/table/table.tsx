import "./table.css";

import {
  forwardRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
} from "react";

export interface TableColumn<TData extends object> {
  /** Stable column identity used as the React key. */
  readonly id: string;
  /** Visible column-header content and the source for optional responsive labels. */
  readonly header: ReactNode;
  /** Renders a cell value from its source row. */
  readonly cell: (row: TData) => ReactNode;
  /** Logical alignment applied consistently to the column header and body cells. */
  readonly align?: "start" | "center" | "end";
  /** Renders this column's body cells as scoped row headers. */
  readonly rowHeader?: boolean;
}

export interface TableProps<TData extends object> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  /** Visible native table caption that identifies the tabular data. */
  readonly caption: ReactNode;
  /** Accessible name for the focusable overflow region surrounding the table. */
  readonly regionLabel: string;
  /** Ordered row models rendered into the table body. */
  readonly rows: readonly TData[];
  /** Ordered column definitions shared by the header and every row. */
  readonly columns: readonly TableColumn<TData>[];
  /** Returns a stable unique React key for a source row. */
  readonly getRowId: (row: TData) => string;
  /** Content spanning every column when rows is empty; defaults to No rows. */
  readonly emptyContent?: ReactNode;
  /** Adds data-label values for narrow-screen layouts; false omits those attributes. */
  readonly responsiveLabels?: boolean;
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

function TableInner<TData extends object>(
  {
    caption,
    regionLabel,
    rows,
    columns,
    getRowId,
    emptyContent = "No rows",
    responsiveLabels = false,
    className,
    ...props
  }: TableProps<TData>,
  ref: React.ForwardedRef<HTMLDivElement>,
): ReactElement {
  return (
    <div
      {...props}
      ref={ref}
      role="region"
      aria-label={regionLabel}
      tabIndex={0}
      className={classes("mrg-table", className)}
      data-slot="table-region"
      data-responsive-labels={responsiveLabels || undefined}
    >
      <table data-slot="table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col" data-align={column.align ?? "start"}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="mrg-table__empty" colSpan={Math.max(1, columns.length)}>
                {emptyContent}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowId(row)}>
                {columns.map((column) => {
                  const Element = column.rowHeader ? "th" : "td";
                  return (
                    <Element
                      key={column.id}
                      scope={column.rowHeader ? "row" : undefined}
                      data-align={column.align ?? "start"}
                      data-label={
                        responsiveLabels && typeof column.header === "string"
                          ? column.header
                          : undefined
                      }
                    >
                      {column.cell(row)}
                    </Element>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Generic ref-aware call signature preserved by the forwarded Table implementation. */
export interface TableComponent {
  <TData extends object>(props: TableProps<TData> & RefAttributes<HTMLDivElement>): ReactElement;
}

export const Table = forwardRef(TableInner) as TableComponent;
