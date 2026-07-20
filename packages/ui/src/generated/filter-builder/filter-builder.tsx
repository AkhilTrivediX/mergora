// Generated from registry/source/components/filter-builder/filter-builder.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./filter-builder.css";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

export interface FilterBuilderOperator {
  /** Provides the stable operator value stored in each filter. */
  readonly id: string;
  /** Presents the operator name in the editor and active summary. */
  readonly label: string;
  /** Removes the value editor when false, for operators such as “is empty”. */
  readonly requiresValue?: boolean;
}

export interface FilterBuilderField {
  /** Provides the stable field value stored in each filter. */
  readonly id: string;
  /** Presents the field name in selectors and active summaries. */
  readonly label: string;
  /** Restricts the operator selector to choices valid for this field. */
  readonly operators: readonly FilterBuilderOperator[];
}

export interface FilterBuilderFilter {
  /** Identifies this filter for controlled updates, removal, and stable rendering. */
  readonly id: string;
  /** References a field identifier supplied through the fields collection. */
  readonly field: string;
  /** References an operator valid for the selected field. */
  readonly operator: string;
  /** Stores the canonical consumer value without imposing domain-specific parsing. */
  readonly value: string;
}

export interface FilterBuilderSavedFilter {
  /** Provides a stable identifier for the saved-filter choice. */
  readonly id: string;
  /** Presents a domain-neutral name for the saved-filter choice. */
  readonly label: string;
  /** Supplies the complete filter set applied when this saved choice is selected. */
  readonly filters: readonly FilterBuilderFilter[];
}

export interface FilterBuilderUrlAdapter {
  /** Optionally reads a serialized initial value from consumer-controlled URL state. */
  readonly read?: () => string;
  /** Receives serialized changes and their reason without choosing a routing library. */
  readonly write: (
    serialized: string,
    detail: { readonly reason: FilterBuilderChangeReason },
  ) => void;
}

export type FilterBuilderChangeReason = "add" | "remove" | "update" | "clear" | "saved" | "reset";

export interface FilterBuilderMessages {
  /** Labels the action that appends a new editable filter. */
  readonly add: string;
  /** Labels the action that removes one editable filter. */
  readonly remove: string;
  /** Labels the action that removes every active filter. */
  readonly clear: string;
  /** Labels each filter’s field selector. */
  readonly field: string;
  /** Labels each filter’s operator selector. */
  readonly operator: string;
  /** Labels each filter’s canonical value input. */
  readonly value: string;
  /** Names the optional summary of currently active filters. */
  readonly activeSummary: string;
  /** Names the optional saved-filter selector. */
  readonly savedFilters: string;
  /** Labels the action that applies a saved filter set. */
  readonly applySaved: string;
  /** Labels the narrow-screen action that opens the filter editor. */
  readonly mobileOpen: string;
  /** Labels the narrow-screen action that closes the filter editor. */
  readonly mobileClose: string;
  /** Describes the state in which no filters are active. */
  readonly empty: string;
  /** Generates the accessible name for a filter at the given one-based position. */
  readonly filterLabel: (position: number) => string;
  /** Generates the accessible drawer name from the root label. */
  readonly drawerLabel: (label: string) => string;
  /** Generates the narrow-screen action label with the active filter count. */
  readonly editCount: (label: string, count: number) => string;
  /** Explains how to recover when a required filter value is missing. */
  readonly valueRecovery: string;
  /** Replaces an absent value in the optional active-filter summary. */
  readonly missingSummaryValue: string;
}

