"use client";

import "./autocomplete.css";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
} from "react";

export interface AutocompleteOption {
  /** Stable unique option identity used by active-descendant relationships. */
  readonly id: string;
  /** Plain visible option label committed to the input when selected. */
  readonly label: string;
  /** Optional supporting option copy included in filtering and visible results. */
  readonly description?: string;
  /** Keeps the option visible while removing it from pointer and keyboard selection. */
  readonly disabled?: boolean;
  /** Additional plain search terms included in the built-in case-insensitive filter. */
  readonly keywords?: readonly string[];
}

export interface AutocompleteProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "defaultValue" | "onChange" | "value"
> {
  /** Persistent visible label and accessible name for the combobox input. */
  readonly label: string;
  /** Ordered options searched across labels, descriptions, and keywords. */
  readonly options: readonly AutocompleteOption[];
  /** Controlled input text; pair with onValueChange. */
  readonly value?: string;
  /** Initial input text for uncontrolled use and native form reset. */
  readonly defaultValue?: string;
  /** Reports every user input edit and selected option label. */
  readonly onValueChange?: (value: string) => void;
  /** Reports the complete option selected by keyboard or pointer. */
  readonly onOptionSelect?: (option: AutocompleteOption) => void;
  /** Optional visible guidance associated with the input. */
  readonly description?: string;
  /** Optional visible validation message rendered as an alert. */
  readonly errorMessage?: string;
  /** Applies invalid styling and aria-invalid to the input. */
  readonly invalid?: boolean;
  /** Localized option shown when the current search has no results. */
  readonly emptyMessage?: string;
  /** Marks the input busy and substitutes loadingMessage in an empty result list. */
  readonly loading?: boolean;
  /** Localized status text used while suggestions are loading. */
  readonly loadingMessage?: string;
  /** Recoverable asynchronous error text; omitting it removes the retry alert. */
  readonly loadError?: string;
  /** Retries suggestion loading and is required whenever loadError is present. */
  readonly onRetry?: () => void;
  /** Adds the load-more action while the suggestion popover is open. */
  readonly hasMore?: boolean;
  /** Requests another suggestion page from the optional load-more action. */
  readonly onLoadMore?: () => void;
  /** Adds a polite match count and active position; false removes its UI and description id. */
  readonly showMatchContext?: boolean;
}

function assertText(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`Mergora Autocomplete ${name} must not be empty.`);
}

function optionText(option: AutocompleteOption): string {
  return [option.label, option.description, ...(option.keywords ?? [])]
    .filter((part): part is string => part !== undefined)
    .join(" ")
    .toLocaleLowerCase();
}

function nextEnabled(options: readonly AutocompleteOption[], start: number, delta: 1 | -1): number {
  if (options.length === 0) return -1;
  const origin = start < 0 && delta === -1 ? 0 : start;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const candidate = (origin + offset * delta + options.length) % options.length;
    if (options[candidate]?.disabled !== true) return candidate;
  }
  return -1;
}

