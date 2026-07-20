// Generated from registry/source/components/multi-select/multi-select.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./multi-select.css";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
} from "react";

export interface MultiSelectOption {
  /** Stable canonical value submitted when this option is selected. */
  readonly value: string;
  /** Plain visible label used for filtering and selected tokens. */
  readonly label: string;
  /** Optional supporting copy included in filtering and option rendering. */
  readonly description?: string;
  /** Keeps the option visible while removing it from selection. */
  readonly disabled?: boolean;
  /** Optional plain group context included in built-in filtering. */
  readonly group?: string;
}

export interface MultiSelectProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> {
  /** Persistent visible label for the filter input and selected-token list. */
  readonly label: string;
  /** Ordered options searched across labels, descriptions, and group context. */
  readonly options: readonly MultiSelectOption[];
  /** Controlled ordered canonical selected values. */
  readonly value?: readonly string[];
  /** Initial selected values for uncontrolled use and native form reset. */
  readonly defaultValue?: readonly string[];
  /** Reports the complete ordered selection after add or remove operations. */
  readonly onValueChange?: (value: readonly string[]) => void;
  /** Native form field name used by one hidden input per selected value. */
  readonly name?: string;
  /** Native form owner id forwarded to every hidden selection input. */
  readonly form?: string;
  /** Optional visible guidance associated with the filter input. */
  readonly description?: string;
  /** Optional visible validation message rendered as an alert. */
  readonly errorMessage?: string;
  /** Applies invalid styling and aria-invalid to the filter input. */
  readonly invalid?: boolean;
  /** Requires at least one selection through native validation semantics. */
  readonly required?: boolean;
  /** Disables filtering, selection, removal, and hidden form controls. */
  readonly disabled?: boolean;
  /** Preserves selection display while blocking filtering and changes. */
  readonly readOnly?: boolean;
  /** Localized filter-input placeholder. */
  readonly placeholder?: string;
  /** Localized result shown when the current filter has no matches. */
  readonly emptyMessage?: string;
  /** Maximum selected-value count; omitted leaves the count unbounded. */
  readonly maximum?: number;
  /** Limits visible selected tokens and adds an overflow count for the remainder. */
  readonly maximumVisibleTokens?: number;
  /** Marks the filter input busy and substitutes loadingMessage in empty results. */
  readonly loading?: boolean;
  /** Localized text shown while options are loading. */
  readonly loadingMessage?: string;
  /** Recoverable asynchronous error text; omitting it removes the retry alert. */
  readonly loadError?: string;
  /** Retries option loading and is required whenever loadError is present. */
  readonly onRetry?: () => void;
  /** Adds the load-more action while the option popover is open. */
  readonly hasMore?: boolean;
  /** Requests another option page from the optional load-more action. */
  readonly onLoadMore?: () => void;
  /** Adds a polite selection summary; false removes its output and description id. */
  readonly showSelectionSummary?: boolean;
}

function assertText(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`Mergora MultiSelect ${name} must not be empty.`);
}

function normalize(
  values: readonly string[],
  options: readonly MultiSelectOption[],
): readonly string[] {
  const known = new Set(options.map((option) => option.value));
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!known.has(value))
      throw new RangeError(`Mergora MultiSelect value ${value} does not exist.`);
    if (seen.has(value)) throw new TypeError(`Mergora MultiSelect value ${value} is duplicated.`);
    seen.add(value);
    output.push(value);
  }
  return output;
}

function nextEnabledIndex(
  options: readonly MultiSelectOption[],
  selected: readonly string[],
  maximum: number | undefined,
  start: number,
  delta: 1 | -1,
): number {
  if (options.length === 0) return -1;
  const origin = start < 0 && delta === -1 ? 0 : start;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const candidate = (origin + offset * delta + options.length) % options.length;
    const option = options[candidate];
    if (
      option !== undefined &&
      option.disabled !== true &&
      (selected.includes(option.value) || maximum === undefined || selected.length < maximum)
    )
      return candidate;
  }
  return -1;
}