export interface FilterBuilderProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onChange"
> {
  /** Names the filter builder for visible and assistive-technology context. */
  readonly label: string;
  /** Defines selectable fields and the operators valid for each field. */
  readonly fields: readonly FilterBuilderField[];
  /** Controls the complete filter collection when supplied. */
  readonly filters?: readonly FilterBuilderFilter[];
  /** Sets the initial filter collection for uncontrolled use. */
  readonly defaultFilters?: readonly FilterBuilderFilter[];
  /** Reports filter changes with the operation and affected identifier. */
  readonly onFiltersChange?: (
    filters: readonly FilterBuilderFilter[],
    detail: { readonly reason: FilterBuilderChangeReason; readonly filterId?: string },
  ) => void;
  /** Serializes active filters into a hidden successful control for native form submission. */
  readonly name?: string;
  /** Prevents editing, saved-filter application, clearing, and URL writes. */
  readonly disabled?: boolean;
  /** Preserves values and form submission while removing mutating controls. */
  readonly readOnly?: boolean;
  /** Shows a compact active-filter summary; false removes its UI and semantics. */
  readonly showActiveSummary?: boolean;
  /** Customizes each optional summary entry without changing canonical filter values. */
  readonly renderFilterSummary?: (filter: FilterBuilderFilter) => ReactNode;
  /** Enables saved choices with an array; false removes their UI and behavior. */
  readonly savedFilters?: false | readonly FilterBuilderSavedFilter[];
  /** Enables consumer-owned URL synchronization; false removes all adapter reads and writes. */
  readonly urlAdapter?: false | FilterBuilderUrlAdapter;
  /** Moves editing into a narrow-screen drawer; false keeps the editor inline. */
  readonly mobileDrawer?: boolean;
  /** Overrides individual localized strings while retaining defaults for omitted entries. */
  readonly messages?: Partial<FilterBuilderMessages>;
}

const defaultMessages: FilterBuilderMessages = {
  add: "Add filter",
  remove: "Remove",
  clear: "Clear filters",
  field: "Field",
  operator: "Operator",
  value: "Value",
  activeSummary: "Active filters",
  savedFilters: "Saved filters",
  applySaved: "Apply saved filter",
  mobileOpen: "Edit filters",
  mobileClose: "Done",
  empty: "No filters applied.",
  filterLabel: (position) => `Filter ${position}`,
  drawerLabel: (label) => `${label}: filter editor`,
  editCount: (label, count) => `${label} (${count})`,
  valueRecovery: "Enter a value for this filter or choose an operator that does not need one.",
  missingSummaryValue: "value needed",
};

const separator = "\u001f";

