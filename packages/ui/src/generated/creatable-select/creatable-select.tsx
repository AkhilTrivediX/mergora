// Generated from registry/source/components/creatable-select/creatable-select.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./creatable-select.css";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
} from "react";

export interface CreatableSelectOption {
  /** Stable canonical value submitted when this option is selected. */
  readonly value: string;
  /** Plain visible label used for search and input display. */
  readonly label: string;
  /** Optional supporting copy rendered under the option label. */
  readonly description?: string;
  /** Keeps the option visible while removing it from selection. */
  readonly disabled?: boolean;
}

export interface CreatableSelectProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "defaultValue" | "name" | "onChange" | "value"
> {
  /** Persistent visible label and accessible name for the combobox input. */
  readonly label: string;
  /** Ordered existing options searched by their visible labels. */
  readonly options: readonly CreatableSelectOption[];
  /** Controlled canonical selected value, or null for no selection. */
  readonly value?: string | null;
  /** Initial canonical selected value for uncontrolled use and form reset. */
  readonly defaultValue?: string | null;
  /** Reports clear, create, and existing-option selection commits. */
  readonly onValueChange?: (value: string | null, reason: "clear" | "create" | "select") => void;
  /** Enables value creation; omitting it removes the create option and creation behavior. */
  readonly onCreate?: (
    value: string,
    context: {
      /** Signal aborted when creation is cancelled, replaced, or unmounted. */
      readonly signal: AbortSignal;
    },
  ) => void | Promise<void>;
  /** Returns localized recovery text for an invalid proposed value, or null to continue. */
  readonly validateCreate?: (value: string) => string | null;
  /** Controlled creation-pending state; omitted lets the component track its own promise. */
  readonly creating?: boolean;
  /** Consumer cancellation hook invoked after the active creation signal is aborted. */
  readonly onCancelCreate?: () => void;
  /** Native form field name used by the hidden canonical-value input. */
  readonly name?: string;
  /** Native form owner id forwarded to the canonical-value input. */
  readonly form?: string;
  /** Optional visible guidance associated with the combobox input. */
  readonly description?: string;
  /** Optional visible validation message rendered as an alert. */
  readonly errorMessage?: string;
  /** Applies invalid styling and aria-invalid to the combobox input. */
  readonly invalid?: boolean;
  /** Localized message shown when search has no existing or creatable result. */
  readonly emptyMessage?: string;
  /** Renders a canonical-value preview; false removes the output and description id. */
  readonly showCanonicalPreview?: boolean;
  /** Formats only the optional preview and never changes the submitted canonical value. */
  readonly formatCanonicalValue?: (value: string) => string;
}

function assertText(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`Mergora CreatableSelect ${name} must not be empty.`);
}

function nextEnabledChoice(
  options: readonly CreatableSelectOption[],
  includesCreate: boolean,
  start: number,
  delta: 1 | -1,
): number {
  const count = options.length + (includesCreate ? 1 : 0);
  if (count === 0) return -1;
  const origin = start < 0 && delta === -1 ? 0 : start;
  for (let offset = 1; offset <= count; offset += 1) {
    const candidate = (origin + offset * delta + count) % count;
    if (candidate === options.length || options[candidate]?.disabled !== true) return candidate;
  }
  return -1;
}

