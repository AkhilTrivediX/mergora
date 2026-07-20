"use client";

import "./mention-field.css";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type TextareaHTMLAttributes,
} from "react";

export interface MentionOption {
  /** Stable unique identity used by suggestion rendering. */
  readonly id: string;
  /** Plain visible suggestion label and recognized-mention summary text. */
  readonly label: string;
  /** Text inserted after the trigger; defaults to a hyphenated label. */
  readonly insertText?: string;
  /** Optional supporting copy included in suggestion filtering. */
  readonly description?: string;
  /** Entity type used to associate this option with a configured trigger. */
  readonly entityType?: string;
  /** Explicit trigger symbol overriding entityType association. */
  readonly trigger?: string;
  /** Keeps the suggestion visible while removing it from selection. */
  readonly disabled?: boolean;
}

export interface MentionTrigger {
  /** Non-empty token that starts a mention query. */
  readonly symbol: string;
  /** Stable entity category used to select matching mention options. */
  readonly entityType: string;
  /** Optional localized category label for the suggestion list. */
  readonly label?: string;
}

export interface MentionQuery {
  /** Exclusive text offset at the current caret position. */
  readonly end: number;
  /** Entity category associated with the matched trigger. */
  readonly entityType: string;
  /** Plain text typed after the trigger and used to filter suggestions. */
  readonly query: string;
  /** Inclusive text offset where the matched trigger begins. */
  readonly start: number;
  /** Exact trigger symbol found before the current query. */
  readonly trigger: string;
}

export interface MentionFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "children" | "defaultValue" | "onChange" | "value"
> {
  /** Persistent visible label and accessible name for the native textarea. */
  readonly label: string;
  /** Ordered mention options searched for the active trigger and query. */
  readonly options: readonly MentionOption[];
  /** Controlled complete textarea value; pair with onValueChange. */
  readonly value?: string;
  /** Initial textarea value for uncontrolled use and native form reset. */
  readonly defaultValue?: string;
  /** Reports direct input and mention insertion with the corresponding reason. */
  readonly onValueChange?: (value: string, reason: "input" | "mention") => void;
  /** Optional visible guidance associated with the textarea. */
  readonly description?: string;
  /** Optional visible validation message rendered as an alert. */
  readonly errorMessage?: string;
  /** Applies invalid styling and aria-invalid to the textarea. */
  readonly invalid?: boolean;
  /** Localized result shown when the active mention query has no suggestions. */
  readonly emptyMessage?: string;
  /** Supported mention triggers; omitting it enables the default people @ trigger. */
  readonly triggers?: readonly MentionTrigger[];
  /** Reports the active trigger query or null when suggestion search closes. */
  readonly onQueryChange?: (query: MentionQuery | null) => void;
  /** Marks the textarea busy and substitutes loadingMessage in empty suggestions. */
  readonly loading?: boolean;
  /** Localized status text used while mention suggestions are loading. */
  readonly loadingMessage?: string;
  /** Recoverable asynchronous error text; omitting it removes the retry alert. */
  readonly loadError?: string;
  /** Retries mention loading and is required whenever loadError is present. */
  readonly onRetry?: () => void;
  /** Adds a recognized-mention summary; false removes its output and description id. */
  readonly showMentionSummary?: boolean;
}

const DEFAULT_TRIGGERS: readonly MentionTrigger[] = [
  { entityType: "person", label: "People", symbol: "@" },
];

function assertText(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`Mergora MentionField ${name} must not be empty.`);
}

function escapeExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function mentionToken(option: MentionOption, trigger: string): string {
  const explicit = option.insertText?.trim();
  if (explicit !== undefined && explicit.length > 0)
    return explicit.startsWith(trigger) ? explicit.slice(trigger.length) : explicit;
  return option.label.trim().replace(/\s+/gu, "-");
}

function triggerForOption(
  option: MentionOption,
  triggers: readonly MentionTrigger[],
): MentionTrigger {
  if (option.trigger !== undefined) {
    return triggers.find((trigger) => trigger.symbol === option.trigger)!;
  }
  if (option.entityType !== undefined) {
    return triggers.find((trigger) => trigger.entityType === option.entityType)!;
  }
  return triggers[0]!;
}

function queryAt(
  value: string,
  caret: number,
  triggers: readonly MentionTrigger[],
): MentionQuery | null {
  const prefix = value.slice(0, caret);
  let result: MentionQuery | null = null;
  for (const trigger of triggers) {
    const start = prefix.lastIndexOf(trigger.symbol);
    if (start < 0 || (start > 0 && !/\s/u.test(prefix[start - 1] ?? ""))) continue;
    const query = prefix.slice(start + trigger.symbol.length);
    if (/\s/u.test(query)) continue;
    if (result === null || start > result.start) {
      result = {
        end: caret,
        entityType: trigger.entityType,
        query,
        start,
        trigger: trigger.symbol,
      };
    }
  }
  return result;
}

function nextEnabledIndex(options: readonly MentionOption[], start: number, delta: 1 | -1): number {
  if (options.length === 0) return -1;
  const origin = start < 0 && delta === -1 ? 0 : start;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const candidate = (origin + offset * delta + options.length) % options.length;
    if (options[candidate]?.disabled !== true) return candidate;
  }
  return -1;
}

