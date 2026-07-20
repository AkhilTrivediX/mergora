"use client";

import "./transfer-list.css";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FieldsetHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
} from "react";

export interface TransferListItem {
  /** Stable canonical value used by transfer state and form serialization. */
  readonly value: string;
  /** Plain visible item label used by both listboxes and optional filtering. */
  readonly label: string;
  /** Optional supporting copy included in optional filtering and option labels. */
  readonly description?: string;
  /** Keeps the item visible while removing it from transfer operations. */
  readonly disabled?: boolean;
}

export interface TransferListProps extends Omit<
  FieldsetHTMLAttributes<HTMLFieldSetElement>,
  "defaultValue" | "onChange"
> {
  /** Persistent fieldset legend and accessible name for the transfer control. */
  readonly label: string;
  /** Complete ordered item inventory shared by source and destination lists. */
  readonly items: readonly TransferListItem[];
  /** Controlled ordered values currently placed in the destination list. */
  readonly value?: readonly string[];
  /** Initial destination values for uncontrolled use and native form reset. */
  readonly defaultValue?: readonly string[];
  /** Reports the complete destination values after an add or remove transfer. */
  readonly onValueChange?: (value: readonly string[], reason: "add" | "remove") => void;
  /** Localized accessible label for the available-items listbox. */
  readonly sourceLabel?: string;
  /** Localized accessible label for the included-items listbox. */
  readonly destinationLabel?: string;
  /** Native form field name used by one hidden input per destination value. */
  readonly name?: string;
  /** Native form owner id forwarded to every hidden destination input. */
  readonly form?: string;
  /** Optional visible guidance associated with both transfer listboxes. */
  readonly description?: string;
  /** Optional visible validation message rendered as an alert. */
  readonly errorMessage?: string;
  /** Applies invalid styling and aria-invalid to both listboxes. */
  readonly invalid?: boolean;
  /** Requires at least one destination value through native validation semantics. */
  readonly required?: boolean;
  /** Disables selection, transfers, filters, and hidden form controls. */
  readonly disabled?: boolean;
  /** Preserves list navigation while blocking filters and transfer changes. */
  readonly readOnly?: boolean;
  /** Adds independent source and destination search inputs; false removes both filters. */
  readonly filterable?: boolean;
  /** Adds count and last-transfer context; false removes its status output and description id. */
  readonly showTransferSummary?: boolean;
}

function assertText(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`Mergora TransferList ${name} must not be empty.`);
}

function normalize(
  values: readonly string[],
  items: readonly TransferListItem[],
): readonly string[] {
  const known = new Set(items.map((item) => item.value));
  const seen = new Set<string>();
  return values.map((value) => {
    if (!known.has(value))
      throw new RangeError(`Mergora TransferList value ${value} does not exist.`);
    if (seen.has(value)) throw new TypeError(`Mergora TransferList value ${value} is duplicated.`);
    seen.add(value);
    return value;
  });
}

function selectedValues(event: ChangeEvent<HTMLSelectElement>): readonly string[] {
  return Array.from(event.currentTarget.selectedOptions, (option) => option.value);
}