export const CreatableSelect = forwardRef<HTMLInputElement, CreatableSelectProps>(
  function CreatableSelect(
    {
      className,
      defaultValue = null,
      description,
      disabled = false,
      emptyMessage = "No matching options. Create this value instead.",
      errorMessage,
      form,
      formatCanonicalValue,
      id,
      invalid = false,
      label,
      name,
      onCancelCreate,
      onCreate,
      onKeyDown,
      onValueChange,
      options,
      placeholder = "Choose or create a value",
      readOnly = false,
      required = false,
      showCanonicalPreview = false,
      creating,
      validateCreate,
      value,
      ...inputProps
    },
    forwardedRef,
  ): ReactElement {
    assertText(label, "label");
    assertText(emptyMessage, "empty message");
    if (name !== undefined) assertText(name, "name");
    const values = new Set<string>();
    for (const option of options) {
      assertText(option.value, "option value");
      assertText(option.label, "option label");
      if (values.has(option.value))
        throw new TypeError(`Mergora CreatableSelect value ${option.value} is duplicated.`);
      values.add(option.value);
    }
    const generatedId = `mrg-creatable-select-${useId().replaceAll(":", "")}`;
    const inputId = id ?? generatedId;
    const listboxId = `${inputId}-listbox`;
    const descriptionId = description === undefined ? undefined : `${inputId}-description`;
    const errorId = errorMessage === undefined ? undefined : `${inputId}-error`;
    const previewId = `${inputId}-canonical-preview`;
    const controlled = value !== undefined;
    const [internalValue, setInternalValue] = useState<string | null>(defaultValue);
    const currentValue = controlled ? value : internalValue;
    const selectedOption = options.find((option) => option.value === currentValue);
    const initialLabel = selectedOption?.label ?? currentValue ?? "";
    const [query, setQuery] = useState(initialLabel);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [internalCreating, setInternalCreating] = useState(false);
    const [creationError, setCreationError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const createController = useRef<AbortController | null>(null);
    const createPending = creating ?? internalCreating;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matches = useMemo(
      () => options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery)),
      [normalizedQuery, options],
    );
    const exactMatch = options.some(
      (option) => option.label.toLocaleLowerCase() === normalizedQuery,
    );
    const canCreate =
      normalizedQuery.length > 0 && !exactMatch && onCreate !== undefined && !createPending;
    const canonical =
      showCanonicalPreview && query.trim().length > 0
        ? (formatCanonicalValue?.(query.trim()) ?? query.trim())
        : null;

    useEffect(() => {
      if (controlled)
        setQuery(options.find((option) => option.value === value)?.label ?? value ?? "");
    }, [controlled, options, value]);

    useEffect(() => {
      const input = inputRef.current;
      const associatedForm = input?.form;
      if (associatedForm === null || associatedForm === undefined || controlled) return;
      const restore = () => {
        setInternalValue(defaultValue);
        const next =
          options.find((option) => option.value === defaultValue)?.label ?? defaultValue ?? "";
        setQuery(next);
        setOpen(false);
      };
      associatedForm.addEventListener("reset", restore);
      return () => associatedForm.removeEventListener("reset", restore);
    }, [controlled, defaultValue, options]);

    useEffect(() => () => createController.current?.abort(), []);

    const setInputRef = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef !== null) forwardedRef.current = node;
    };
    const commit = (next: string | null, reason: "clear" | "create" | "select") => {
      if (!controlled) setInternalValue(next);
      onValueChange?.(next, reason);
    };
    const selectOption = (option: CreatableSelectOption) => {
      if (disabled || readOnly || option.disabled === true) return;
      setQuery(option.label);
      commit(option.value, "select");
      setOpen(false);
      setActiveIndex(-1);
    };
    const finishCreation = (next: string, controller: AbortController) => {
      if (controller.signal.aborted) return;
      commit(next, "create");
      setQuery(next);
      setOpen(false);
      setActiveIndex(-1);
      setCreationError(null);
    };
    const failCreation = (error: unknown, controller: AbortController) => {
      if (controller.signal.aborted) return;
      setCreationError(error instanceof Error ? error.message : "Creation failed. Try again.");
    };
    const create = () => {
      const next = query.trim();
      if (!canCreate || disabled || readOnly || createPending || onCreate === undefined) return;
      const validationMessage = validateCreate?.(next) ?? null;
      if (validationMessage !== null) {
        assertText(validationMessage, "creation validation message");
        setCreationError(validationMessage);
        return;
      }
      const controller = new AbortController();
      createController.current?.abort();
      createController.current = controller;
      if (creating === undefined) setInternalCreating(true);
      setCreationError(null);
      try {
        const result = onCreate(next, { signal: controller.signal });
        void Promise.resolve(result)
          .then(() => finishCreation(next, controller))
          .catch((error: unknown) => failCreation(error, controller))
          .finally(() => {
            if (createController.current === controller) createController.current = null;
            if (creating === undefined) setInternalCreating(false);
          });
      } catch (error) {
        failCreation(error, controller);
        createController.current = null;
        if (creating === undefined) setInternalCreating(false);
      }
    };
    const cancelCreation = () => {
      createController.current?.abort();
      createController.current = null;
      if (creating === undefined) setInternalCreating(false);
      setCreationError("Creation cancelled.");
      onCancelCreate?.();
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || disabled || readOnly || createPending) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        setActiveIndex((index) => nextEnabledChoice(matches, canCreate, index, 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => nextEnabledChoice(matches, canCreate, index, -1));
      } else if (event.key === "Home" && open) {
        event.preventDefault();
        setActiveIndex(nextEnabledChoice(matches, canCreate, -1, 1));
      } else if (event.key === "End" && open) {
        event.preventDefault();
        setActiveIndex(nextEnabledChoice(matches, canCreate, 0, -1));
      } else if (event.key === "Enter" && open && activeIndex >= 0) {
        event.preventDefault();
        const option = matches[activeIndex];
        if (option !== undefined) selectOption(option);
        else create();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    const activeId = activeIndex < 0 ? undefined : `${inputId}-choice-${activeIndex}`;
    const describedBy = [descriptionId, errorId, canonical === null ? undefined : previewId]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        className={["mrg-creatable-select", className].filter(Boolean).join(" ")}
        data-disabled={disabled || undefined}
        data-invalid={invalid || undefined}
        data-slot="creatable-select"
      >
        <label htmlFor={inputId}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
        {description === undefined ? null : (
          <span className="mrg-creatable-select__description" id={descriptionId}>
            {description}
          </span>
        )}
        <div className="mrg-creatable-select__control">
          <input
            {...inputProps}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-describedby={describedBy || undefined}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-invalid={invalid || undefined}
            aria-busy={createPending || undefined}
            autoComplete="off"
            disabled={disabled}
            form={form}
            id={inputId}
            onBlur={(event) => {
              const control = event.currentTarget.parentElement;
              requestAnimationFrame(() => {
                if (!control?.contains(document.activeElement)) setOpen(false);
              });
            }}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              if (event.currentTarget.value.length === 0) commit(null, "clear");
              setOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            readOnly={readOnly || createPending}
            ref={setInputRef}
            required={required && currentValue === null}
            role="combobox"
            value={query}
          />
          {currentValue === null || readOnly || disabled ? null : (
            <button
              aria-label={`Clear ${label}`}
              onClick={() => {
                setQuery("");
                commit(null, "clear");
                inputRef.current?.focus();
              }}
              type="button"
            >
              ×
            </button>
          )}
        </div>
        {name === undefined || currentValue === null ? null : (
          <input form={form} name={name} type="hidden" value={currentValue} />
        )}
        {open ? (
          <ul id={listboxId} role="listbox">
            {matches.length === 0 && !canCreate ? (
              <li
                aria-disabled="true"
                aria-selected="false"
                className="mrg-creatable-select__empty"
                role="option"
              >
                {emptyMessage}
              </li>
            ) : null}
            {matches.map((option, index) => (
              <li
                aria-disabled={option.disabled || undefined}
                aria-selected={option.value === currentValue}
                data-active={index === activeIndex || undefined}
                data-disabled={option.disabled || undefined}
                id={`${inputId}-choice-${index}`}
                key={option.value}
                onClick={() => selectOption(option)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
              >
                <span>{option.label}</span>
                {option.description === undefined ? null : <small>{option.description}</small>}
              </li>
            ))}
            {canCreate ? (
              <li
                aria-selected="false"
                data-active={activeIndex === matches.length || undefined}
                id={`${inputId}-choice-${matches.length}`}
                onClick={create}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
              >
                Create “{query.trim()}”
              </li>
            ) : null}
          </ul>
        ) : null}
        {canonical === null ? null : (
          <output
            className="mrg-creatable-select__preview"
            data-slot="creatable-select-canonical-preview"
            id={previewId}
          >
            Canonical value: <strong>{canonical}</strong>
          </output>
        )}
        {createPending ? (
          <div aria-live="polite" className="mrg-creatable-select__lifecycle" role="status">
            <span>Creating {query.trim()}...</span>
            <button onClick={cancelCreation} type="button">
              Cancel creation
            </button>
          </div>
        ) : null}
        {creationError === null ? null : (
          <span className="mrg-creatable-select__creation-error" role="alert">
            {creationError}
          </span>
        )}
        {errorMessage === undefined ? null : (
          <span className="mrg-creatable-select__error" id={errorId} role="alert">
            {errorMessage}
          </span>
        )}
      </div>
    );
  },
);
