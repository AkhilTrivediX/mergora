// Generated from registry/source/components/rich-text-editor/rich-text-editor.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./rich-text-editor.css";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export type RichTextEditorChangeReason = "adapter" | "reset";

export interface RichTextEditorSurfaceContext {
  /** Current serialized document value owned by the component or controlled consumer. */
  readonly value: string;
  /** Whether the adapter surface must prevent all interaction and submission. */
  readonly disabled: boolean;
  /** Whether the adapter surface may expose content but must prevent edits. */
  readonly readOnly: boolean;
  /** Element ID the adapter surface must use for its accessible name relationship. */
  readonly labelledBy: string;
  /** Space-separated description and error IDs for the adapter surface when present. */
  readonly describedBy?: string;
  /** Whether external or serialized-value validation currently marks the surface invalid. */
  readonly invalid: boolean;
  /** Commits an adapter-originated serialized value unless the component is disabled or read-only. */
  readonly onValueChange: (value: string) => void;
}

export interface RichTextEditorAdapter {
  /** Stable adapter identifier exposed as component metadata and optional boundary context. */
  readonly id: string;
  /** Adapter version identifying the serialization and editing contract in use. */
  readonly version: string;
  /** Renders the consumer-owned editor surface with required accessibility and state context. */
  readonly renderSurface: (context: RichTextEditorSurfaceContext) => ReactNode;
}

export interface RichTextEditorProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Identified, versioned integration that owns document semantics, editing, history, and security. */
  readonly adapter: RichTextEditorAdapter;
  /** Required visible name linked to the adapter-rendered editing surface. */
  readonly label: ReactNode;
  /** Optional guidance linked to the editing surface through the adapter context. */
  readonly description?: ReactNode;
  /** Controlled serialized document value; use with `onValueChange`. */
  readonly value?: string;
  /** Initial serialized value for uncontrolled use and native form reset. */
  readonly defaultValue?: string;
  /** Reports adapter edits and native form resets with a stable change reason. */
  readonly onValueChange?: (value: string, reason: RichTextEditorChangeReason) => void;
  /** Native form field name for the serialized document hidden input. */
  readonly name?: string;
  /** ID of an external form that owns the serialized document input. */
  readonly form?: string;
  /** Disables adapter editing and native form submission of the serialized value. */
  readonly disabled?: boolean;
  /** Prevents adapter edits while keeping the serialized content readable and submittable. */
  readonly readOnly?: boolean;
  /** Marks the editing surface invalid independently of serialization validation. */
  readonly invalid?: boolean;
  /** Consumer validation error linked to the adapter surface and announced as an alert. */
  readonly error?: ReactNode;
  /** Optional consumer-owned controls rendered in a labelled toolbar region. */
  readonly toolbar?: ReactNode;
  /** Shows adapter ownership and version context; false removes that explanatory UI. */
  readonly showAdapterBoundary?: boolean;
  /** Adds a disclosure containing the exact serialized value; false removes it completely. */
  readonly showSerializationPreview?: boolean;
  /** Adds a polite editor-state output; false removes its UI and live-region semantics. */
  readonly showStatusRail?: boolean;
  /** Returns a recovery message when the current serialized value is not acceptable. */
  readonly validateSerializedValue?: (value: string) => ReactNode | undefined;
}