export const MentionField = forwardRef<HTMLTextAreaElement, MentionFieldProps>(
  function MentionField(
    {
      className,
      defaultValue = "",
      description,
      disabled = false,
      emptyMessage = "No matching mentions.",
      errorMessage,
      id,
      invalid = false,
      label,
      loadError,
      loading = false,
      loadingMessage = "Loading mentions…",
      onCompositionEnd,
      onCompositionStart,
      onKeyDown,
      onQueryChange,
      onRetry,
      onValueChange,
      options,
      readOnly = false,
      required = false,
      rows = 4,
      showMentionSummary = false,
      triggers = DEFAULT_TRIGGERS,
      value,
      ...textareaProps
    },
    forwardedRef,
  ): ReactElement {
    assertText(label, "label");
    assertText(emptyMessage, "empty message");
    assertText(loadingMessage, "loading message");
    if (triggers.length === 0)
      throw new TypeError("Mergora MentionField requires at least one trigger.");
    const triggerSymbols = new Set<string>();
    const triggerEntityTypes = new Set<string>();
    for (const trigger of triggers) {
      assertText(trigger.symbol, "trigger symbol");
      assertText(trigger.entityType, "trigger entity type");
      if (/\s/u.test(trigger.symbol))
        throw new TypeError("Mergora MentionField trigger symbols must not contain whitespace.");
      if (triggerSymbols.has(trigger.symbol))
        throw new TypeError(`Mergora MentionField trigger symbol ${trigger.symbol} is duplicated.`);
      triggerSymbols.add(trigger.symbol);
      triggerEntityTypes.add(trigger.entityType);
    }
    if (loadError !== undefined && onRetry === undefined)
      throw new TypeError("Mergora MentionField loadError requires onRetry.");
    const ids = new Set<string>();
    for (const option of options) {
      assertText(option.id, "option id");
      assertText(option.label, "option label");
      if (ids.has(option.id))
        throw new TypeError(`Mergora MentionField option id ${option.id} is duplicated.`);
      if (option.trigger !== undefined && !triggerSymbols.has(option.trigger))
        throw new RangeError(
          `Mergora MentionField option ${option.id} uses an unknown trigger ${option.trigger}.`,
        );
      if (
        option.trigger === undefined &&
        option.entityType !== undefined &&
        !triggerEntityTypes.has(option.entityType)
      )
        throw new RangeError(
          `Mergora MentionField option ${option.id} uses an unknown entity type ${option.entityType}.`,
        );
      ids.add(option.id);
    }
    const generatedId = `mrg-mention-field-${useId().replaceAll(":", "")}`;
    const fieldId = id ?? generatedId;
    const listboxId = `${fieldId}-listbox`;
    const descriptionId = description === undefined ? undefined : `${fieldId}-description`;
    const errorId = errorMessage === undefined ? undefined : `${fieldId}-error`;
    const summaryId = `${fieldId}-summary`;
    const controlled = value !== undefined;
    const [internalValue, setInternalValue] = useState(defaultValue);
    const currentValue = controlled ? value : internalValue;
    const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
    const [activeIndex, setActiveIndex] = useState(-1);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const composingRef = useRef(false);
    const matches = useMemo(() => {
      if (mentionQuery === null) return [];
      const normalized = mentionQuery.query.toLocaleLowerCase();
      return options.filter((option) => {
        const trigger = triggerForOption(option, triggers);
        return (
          trigger.symbol === mentionQuery.trigger &&
          [option.label, mentionToken(option, trigger.symbol), option.description]
            .filter((part): part is string => part !== undefined)
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalized)
        );
      });
    }, [mentionQuery, options, triggers]);
    const recognized = useMemo(
      () =>
        options.filter((option) => {
          const trigger = triggerForOption(option, triggers);
          return new RegExp(
            `(^|\\s)${escapeExpression(trigger.symbol)}${escapeExpression(mentionToken(option, trigger.symbol))}(?=\\s|$|[.,!?])`,
            "iu",
          ).test(currentValue);
        }),
      [currentValue, options, triggers],
    );

    useEffect(() => {
      const textarea = textareaRef.current;
      const form = textarea?.form;
      if (form === null || form === undefined || controlled) return;
      const restore = () => {
        setInternalValue(defaultValue);
        setMentionQuery(null);
        onQueryChange?.(null);
        setActiveIndex(-1);
      };
      form.addEventListener("reset", restore);
      return () => form.removeEventListener("reset", restore);
    }, [controlled, defaultValue, onQueryChange]);

    const setTextareaRef = (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef !== null) forwardedRef.current = node;
    };
    const commit = (next: string, reason: "input" | "mention") => {
      if (!controlled) setInternalValue(next);
      onValueChange?.(next, reason);
    };
    const updateQuery = (target: HTMLTextAreaElement) => {
      if (disabled || readOnly) return;
      const next = queryAt(target.value, target.selectionStart ?? target.value.length, triggers);
      setMentionQuery(next);
      onQueryChange?.(next);
      setActiveIndex(-1);
    };
    const choose = (option: MentionOption) => {
      if (mentionQuery === null || option.disabled === true || disabled || readOnly) return;
      const trigger = triggerForOption(option, triggers);
      const insertion = `${mentionQuery.trigger}${mentionToken(option, trigger.symbol)} `;
      const next = `${currentValue.slice(0, mentionQuery.start)}${insertion}${currentValue.slice(mentionQuery.end)}`;
      const caret = mentionQuery.start + insertion.length;
      commit(next, "mention");
      setMentionQuery(null);
      onQueryChange?.(null);
      setActiveIndex(-1);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(caret, caret);
      });
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(event);
      if (
        event.defaultPrevented ||
        composingRef.current ||
        mentionQuery === null ||
        disabled ||
        readOnly
      )
        return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => nextEnabledIndex(matches, index, 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => nextEnabledIndex(matches, index, -1));
      } else if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(nextEnabledIndex(matches, -1, 1));
      } else if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(nextEnabledIndex(matches, 0, -1));
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        const option = matches[activeIndex];
        if (option !== undefined) choose(option);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setMentionQuery(null);
        onQueryChange?.(null);
        setActiveIndex(-1);
      }
    };
    const active = activeIndex < 0 ? undefined : matches[activeIndex];
    const describedBy = [descriptionId, errorId, showMentionSummary ? summaryId : undefined]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        className={["mrg-mention-field", className].filter(Boolean).join(" ")}
        data-disabled={disabled || undefined}
        data-invalid={invalid || undefined}
        data-slot="mention-field"
      >
        <label htmlFor={fieldId}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
        {description === undefined ? null : (
          <span className="mrg-mention-field__description" id={descriptionId}>
            {description}
          </span>
        )}
        <textarea
          {...textareaProps}
          aria-activedescendant={
            active === undefined ? undefined : `${fieldId}-mention-${active.id}`
          }
          aria-controls={mentionQuery === null ? undefined : listboxId}
          aria-describedby={describedBy || undefined}
          aria-expanded={mentionQuery === null ? undefined : true}
          aria-haspopup={mentionQuery === null ? undefined : "listbox"}
          aria-invalid={invalid || undefined}
          aria-busy={loading || undefined}
          aria-autocomplete={mentionQuery === null ? undefined : "list"}
          disabled={disabled}
          id={fieldId}
          onChange={(event) => {
            commit(event.currentTarget.value, "input");
            if (!composingRef.current) updateQuery(event.currentTarget);
          }}
          onClick={(event) => updateQuery(event.currentTarget)}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            onCompositionEnd?.(event);
            if (!event.defaultPrevented) updateQuery(event.currentTarget);
          }}
          onCompositionStart={(event) => {
            composingRef.current = true;
            onCompositionStart?.(event);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => {
            if (
              !composingRef.current &&
              !["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)
            )
              updateQuery(event.currentTarget);
          }}
          readOnly={readOnly}
          ref={setTextareaRef}
          required={required}
          role={mentionQuery === null ? undefined : "combobox"}
          rows={rows}
          value={currentValue}
        />
        {mentionQuery === null ? null : (
          <ul id={listboxId} role="listbox">
            {matches.length === 0 ? (
              <li
                aria-disabled="true"
                aria-selected="false"
                className="mrg-mention-field__empty"
                role="option"
              >
                {loading ? loadingMessage : emptyMessage}
              </li>
            ) : null}
            {matches.map((option, index) => {
              const trigger = triggerForOption(option, triggers);
              return (
                <li
                  aria-disabled={option.disabled || undefined}
                  aria-selected={index === activeIndex}
                  data-active={index === activeIndex || undefined}
                  data-disabled={option.disabled || undefined}
                  id={`${fieldId}-mention-${option.id}`}
                  key={option.id}
                  onClick={() => choose(option)}
                  onMouseDown={(event) => event.preventDefault()}
                  role="option"
                >
                  <span>
                    {trigger.symbol}
                    {mentionToken(option, trigger.symbol)} · {option.label}
                  </span>
                  <small>
                    {trigger.label ?? trigger.entityType}
                    {option.description === undefined ? "" : ` · ${option.description}`}
                  </small>
                </li>
              );
            })}
          </ul>
        )}
        {loadError === undefined ? null : (
          <div className="mrg-mention-field__load-error" role="alert">
            <span>{loadError}</span>
            <button onClick={onRetry} type="button">
              Retry
            </button>
          </div>
        )}
        {showMentionSummary ? (
          <output
            aria-live="polite"
            className="mrg-mention-field__summary"
            data-slot="mention-field-summary"
            id={summaryId}
          >
            {recognized.length === 0
              ? "No recognized mentions."
              : `${recognized.length} recognized ${recognized.length === 1 ? "mention" : "mentions"}: ${recognized.map((option) => option.label).join(", ")}.`}
          </output>
        ) : null}
        {errorMessage === undefined ? null : (
          <span className="mrg-mention-field__error" id={errorId} role="alert">
            {errorMessage}
          </span>
        )}
      </div>
    );
  },
);
