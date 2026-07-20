// Generated from registry/source/components/prompt-suggestions/prompt-suggestions.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./prompt-suggestions.css";

import {
  forwardRef,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export interface PromptSuggestion {
  /** Optional supporting copy rendered only when description presentation is enabled. */
  readonly description?: ReactNode;
  /** Prevents selection and action while preserving suggestion context. */
  readonly disabled?: boolean;
  /** Stable unique suggestion identifier used for selection and rendering. */
  readonly id: string;
  /** Human-readable suggestion content shown in the action. */
  readonly label: ReactNode;
  /** Plain text representation available to consumer search or composer integration. */
  readonly textValue: string;
}

export interface PromptSuggestionsProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Initial selected suggestion ID for uncontrolled selection mode. */
  readonly defaultSelectedKey?: string | null;
  /** Required accessible name for the suggestion collection. */
  readonly label: string;
  /** Receives an enabled suggestion after pointer or keyboard activation. */
  readonly onAction?: (suggestion: PromptSuggestion) => void;
  /** Reports selection changes only while selection mode is enabled. */
  readonly onSelectionChange?: (key: string) => void;
  /** Controlled selected suggestion ID or null; use with `onSelectionChange`. */
  readonly selectedKey?: string | null;
  /** Enables listbox selection semantics and roving focus; false removes selection accessibility output. */
  readonly selectionMode?: boolean;
  /** Shows supporting suggestion copy; false removes descriptions from visual and accessibility output. */
  readonly showDescriptions?: boolean;
  /** Ordered immutable suggestions with stable unique identifiers. */
  readonly suggestions: readonly PromptSuggestion[];
}

export const PromptSuggestions = forwardRef<HTMLDivElement, PromptSuggestionsProps>(
  function PromptSuggestions(
    {
      className,
      defaultSelectedKey = null,
      label,
      onAction,
      onSelectionChange,
      selectedKey,
      selectionMode = false,
      showDescriptions = false,
      suggestions,
      ...props
    },
    ref,
  ) {
    const controlled = selectedKey !== undefined;
    const [uncontrolledKey, setUncontrolledKey] = useState(defaultSelectedKey);
    const currentKey = controlled ? selectedKey : uncontrolledKey;
    const buttons = useRef<Array<HTMLButtonElement | null>>([]);
    const enabledIndexes = suggestions
      .map((suggestion, index) => (suggestion.disabled ? -1 : index))
      .filter((index) => index >= 0);
    const selectedIndex = suggestions.findIndex((suggestion) => suggestion.id === currentKey);
    const activeIndex = selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? -1);

    const select = (suggestion: PromptSuggestion) => {
      if (suggestion.disabled) return;
      if (selectionMode) {
        if (!controlled) setUncontrolledKey(suggestion.id);
        onSelectionChange?.(suggestion.id);
      }
      onAction?.(suggestion);
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (!selectionMode || enabledIndexes.length === 0) return;
      const position = enabledIndexes.indexOf(index);
      let next: number | undefined;
      if (event.key === "ArrowDown") next = enabledIndexes[(position + 1) % enabledIndexes.length];
      if (event.key === "ArrowUp") {
        next = enabledIndexes[(position - 1 + enabledIndexes.length) % enabledIndexes.length];
      }
      if (event.key === "Home") next = enabledIndexes[0];
      if (event.key === "End") next = enabledIndexes.at(-1);
      if (next === undefined) return;
      event.preventDefault();
      buttons.current[next]?.focus();
    };

    return (
      <div
        {...props}
        aria-label={label}
        className={
          className === undefined ? "mrg-prompt-suggestions" : `mrg-prompt-suggestions ${className}`
        }
        data-selection-mode={selectionMode || undefined}
        data-slot="prompt-suggestions"
        ref={ref}
        role={selectionMode ? "listbox" : undefined}
      >
        {suggestions.map((suggestion, index) => (
          <button
            aria-selected={selectionMode ? suggestion.id === currentKey : undefined}
            data-slot="prompt-suggestion"
            disabled={suggestion.disabled}
            key={suggestion.id}
            onClick={() => select(suggestion)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            role={selectionMode ? "option" : undefined}
            tabIndex={selectionMode ? (index === activeIndex ? 0 : -1) : undefined}
            type="button"
          >
            <span>{suggestion.label}</span>
            {showDescriptions && suggestion.description !== undefined ? (
              <small>{suggestion.description}</small>
            ) : null}
          </button>
        ))}
      </div>
    );
  },
);

PromptSuggestions.displayName = "PromptSuggestions";