function classes(...values: readonly (false | string | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export const RichTextEditor = forwardRef<HTMLDivElement, RichTextEditorProps>(
  function RichTextEditor(
    {
      adapter,
      label,
      description,
      value,
      defaultValue = "",
      onValueChange,
      name,
      form,
      disabled = false,
      readOnly = false,
      invalid = false,
      error,
      toolbar,
      showAdapterBoundary = false,
      showSerializationPreview = false,
      showStatusRail = false,
      validateSerializedValue,
      className,
      ...props
    },
    ref,
  ) {
    if (value !== undefined && defaultValue !== "") {
      throw new RangeError("Mergora RichTextEditor cannot receive both value and defaultValue.");
    }
    if (adapter.id.trim().length === 0 || adapter.version.trim().length === 0) {
      throw new RangeError("Mergora RichTextEditor requires an identified, versioned adapter.");
    }
    const controlled = value !== undefined;
    const [internalValue, setInternalValue] = useState(defaultValue);
    const serializedValue = value ?? internalValue;
    const validationError = validateSerializedValue?.(serializedValue);
    const hasError = invalid || error !== undefined || validationError !== undefined;
    const hiddenInputRef = useRef<HTMLInputElement | null>(null);
    const id = useId().replaceAll(":", "");
    const labelId = `mrg-rich-text-editor-${id}-label`;
    const descriptionId = `mrg-rich-text-editor-${id}-description`;
    const errorId = `mrg-rich-text-editor-${id}-error`;
    const describedBy = [
      description === undefined ? undefined : descriptionId,
      hasError ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    const commit = (next: string, reason: RichTextEditorChangeReason): void => {
      if (!controlled) setInternalValue(next);
      onValueChange?.(next, reason);
    };

    useEffect(() => {
      const owner = hiddenInputRef.current?.form;
      if (owner === null || owner === undefined) return;
      const reset = () => commit(defaultValue, "reset");
      owner.addEventListener("reset", reset);
      return () => owner.removeEventListener("reset", reset);
    });

    return (
      <div
        {...props}
        ref={ref}
        className={classes("mrg-rich-text-editor", className)}
        data-adapter={adapter.id}
        data-disabled={disabled || undefined}
        data-invalid={hasError || undefined}
        data-readonly={readOnly || undefined}
        data-slot="rich-text-editor"
      >
        <div className="mrg-rich-text-editor__heading">
          <strong id={labelId}>{label}</strong>
          {description === undefined ? null : <span id={descriptionId}>{description}</span>}
        </div>
        {showAdapterBoundary ? (
          <p
            className="mrg-rich-text-editor__adapter"
            data-slot="rich-text-editor-adapter-boundary"
          >
            Adapter:{" "}
            <code>
              {adapter.id}@{adapter.version}
            </code>
            . Editing, history, document semantics, and security are adapter-owned.
          </p>
        ) : null}
        {toolbar === undefined ? null : (
          <div
            aria-label="Rich text tools"
            className="mrg-rich-text-editor__toolbar"
            data-slot="rich-text-editor-toolbar"
            role="toolbar"
          >
            {toolbar}
          </div>
        )}
        <div className="mrg-rich-text-editor__surface" data-slot="rich-text-editor-surface">
          {adapter.renderSurface({
            value: serializedValue,
            disabled,
            readOnly,
            labelledBy: labelId,
            ...(describedBy.length === 0 ? {} : { describedBy }),
            invalid: hasError,
            onValueChange: (next) => {
              if (disabled || readOnly) return;
              commit(next, "adapter");
            },
          })}
        </div>
        <input
          data-slot="rich-text-editor-input"
          disabled={disabled}
          form={form}
          name={name}
          ref={hiddenInputRef}
          type="hidden"
          value={serializedValue}
        />
        {showSerializationPreview ? (
          <details
            className="mrg-rich-text-editor__serialization"
            data-slot="rich-text-editor-serialization"
          >
            <summary>Serialized value</summary>
            <pre>{serializedValue}</pre>
          </details>
        ) : null}
        {hasError ? (
          <p className="mrg-rich-text-editor__error" id={errorId} role="alert">
            {error ?? validationError}
          </p>
        ) : null}
        {showStatusRail ? (
          <output
            aria-live="polite"
            className="mrg-rich-text-editor__status"
            data-slot="rich-text-editor-status"
          >
            {readOnly
              ? "Read only"
              : disabled
                ? "Disabled"
                : hasError
                  ? "Serialized value needs attention"
                  : "Adapter value ready"}
          </output>
        ) : null}
      </div>
    );
  },
);