export const Autocomplete = forwardRef<HTMLInputElement, AutocompleteProps>(function Autocomplete(
  {
    className,
    defaultValue = "",
    description,
    disabled = false,
    emptyMessage = "No matching options.",
    errorMessage,
    hasMore = false,
    id,
    invalid = false,
    label,
    loadError,
    loading = false,
    loadingMessage = "Loading suggestions…",
    onBlur,
    onFocus,
    onKeyDown,
    onLoadMore,
    onOptionSelect,
    onRetry,
    onValueChange,
    options,
    readOnly = false,
    required = false,
    showMatchContext = false,
    value,
    ...inputProps
  },
  forwardedRef,
): ReactElement {
  assertText(label, "label");
  assertText(emptyMessage, "empty message");
  assertText(loadingMessage, "loading message");
  if (hasMore && onLoadMore === undefined) {
    throw new TypeError("Mergora Autocomplete hasMore requires onLoadMore.");
  }
  if (loadError !== undefined && onRetry === undefined) {
    throw new TypeError("Mergora Autocomplete loadError requires onRetry.");
  }
  const ids = new Set<string>();
  for (const option of options) {
    assertText(option.id, "option id");
    assertText(option.label, "option label");
    if (ids.has(option.id))
      throw new TypeError(`Mergora Autocomplete option id ${option.id} is duplicated.`);
    ids.add(option.id);
  }
  const generatedId = `mrg-autocomplete-${useId().replaceAll(":", "")}`;
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;
  const descriptionId = description === undefined ? undefined : `${inputId}-description`;
  const errorId = errorMessage === undefined ? undefined : `${inputId}-error`;
  const contextId = `${inputId}-match-context`;
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const currentValue = controlled ? value : internalValue;
  const normalizedQuery = currentValue.trim().toLocaleLowerCase();
  const matches = useMemo(
    () =>
      normalizedQuery.length === 0
        ? options
        : options.filter((option) => optionText(option).includes(normalizedQuery)),
    [normalizedQuery, options],
  );
  const open = focused && !disabled && !readOnly;

  useEffect(() => {
    if (activeIndex >= matches.length || matches[activeIndex]?.disabled === true)
      setActiveIndex(-1);
  }, [activeIndex, matches]);

  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    if (form === null || form === undefined || controlled) return;
    const restore = () => {
      setInternalValue(defaultValue);
      setActiveIndex(-1);
    };
    form.addEventListener("reset", restore);
    return () => form.removeEventListener("reset", restore);
  }, [controlled, defaultValue]);

  const setInputRef = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef !== null) forwardedRef.current = node;
  };
  const commitValue = (next: string) => {
    if (!controlled) setInternalValue(next);
    onValueChange?.(next);
  };
  const choose = (option: AutocompleteOption) => {
    if (disabled || readOnly || option.disabled === true) return;
    commitValue(option.label);
    onOptionSelect?.(option);
    setActiveIndex(-1);
    setFocused(false);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled || readOnly) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => nextEnabled(matches, current, direction));
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(nextEnabled(matches, -1, 1));
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(nextEnabled(matches, 0, -1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const option = matches[activeIndex];
      if (option !== undefined) choose(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFocused(false);
      setActiveIndex(-1);
    }
  };
  const describedBy = [descriptionId, errorId, showMatchContext ? contextId : undefined]
    .filter(Boolean)
    .join(" ");
  const activeOption = activeIndex < 0 ? undefined : matches[activeIndex];
  const context =
    activeOption === undefined
      ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}.`
      : `${activeIndex + 1} of ${matches.length}: ${activeOption.label}`;

  return (
    <div
      className={["mrg-autocomplete", className].filter(Boolean).join(" ")}
      data-disabled={disabled || undefined}
      data-invalid={invalid || undefined}
      data-slot="autocomplete"
    >
      <label className="mrg-autocomplete__label" htmlFor={inputId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {description === undefined ? null : (
        <span className="mrg-autocomplete__description" id={descriptionId}>
          {description}
        </span>
      )}
      <input
        {...inputProps}
        aria-activedescendant={
          activeOption === undefined ? undefined : `${inputId}-option-${activeOption.id}`
        }
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-describedby={describedBy || undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        aria-busy={loading || undefined}
        autoComplete="off"
        className="mrg-autocomplete__input"
        disabled={disabled}
        id={inputId}
        onBlur={(event: FocusEvent<HTMLInputElement>) => {
          onBlur?.(event);
          const control = event.currentTarget.parentElement;
          requestAnimationFrame(() => {
            if (!control?.contains(document.activeElement)) setFocused(false);
          });
        }}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          commitValue(event.currentTarget.value);
          setActiveIndex(-1);
        }}
        onFocus={(event) => {
          onFocus?.(event);
          setFocused(true);
        }}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        ref={setInputRef}
        required={required}
        role="combobox"
        value={currentValue}
      />
      {open ? (
        <ul className="mrg-autocomplete__listbox" id={listboxId} role="listbox">
          {matches.length === 0 ? (
            <li
              aria-disabled="true"
              aria-selected="false"
              className="mrg-autocomplete__empty mrg-autocomplete__option"
              data-disabled="true"
              role="option"
            >
              {loading ? loadingMessage : emptyMessage}
            </li>
          ) : (
            matches.map((option, index) => (
              <li
                aria-disabled={option.disabled || undefined}
                aria-selected={index === activeIndex}
                className="mrg-autocomplete__option"
                data-active={index === activeIndex || undefined}
                data-disabled={option.disabled || undefined}
                id={`${inputId}-option-${option.id}`}
                key={option.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                role="option"
              >
                <span>{option.label}</span>
                {option.description === undefined ? null : <small>{option.description}</small>}
              </li>
            ))
          )}
        </ul>
      ) : null}
      {open && hasMore ? (
        <div className="mrg-autocomplete__async">
          <button disabled={loading} onClick={onLoadMore} type="button">
            {loading ? loadingMessage : "Load more suggestions"}
          </button>
        </div>
      ) : null}
      {showMatchContext ? (
        <output
          aria-live="polite"
          className="mrg-autocomplete__context"
          data-slot="autocomplete-match-context"
          id={contextId}
        >
          {context}
        </output>
      ) : null}
      {errorMessage === undefined ? null : (
        <span className="mrg-autocomplete__error" id={errorId} role="alert">
          {errorMessage}
        </span>
      )}
      {loadError === undefined ? null : (
        <div className="mrg-autocomplete__load-error" role="alert">
          <span>{loadError}</span>
          <button onClick={onRetry} type="button">
            Retry suggestions
          </button>
        </div>
      )}
    </div>
  );
});