export const TransferList = forwardRef<HTMLFieldSetElement, TransferListProps>(
  function TransferList(
    {
      className,
      defaultValue = [],
      description,
      destinationLabel = "Included",
      disabled = false,
      errorMessage,
      filterable = false,
      form,
      id,
      invalid = false,
      items,
      label,
      name,
      onValueChange,
      readOnly = false,
      required = false,
      showTransferSummary = false,
      sourceLabel = "Available",
      value,
      ...props
    },
    ref,
  ): ReactElement {
    assertText(label, "label");
    assertText(sourceLabel, "source label");
    assertText(destinationLabel, "destination label");
    if (name !== undefined) assertText(name, "name");
    const itemValues = new Set<string>();
    for (const item of items) {
      assertText(item.value, "item value");
      assertText(item.label, "item label");
      if (itemValues.has(item.value))
        throw new TypeError(`Mergora TransferList item value ${item.value} is duplicated.`);
      itemValues.add(item.value);
    }
    const normalizedDefault = normalize(defaultValue, items);
    const normalizedValue = value === undefined ? undefined : normalize(value, items);
    const generatedId = `mrg-transfer-list-${useId().replaceAll(":", "")}`;
    const rootId = id ?? generatedId;
    const descriptionId = description === undefined ? undefined : `${rootId}-description`;
    const errorId = errorMessage === undefined ? undefined : `${rootId}-error`;
    const summaryId = `${rootId}-summary`;
    const controlled = value !== undefined;
    const [internalValue, setInternalValue] = useState<readonly string[]>(normalizedDefault);
    const currentValue = controlled ? (normalizedValue ?? []) : internalValue;
    const [sourceSelection, setSourceSelection] = useState<readonly string[]>([]);
    const [destinationSelection, setDestinationSelection] = useState<readonly string[]>([]);
    const [sourceFilter, setSourceFilter] = useState("");
    const [destinationFilter, setDestinationFilter] = useState("");
    const [lastTransfer, setLastTransfer] = useState("");
    const rootRef = useRef<HTMLFieldSetElement | null>(null);
    const allSourceItems = items.filter((item) => !currentValue.includes(item.value));
    const allDestinationItems = items.filter((item) => currentValue.includes(item.value));
    const normalizedSourceFilter = sourceFilter.trim().toLocaleLowerCase();
    const normalizedDestinationFilter = destinationFilter.trim().toLocaleLowerCase();
    const sourceItems = allSourceItems.filter((item) =>
      [item.label, item.description]
        .filter((part): part is string => part !== undefined)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSourceFilter),
    );
    const destinationItems = allDestinationItems.filter((item) =>
      [item.label, item.description]
        .filter((part): part is string => part !== undefined)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedDestinationFilter),
    );

    useEffect(() => {
      const explicitForm = form === undefined ? null : document.getElementById(form);
      const associatedForm =
        explicitForm instanceof HTMLFormElement ? explicitForm : rootRef.current?.closest("form");
      if (associatedForm === null || associatedForm === undefined || controlled) return;
      const restore = () => {
        setInternalValue(normalizedDefault);
        setSourceSelection([]);
        setDestinationSelection([]);
        setSourceFilter("");
        setDestinationFilter("");
        setLastTransfer("");
      };
      associatedForm.addEventListener("reset", restore);
      return () => associatedForm.removeEventListener("reset", restore);
    }, [controlled, form, normalizedDefault]);

    const setRootRef = (node: HTMLFieldSetElement | null) => {
      rootRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref !== null) ref.current = node;
    };
    const commit = (
      next: readonly string[],
      reason: "add" | "remove",
      moved: readonly string[],
    ) => {
      if (!controlled) setInternalValue(next);
      onValueChange?.(next, reason);
      if (showTransferSummary) {
        const labels = items.filter((item) => moved.includes(item.value)).map((item) => item.label);
        setLastTransfer(`${reason === "add" ? "Included" : "Removed"} ${labels.join(", ")}.`);
      }
    };
    const add = () => {
      if (disabled || readOnly || sourceSelection.length === 0) return;
      const movable = sourceSelection.filter(
        (selected) => items.find((item) => item.value === selected)?.disabled !== true,
      );
      commit([...currentValue, ...movable], "add", movable);
      setSourceSelection([]);
    };
    const remove = () => {
      if (disabled || readOnly || destinationSelection.length === 0) return;
      const movable = destinationSelection.filter(
        (selected) => items.find((item) => item.value === selected)?.disabled !== true,
      );
      commit(
        currentValue.filter((selected) => !movable.includes(selected)),
        "remove",
        movable,
      );
      setDestinationSelection([]);
    };
    const handleMoveKey = (
      event: KeyboardEvent<HTMLSelectElement>,
      direction: "add" | "remove",
    ) => {
      const expectedKey = direction === "add" ? "ArrowRight" : "ArrowLeft";
      if (!event.altKey || event.key !== expectedKey) return;
      event.preventDefault();
      if (direction === "add") add();
      else remove();
    };
    const describedBy = [descriptionId, errorId, showTransferSummary ? summaryId : undefined]
      .filter(Boolean)
      .join(" ");

    return (
      <fieldset
        {...props}
        aria-describedby={describedBy || undefined}
        aria-invalid={invalid || undefined}
        className={["mrg-transfer-list", className].filter(Boolean).join(" ")}
        data-disabled={disabled || undefined}
        data-invalid={invalid || undefined}
        data-readonly={readOnly || undefined}
        data-slot="transfer-list"
        disabled={disabled}
        id={rootId}
        ref={setRootRef}
      >
        <legend>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </legend>
        {description === undefined ? null : (
          <span className="mrg-transfer-list__description" id={descriptionId}>
            {description}
          </span>
        )}
        <div className="mrg-transfer-list__workbench">
          <div
            aria-label={`${sourceLabel} collection`}
            className="mrg-transfer-list__collection"
            role="group"
          >
            <span className="mrg-transfer-list__collection-heading">
              <strong>{sourceLabel}</strong>
              <span>
                {allSourceItems.length} {allSourceItems.length === 1 ? "item" : "items"}
              </span>
            </span>
            {filterable ? (
              <input
                aria-label={`Filter ${sourceLabel}`}
                onChange={(event) => setSourceFilter(event.currentTarget.value)}
                placeholder={`Filter ${sourceLabel.toLocaleLowerCase()}`}
                type="search"
                value={sourceFilter}
              />
            ) : null}
            <select
              aria-label={sourceLabel}
              multiple
              onChange={(event) => setSourceSelection(selectedValues(event))}
              onKeyDown={(event) => handleMoveKey(event, "add")}
              size={Math.min(8, Math.max(4, sourceItems.length))}
              value={sourceSelection}
            >
              {sourceItems.map((item) => (
                <option disabled={item.disabled} key={item.value} value={item.value}>
                  {item.label}
                  {item.description === undefined ? "" : ` — ${item.description}`}
                </option>
              ))}
            </select>
          </div>
          <div className="mrg-transfer-list__actions">
            <button
              aria-label={`Move selected to ${destinationLabel}`}
              disabled={disabled || readOnly || sourceSelection.length === 0}
              onClick={add}
              type="button"
            >
              →
            </button>
            <button
              aria-label={`Move selected to ${sourceLabel}`}
              disabled={disabled || readOnly || destinationSelection.length === 0}
              onClick={remove}
              type="button"
            >
              ←
            </button>
          </div>
          <div
            aria-label={`${destinationLabel} collection`}
            className="mrg-transfer-list__collection"
            role="group"
          >
            <span className="mrg-transfer-list__collection-heading">
              <strong>{destinationLabel}</strong>
              <span>
                {allDestinationItems.length} {allDestinationItems.length === 1 ? "item" : "items"}
              </span>
            </span>
            {filterable ? (
              <input
                aria-label={`Filter ${destinationLabel}`}
                onChange={(event) => setDestinationFilter(event.currentTarget.value)}
                placeholder={`Filter ${destinationLabel.toLocaleLowerCase()}`}
                type="search"
                value={destinationFilter}
              />
            ) : null}
            <select
              aria-label={destinationLabel}
              multiple
              onChange={(event) => setDestinationSelection(selectedValues(event))}
              onKeyDown={(event) => handleMoveKey(event, "remove")}
              size={Math.min(8, Math.max(4, destinationItems.length))}
              value={destinationSelection}
            >
              {destinationItems.map((item) => (
                <option disabled={item.disabled} key={item.value} value={item.value}>
                  {item.label}
                  {item.description === undefined ? "" : ` — ${item.description}`}
                </option>
              ))}
            </select>
          </div>
        </div>
        {name === undefined
          ? null
          : currentValue.map((selected) => (
              <input form={form} key={selected} name={name} type="hidden" value={selected} />
            ))}
        {required && currentValue.length === 0 ? (
          <input
            aria-label={`${label} requires at least one included item`}
            className="mrg-transfer-list__validation-proxy"
            required
            value=""
            onChange={() => undefined}
          />
        ) : null}
        {showTransferSummary ? (
          <output
            aria-live="polite"
            className="mrg-transfer-list__summary"
            data-slot="transfer-list-summary"
            id={summaryId}
          >
            {allSourceItems.length} available · {allDestinationItems.length} included.
            {lastTransfer.length === 0 ? "" : ` ${lastTransfer}`}
          </output>
        ) : null}
        {errorMessage === undefined ? null : (
          <span className="mrg-transfer-list__error" id={errorId} role="alert">
            {errorMessage}
          </span>
        )}
      </fieldset>
    );
  },
);