function classes(...values: readonly (string | false | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function serializeFilters(filters: readonly FilterBuilderFilter[]): string {
  const parameters = new URLSearchParams();
  for (const filter of filters) {
    parameters.append(
      "filter",
      [filter.id, filter.field, filter.operator, filter.value].join(separator),
    );
  }
  return parameters.toString();
}

export function parseFilters(serialized: string): readonly FilterBuilderFilter[] {
  const parameters = new URLSearchParams(
    serialized.startsWith("?") ? serialized.slice(1) : serialized,
  );
  const seen = new Set<string>();
  return parameters.getAll("filter").map((entry) => {
    const [id, field, operator, value, ...extra] = entry.split(separator);
    if (
      extra.length > 0 ||
      !id ||
      !field ||
      !operator ||
      seen.has(id) ||
      id.length > 120 ||
      field.length > 120 ||
      operator.length > 120 ||
      (value?.length ?? 0) > 2000
    ) {
      throw new Error("Mergora FilterBuilder received an invalid serialized filter.");
    }
    seen.add(id);
    return { id, field, operator, value: value ?? "" };
  });
}

export function FilterBuilder({
  label,
  fields,
  filters: controlledFilters,
  defaultFilters: defaultFiltersProp,
  onFiltersChange,
  name,
  disabled = false,
  readOnly = false,
  showActiveSummary = false,
  renderFilterSummary,
  savedFilters = false,
  urlAdapter = false,
  mobileDrawer = false,
  messages: messageOverrides,
  className,
  onReset,
  ...props
}: FilterBuilderProps): ReactElement {
  const defaultFilters = defaultFiltersProp ?? [];
  if (
    fields.length === 0 ||
    fields.some(
      (field) =>
        field.id.length === 0 ||
        field.operators.length === 0 ||
        field.operators.some((operator) => operator.id.length === 0) ||
        new Set(field.operators.map((operator) => operator.id)).size !== field.operators.length,
    ) ||
    new Set(fields.map((field) => field.id)).size !== fields.length
  ) {
    throw new Error("Mergora FilterBuilder requires unique fields with unique operators.");
  }
  if (controlledFilters !== undefined && defaultFiltersProp !== undefined) {
    throw new Error(
      "Mergora FilterBuilder controlled filters cannot be combined with defaultFilters.",
    );
  }
  const messages = { ...defaultMessages, ...messageOverrides };
  const reactId = useId().replaceAll(":", "");
  const nextId = useRef(0);
  const drawer = useRef<HTMLDialogElement>(null);
  const drawerTrigger = useRef<HTMLButtonElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [internalFilters, setInternalFilters] = useState<readonly FilterBuilderFilter[]>(() => {
    if (controlledFilters !== undefined || urlAdapter === false || urlAdapter.read === undefined) {
      return defaultFilters;
    }
    const serialized = urlAdapter.read();
    return serialized === "" ? defaultFilters : parseFilters(serialized);
  });
  const filters = controlledFilters ?? internalFilters;
  if (
    filters.some(
      (filter) =>
        filter.id.length === 0 ||
        filter.id.length > 120 ||
        filter.field.length === 0 ||
        filter.field.length > 120 ||
        filter.operator.length === 0 ||
        filter.operator.length > 120 ||
        filter.value.length > 2000,
    ) ||
    new Set(filters.map((filter) => filter.id)).size !== filters.length
  ) {
    throw new Error("Mergora FilterBuilder filters require valid, unique IDs and bounded values.");
  }
  const firstField = fields[0]!;

  useEffect(() => {
    if (!mobileDrawer) return;
    const element = drawer.current;
    if (element === null) return;
    if (drawerOpen && !element.open) element.showModal();
    if (!drawerOpen && element.open) element.close();
  }, [drawerOpen, mobileDrawer]);

  const commit = (
    next: readonly FilterBuilderFilter[],
    reason: FilterBuilderChangeReason,
    filterId?: string,
  ) => {
    if (controlledFilters === undefined) setInternalFilters(next);
    onFiltersChange?.(next, { reason, ...(filterId ? { filterId } : {}) });
    if (urlAdapter !== false) urlAdapter.write(serializeFilters(next), { reason });
  };
  const add = () => {
    const id = `${reactId}-filter-${String(++nextId.current)}`;
    commit(
      [
        ...filters,
        {
          id,
          field: firstField.id,
          operator: firstField.operators[0]!.id,
          value: "",
        },
      ],
      "add",
      id,
    );
  };
  const update = (id: string, patch: Partial<FilterBuilderFilter>) =>
    commit(
      filters.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter)),
      "update",
      id,
    );
  const remove = (id: string) =>
    commit(
      filters.filter((filter) => filter.id !== id),
      "remove",
      id,
    );
  const summaryFor = (filter: FilterBuilderFilter): ReactNode => {
    if (renderFilterSummary) return renderFilterSummary(filter);
    const field = fields.find((item) => item.id === filter.field);
    const operator = field?.operators.find((item) => item.id === filter.operator);
    return `${field?.label ?? filter.field} ${operator?.label ?? filter.operator}${operator?.requiresValue === false ? "" : ` ${filter.value || messages.missingSummaryValue}`}`;
  };

  const editor = (surface: "inline" | "drawer") => (
    <div
      className="mrg-filter-builder__editor"
      data-surface={surface}
      data-slot={`filter-builder-${surface}-editor`}
    >
      {filters.length === 0 ? <p className="mrg-filter-builder__empty">{messages.empty}</p> : null}
      {filters.map((filter, index) => {
        const field = fields.find((item) => item.id === filter.field) ?? firstField;
        const operator = field.operators.find((item) => item.id === filter.operator);
        const invalid = operator?.requiresValue !== false && filter.value.trim() === "";
        const errorId = `${reactId}-${surface}-${encodeURIComponent(filter.id)}-error`;
        return (
          <fieldset
            key={filter.id}
            className="mrg-filter-builder__filter"
            data-invalid={invalid || undefined}
          >
            <legend>{messages.filterLabel(index + 1)}</legend>
            <label>
              <span>{messages.field}</span>
              <select
                value={filter.field}
                disabled={disabled || readOnly}
                onChange={(event) => {
                  const nextField = fields.find((item) => item.id === event.currentTarget.value)!;
                  update(filter.id, {
                    field: nextField.id,
                    operator: nextField.operators[0]!.id,
                    value: "",
                  });
                }}
              >
                {fields.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{messages.operator}</span>
              <select
                value={filter.operator}
                disabled={disabled || readOnly}
                onChange={(event) => update(filter.id, { operator: event.currentTarget.value })}
              >
                {field.operators.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {operator?.requiresValue === false ? null : (
              <label>
                <span>{messages.value}</span>
                <input
                  value={filter.value}
                  disabled={disabled}
                  readOnly={readOnly}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? errorId : undefined}
                  onChange={(event) => update(filter.id, { value: event.currentTarget.value })}
                />
              </label>
            )}
            {!readOnly ? (
              <button type="button" disabled={disabled} onClick={() => remove(filter.id)}>
                {messages.remove}
              </button>
            ) : null}
            {invalid ? (
              <p id={errorId} className="mrg-filter-builder__filter-error">
                {messages.valueRecovery}
              </p>
            ) : null}
          </fieldset>
        );
      })}
      {!readOnly ? (
        <div className="mrg-filter-builder__actions">
          <button type="button" disabled={disabled} onClick={add}>
            {messages.add}
          </button>
          <button
            type="button"
            disabled={disabled || filters.length === 0}
            onClick={() => commit([], "clear")}
          >
            {messages.clear}
          </button>
        </div>
      ) : null}
    </div>
  );

  const handleReset = (event: FormEvent<HTMLDivElement>) => {
    onReset?.(event);
    if (!event.defaultPrevented && controlledFilters === undefined) {
      setInternalFilters(defaultFilters);
      onFiltersChange?.(defaultFilters, { reason: "reset" });
      if (urlAdapter !== false)
        urlAdapter.write(serializeFilters(defaultFilters), { reason: "reset" });
    }
  };

  return (
    <div
      {...props}
      className={classes("mrg-filter-builder", className)}
      data-slot="filter-builder"
      role="region"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onReset={handleReset}
    >
      <div className="mrg-filter-builder__heading">
        <strong>{label}</strong>
        {mobileDrawer ? (
          <button
            ref={drawerTrigger}
            type="button"
            className="mrg-filter-builder__drawer-trigger"
            onClick={() => setDrawerOpen(true)}
          >
            {messages.editCount(messages.mobileOpen, filters.length)}
          </button>
        ) : null}
      </div>
      {savedFilters !== false ? (
        <label className="mrg-filter-builder__saved">
          <span>{messages.savedFilters}</span>
          <select
            defaultValue=""
            disabled={disabled || readOnly || savedFilters.length === 0}
            onChange={(event) => {
              const saved = savedFilters.find((item) => item.id === event.currentTarget.value);
              if (saved) commit(saved.filters, "saved");
              event.currentTarget.value = "";
            }}
          >
            <option value="">{messages.applySaved}</option>
            {savedFilters.map((saved) => (
              <option key={saved.id} value={saved.id}>
                {saved.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="mrg-filter-builder__inline">{editor("inline")}</div>
      {mobileDrawer ? (
        <dialog
          ref={drawer}
          className="mrg-filter-builder__drawer"
          aria-label={messages.drawerLabel(label)}
          onCancel={() => setDrawerOpen(false)}
          onClose={() => {
            setDrawerOpen(false);
            drawerTrigger.current?.focus();
          }}
        >
          <div className="mrg-filter-builder__drawer-heading">
            <strong>{label}</strong>
            <button type="button" onClick={() => setDrawerOpen(false)}>
              {messages.mobileClose}
            </button>
          </div>
          {editor("drawer")}
        </dialog>
      ) : null}
      {name ? (
        <input type="hidden" name={name} value={serializeFilters(filters)} disabled={disabled} />
      ) : null}
      {showActiveSummary ? (
        <output
          className="mrg-filter-builder__summary"
          data-slot="filter-builder-summary"
          aria-live="polite"
        >
          <strong>{messages.activeSummary}</strong>
          {filters.length === 0 ? (
            <span>{messages.empty}</span>
          ) : (
            <ul>
              {filters.map((filter) => (
                <li key={filter.id}>{summaryFor(filter)}</li>
              ))}
            </ul>
          )}
        </output>
      ) : null}
    </div>
  );
}