export const MultiSelect = forwardRef<HTMLDivElement, MultiSelectProps>(function MultiSelect(
  {
    className,
    defaultValue = [],
    description,
    disabled = false,
    emptyMessage = "No matching options.",
    errorMessage,
    form,
    hasMore = false,
    id,
    invalid = false,
    label,
    loadError,
    loading = false,
    loadingMessage = "Loading options...",
    maximum,
    maximumVisibleTokens,
    name,
    onLoadMore,
    onRetry,
    onValueChange,
    options,
    placeholder = "Filter options",
    readOnly = false,
    required = false,
    showSelectionSummary = false,
    value,
    ...props
  },
  ref,
): ReactElement {
  assertText(label, "label");
  assertText(emptyMessage, "empty message");
  assertText(loadingMessage, "loading message");
  if (maximum !== undefined && (!Number.isInteger(maximum) || maximum < 1 || maximum > 256)) {
    throw new RangeError("Mergora MultiSelect maximum must be an integer from 1 to 256.");
  }
  if (
    maximumVisibleTokens !== undefined &&
    (!Number.isInteger(maximumVisibleTokens) ||
      maximumVisibleTokens < 1 ||
      maximumVisibleTokens > 64)
  ) {
    throw new RangeError(
      "Mergora MultiSelect maximumVisibleTokens must be an integer from 1 to 64.",
    );
  }
  if (hasMore && onLoadMore === undefined) {
    throw new TypeError("Mergora MultiSelect hasMore requires onLoadMore.");
  }
  if (loadError !== undefined && onRetry === undefined) {
    throw new TypeError("Mergora MultiSelect loadError requires onRetry.");
  }
  if (name !== undefined) assertText(name, "name");
  const optionValues = new Set<string>();
  for (const option of options) {
    assertText(option.value, "option value");
    assertText(option.label, "option label");
    if (optionValues.has(option.value))
      throw new TypeError(`Mergora MultiSelect option value ${option.value} is duplicated.`);
    optionValues.add(option.value);
  }
  const normalizedDefault = normalize(defaultValue, options);
  const normalizedValue = value === undefined ? undefined : normalize(value, options);
  if (maximum !== undefined && (normalizedValue ?? normalizedDefault).length > maximum) {
    throw new RangeError("Mergora MultiSelect value exceeds maximum.");
  }
  const generatedId = `mrg-multi-select-${useId().replaceAll(":", "")}`;
  const rootId = id ?? generatedId;
  const inputId = `${rootId}-input`;
  const listboxId = `${rootId}-listbox`;
  const descriptionId = description === undefined ? undefined : `${rootId}-description`;
  const errorId = errorMessage === undefined ? undefined : `${rootId}-error`;
  const summaryId = `${rootId}-summary`;
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<readonly string[]>(normalizedDefault);
  const currentValue = controlled ? (normalizedValue ?? []) : internalValue;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return normalizedQuery.length === 0
      ? options
      : options.filter((option) =>
          [option.label, option.description, option.group]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        );
  }, [options, query]);

  useEffect(() => {
    const active = matches[activeIndex];
    if (
      activeIndex >= matches.length ||
      active?.disabled === true ||
      (active !== undefined &&
        !currentValue.includes(active.value) &&
        maximum !== undefined &&
        currentValue.length >= maximum)
    )
      setActiveIndex(-1);
  }, [activeIndex, currentValue, matches, maximum]);

  useEffect(() => {
    const explicitForm = form === undefined ? null : document.getElementById(form);
    const associatedForm =
      explicitForm instanceof HTMLFormElement ? explicitForm : rootRef.current?.closest("form");
    if (associatedForm === null || associatedForm === undefined || controlled) return;
    const restore = () => {
      setInternalValue(normalizedDefault);
      setQuery("");
      setOpen(false);
    };
    associatedForm.addEventListener("reset", restore);
    return () => associatedForm.removeEventListener("reset", restore);
  }, [controlled, form, normalizedDefault]);

  const setRootRef = (node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref !== null) ref.current = node;
  };
  const commit = (next: readonly string[]) => {
    if (!controlled) setInternalValue(next);
    onValueChange?.(next);
  };
  const toggle = (option: MultiSelectOption) => {
    if (disabled || readOnly || option.disabled === true) return;
    if (
      !currentValue.includes(option.value) &&
      maximum !== undefined &&
      currentValue.length >= maximum
    )
      return;
    const next = currentValue.includes(option.value)
      ? currentValue.filter((valueItem) => valueItem !== option.value)
      : [...currentValue, option.value];
    commit(next);
  };
  const remove = (option: MultiSelectOption) => {
    if (disabled || readOnly) return;
    commit(currentValue.filter((valueItem) => valueItem !== option.value));
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => nextEnabledIndex(matches, currentValue, maximum, index, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => nextEnabledIndex(matches, currentValue, maximum, index, -1));
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(nextEnabledIndex(matches, currentValue, maximum, -1, 1));
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(nextEnabledIndex(matches, currentValue, maximum, 0, -1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const option = matches[activeIndex];
      if (option !== undefined) toggle(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };
  const selectedOptions = options.filter((option) => currentValue.includes(option.value));
  const visibleSelectedOptions =
    maximumVisibleTokens === undefined
      ? selectedOptions
      : selectedOptions.slice(0, maximumVisibleTokens);
  const omittedSelectedCount = selectedOptions.length - visibleSelectedOptions.length;
  const active = activeIndex < 0 ? undefined : matches[activeIndex];
  const describedBy = [descriptionId, errorId, showSelectionSummary ? summaryId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      {...props}
      className={["mrg-multi-select", className].filter(Boolean).join(" ")}
      data-disabled={disabled || undefined}
      data-invalid={invalid || undefined}
      data-readonly={readOnly || undefined}
      data-slot="multi-select"
      id={rootId}
      ref={setRootRef}
    >
      <label htmlFor={inputId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {description === undefined ? null : (
        <span className="mrg-multi-select__description" id={descriptionId}>
          {description}
        </span>
      )}
      {selectedOptions.length === 0 ? null : (
        <ul aria-label={`${label} selected values`} className="mrg-multi-select__tokens">
          {visibleSelectedOptions.map((option) => (
            <li key={option.value}>
              <span>{option.label}</span>
              {readOnly || disabled ? null : (
                <button
                  aria-label={`Remove ${option.label}`}
                  onClick={() => remove(option)}
                  type="button"
                >
                  ×
                </button>
              )}
            </li>
          ))}
          {omittedSelectedCount > 0 ? (
            <li className="mrg-multi-select__overflow">{omittedSelectedCount} more selected</li>
          ) : null}
        </ul>
      )}
      <input
        aria-activedescendant={
          active === undefined ? undefined : `${rootId}-option-${active.value}`
        }
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-describedby={describedBy || undefined}
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-busy={loading || undefined}
        autoComplete="off"
        disabled={disabled}
        id={inputId}
        onBlur={(_event) =>
          requestAnimationFrame(() => {
            if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
          })
        }
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required && currentValue.length === 0}
        role="combobox"
        value={query}
      />
      {open && !disabled && !readOnly ? (
        <ul
          aria-multiselectable="true"
          className="mrg-multi-select__listbox"
          id={listboxId}
          role="listbox"
        >
          {matches.length === 0 ? (
            <li
              aria-disabled="true"
              aria-selected="false"
              className="mrg-multi-select__empty"
              role="option"
            >
              {loading ? loadingMessage : emptyMessage}
            </li>
          ) : null}
          {matches.map((option, index) => (
            <li
              aria-disabled={
                option.disabled ||
                (!currentValue.includes(option.value) &&
                  maximum !== undefined &&
                  currentValue.length >= maximum) ||
                undefined
              }
              aria-selected={currentValue.includes(option.value)}
              data-active={index === activeIndex || undefined}
              data-disabled={
                option.disabled ||
                (!currentValue.includes(option.value) &&
                  maximum !== undefined &&
                  currentValue.length >= maximum) ||
                undefined
              }
              id={`${rootId}-option-${option.value}`}
              key={option.value}
              onClick={() => toggle(option)}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
            >
              <span>{option.label}</span>
              <span aria-hidden="true">{currentValue.includes(option.value) ? "✓" : ""}</span>
              {option.description === undefined ? null : <small>{option.description}</small>}
            </li>
          ))}
        </ul>
      ) : null}
      {open && hasMore ? (
        <div className="mrg-multi-select__async">
          <button disabled={loading} onClick={onLoadMore} type="button">
            {loading ? loadingMessage : "Load more options"}
          </button>
        </div>
      ) : null}
      {name === undefined
        ? null
        : currentValue.map((selected) => (
            <input form={form} key={selected} name={name} type="hidden" value={selected} />
          ))}
      {showSelectionSummary ? (
        <output
          aria-live="polite"
          className="mrg-multi-select__summary"
          data-slot="multi-select-selection-summary"
          id={summaryId}
        >
          {currentValue.length} selected
          {maximum === undefined ? "" : ` of ${maximum}`} · {matches.length} available in the
          current filter.
        </output>
      ) : null}
      {errorMessage === undefined ? null : (
        <span className="mrg-multi-select__error" id={errorId} role="alert">
          {errorMessage}
        </span>
      )}
      {loadError === undefined ? null : (
        <div className="mrg-multi-select__load-error" role="alert">
          <span>{loadError}</span>
          <button onClick={onRetry} type="button">
            Retry options
          </button>
        </div>
      )}
    </div>
  );
});
