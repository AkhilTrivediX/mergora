"use client";

import "./markdown-editor.css";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type CompositionEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

export type MarkdownEditorPreviewLayout = false | "split" | "tabs";
export type MarkdownEditorView = "preview" | "write";
export type MarkdownEditorChangeReason =
  "input" | "paste-adapter" | "reset" | "toolbar" | "upload-adapter";

export interface MarkdownEditorAdapterContext {
  /** Lifecycle abort signal for consumer-owned paste or upload adapter work. */
  readonly signal: AbortSignal;
  /** Editor value captured when the adapter operation begins. */
  readonly value: string;
}

export interface MarkdownEditorProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Required visible label connected to the native textarea. */
  readonly label: ReactNode;
  /** Optional guidance linked to the textarea through `aria-describedby`. */
  readonly description?: ReactNode;
  /** Controlled Markdown source; use with `onValueChange`. */
  readonly value?: string;
  /** Initial Markdown source for uncontrolled use and native form reset. */
  readonly defaultValue?: string;
  /** Reports source updates with input, toolbar, adapter, or reset reason. */
  readonly onValueChange?: (value: string, reason: MarkdownEditorChangeReason) => void;
  /** Native textarea name used for form serialization. */
  readonly name?: string;
  /** ID of an external form that owns the native textarea and reset behavior. */
  readonly form?: string;
  /** Applies browser required validation to the native textarea. */
  readonly required?: boolean;
  /** Disables editing, toolbar, adapters, and native form submission. */
  readonly disabled?: boolean;
  /** Prevents value mutation and adapters while preserving selectable source and form value. */
  readonly readOnly?: boolean;
  /** Marks the textarea invalid independently of adapter and consumer error content. */
  readonly invalid?: boolean;
  /** Consumer validation error linked to the textarea and announced as an alert. */
  readonly error?: ReactNode;
  /** Enables split or tabbed preview; false removes preview UI and view controls. */
  readonly previewLayout?: MarkdownEditorPreviewLayout;
  /** Controlled write/preview tab for tabbed layout. */
  readonly activeView?: MarkdownEditorView;
  /** Initial write/preview tab for uncontrolled tabbed layout. */
  readonly defaultActiveView?: MarkdownEditorView;
  /** Reports controlled or uncontrolled tab changes. */
  readonly onActiveViewChange?: (view: MarkdownEditorView) => void;
  /** Consumer-owned preview rendering and sanitization; omission shows literal source. */
  readonly renderPreview?: (value: string) => ReactNode;
  /** Adds keyboard-operable formatting controls and shortcuts; false removes both. */
  readonly showToolbar?: boolean;
  /** Adds a source-derived word-count output; false removes it. */
  readonly showWordCount?: boolean;
  /** Consumer-owned paste transformation with cancellation; omission preserves native paste. */
  readonly pasteAdapter?: (
    data: DataTransfer,
    context: MarkdownEditorAdapterContext,
  ) => Promise<string | undefined> | string | undefined;
  /** Consumer-owned file transformation with cancellation; omission performs no upload or network work. */
  readonly uploadAdapter?: (
    files: readonly File[],
    context: MarkdownEditorAdapterContext,
  ) => Promise<string | undefined> | string | undefined;
  /** Native textarea attributes except values and behaviors owned by the editor contract. */
  readonly textareaProps?: Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "defaultValue" | "disabled" | "form" | "name" | "onChange" | "readOnly" | "required" | "value"
  >;
}

function classes(...values: readonly (false | string | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function countMarkdownWords(value: string): number {
  const matches = value.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return matches?.length ?? 0;
}

function insertMarkdown(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  fallback: string,
): { readonly selectionStart: number; readonly selectionEnd: number; readonly value: string } {
  const selected = value.slice(start, end) || fallback;
  const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
  return {
    value: next,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + selected.length,
  };
}

export const MarkdownEditor = forwardRef<HTMLDivElement, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      label,
      description,
      value,
      defaultValue = "",
      onValueChange,
      name,
      form,
      required = false,
      disabled = false,
      readOnly = false,
      invalid = false,
      error,
      previewLayout = false,
      activeView,
      defaultActiveView = "write",
      onActiveViewChange,
      renderPreview,
      showToolbar = false,
      showWordCount = false,
      pasteAdapter,
      uploadAdapter,
      textareaProps,
      className,
      ...props
    },
    ref,
  ) {
    if (value !== undefined && defaultValue !== "") {
      throw new RangeError("Mergora MarkdownEditor cannot receive both value and defaultValue.");
    }
    if (activeView !== undefined && defaultActiveView !== "write") {
      throw new RangeError(
        "Mergora MarkdownEditor cannot receive both activeView and defaultActiveView.",
      );
    }
    const controlled = value !== undefined;
    const [internalValue, setInternalValue] = useState(defaultValue);
    const editorValue = value ?? internalValue;
    const viewControlled = activeView !== undefined;
    const [internalView, setInternalView] = useState(defaultActiveView);
    const view = activeView ?? internalView;
    const [pending, setPending] = useState(false);
    const [adapterError, setAdapterError] = useState<ReactNode>();
    const id = useId().replaceAll(":", "");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const composingRef = useRef(false);
    const operationRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const valueRef = useRef(editorValue);
    valueRef.current = editorValue;
    const labelId = `mrg-markdown-editor-${id}-label`;
    const descriptionId = `mrg-markdown-editor-${id}-description`;
    const errorId = `mrg-markdown-editor-${id}-error`;
    const textareaId = `mrg-markdown-editor-${id}-textarea`;
    const previewId = `mrg-markdown-editor-${id}-preview`;

    const commit = (next: string, reason: MarkdownEditorChangeReason): void => {
      if (!controlled) setInternalValue(next);
      onValueChange?.(next, reason);
    };
    const setView = (next: MarkdownEditorView): void => {
      if (!viewControlled) setInternalView(next);
      onActiveViewChange?.(next);
    };

    const cancelAdapter = (): void => {
      operationRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setPending(false);
      setAdapterError(undefined);
    };

    useEffect(() => {
      const owner = textareaRef.current?.form;
      if (owner === null || owner === undefined) return;
      const reset = () => {
        operationRef.current += 1;
        abortRef.current?.abort();
        setPending(false);
        setAdapterError(undefined);
        commit(defaultValue, "reset");
      };
      owner.addEventListener("reset", reset);
      return () => owner.removeEventListener("reset", reset);
    });

    useEffect(
      () => () => {
        operationRef.current += 1;
        abortRef.current?.abort();
      },
      [],
    );

    const runAdapter = async (
      adapter: (
        context: MarkdownEditorAdapterContext,
      ) => Promise<string | undefined> | string | undefined,
      reason: MarkdownEditorChangeReason,
    ): Promise<void> => {
      const operation = operationRef.current + 1;
      const startingValue = editorValue;
      operationRef.current = operation;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPending(true);
      setAdapterError(undefined);
      try {
        const result = await adapter({ signal: controller.signal, value: editorValue });
        if (
          operation !== operationRef.current ||
          controller.signal.aborted ||
          valueRef.current !== startingValue
        )
          return;
        if (result !== undefined) commit(result, reason);
      } catch (caught) {
        if (operation !== operationRef.current || controller.signal.aborted) return;
        setAdapterError(caught instanceof Error ? caught.message : "The content adapter failed.");
      } finally {
        if (operation === operationRef.current && !controller.signal.aborted) setPending(false);
      }
    };

    const applyToolbar = (before: string, after: string, fallback: string): void => {
      const textarea = textareaRef.current;
      if (textarea === null) return;
      cancelAdapter();
      const result = insertMarkdown(
        editorValue,
        textarea.selectionStart,
        textarea.selectionEnd,
        before,
        after,
        fallback,
      );
      commit(result.value, "toolbar");
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      });
    };

    const onEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
      textareaProps?.onKeyDown?.(event);
      if (event.defaultPrevented || composingRef.current || !showToolbar || disabled || readOnly) {
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLocaleLowerCase();
      if (key === "b") {
        event.preventDefault();
        applyToolbar("**", "**", "strong text");
      } else if (key === "i") {
        event.preventDefault();
        applyToolbar("_", "_", "emphasized text");
      }
    };

    const describedBy = [
      description === undefined ? undefined : descriptionId,
      invalid || error !== undefined || adapterError !== undefined ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    const showWrite = previewLayout !== "tabs" || view === "write";
    const showPreview =
      previewLayout === "split" || (previewLayout === "tabs" && view === "preview");

    return (
      <div
        {...props}
        ref={ref}
        className={classes("mrg-markdown-editor", className)}
        data-disabled={disabled || undefined}
        data-invalid={invalid || error !== undefined || adapterError !== undefined || undefined}
        data-layout={previewLayout || "write"}
        data-pending={pending || undefined}
        data-readonly={readOnly || undefined}
        data-slot="markdown-editor"
        aria-busy={pending || undefined}
      >
        <div className="mrg-markdown-editor__heading">
          <label htmlFor={textareaId} id={labelId}>
            {label}
          </label>
          {description === undefined ? null : <span id={descriptionId}>{description}</span>}
        </div>
        {showToolbar ? (
          <div
            aria-label="Markdown formatting"
            className="mrg-markdown-editor__toolbar"
            data-slot="markdown-editor-toolbar"
            role="toolbar"
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              const buttons = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
              ];
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (index < 0) return;
              const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
              const increment = (event.key === "ArrowRight") !== rtl ? 1 : -1;
              const next = buttons[(index + increment + buttons.length) % buttons.length];
              event.preventDefault();
              next?.focus();
            }}
          >
            <button
              disabled={disabled || readOnly}
              type="button"
              onClick={() => applyToolbar("**", "**", "strong text")}
            >
              Bold
            </button>
            <button
              disabled={disabled || readOnly}
              type="button"
              onClick={() => applyToolbar("_", "_", "emphasized text")}
            >
              Italic
            </button>
            <button
              disabled={disabled || readOnly}
              type="button"
              onClick={() => applyToolbar("[", "](https://)", "link text")}
            >
              Link
            </button>
          </div>
        ) : null}
        {previewLayout === "tabs" ? (
          <div
            aria-label="Editor view"
            className="mrg-markdown-editor__tabs"
            role="tablist"
            onKeyDown={(event) => {
              if (
                event.key !== "ArrowLeft" &&
                event.key !== "ArrowRight" &&
                event.key !== "Home" &&
                event.key !== "End"
              )
                return;
              const tabs = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
              ];
              const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
              if (current < 0) return;
              const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (current + ((event.key === "ArrowRight") !== rtl ? 1 : -1) + tabs.length) %
                      tabs.length;
              const next = tabs[nextIndex];
              const nextView = next?.dataset.view as MarkdownEditorView | undefined;
              if (next === undefined || nextView === undefined) return;
              event.preventDefault();
              setView(nextView);
              next.focus();
            }}
          >
            {(["write", "preview"] as const).map((item) => (
              <button
                aria-controls={item === "write" ? textareaId : previewId}
                aria-selected={view === item}
                data-view={item}
                id={`mrg-markdown-editor-${id}-${item}-tab`}
                key={item}
                role="tab"
                tabIndex={view === item ? 0 : -1}
                type="button"
                onClick={() => setView(item)}
              >
                {item === "write" ? "Write" : "Preview"}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mrg-markdown-editor__workspace">
          <textarea
            {...textareaProps}
            aria-describedby={describedBy || undefined}
            aria-invalid={invalid || error !== undefined || adapterError !== undefined || undefined}
            aria-labelledby={labelId}
            className={classes("mrg-markdown-editor__textarea", textareaProps?.className)}
            data-slot="markdown-editor-textarea"
            disabled={disabled}
            form={form}
            hidden={!showWrite}
            id={textareaId}
            name={name}
            readOnly={readOnly}
            ref={textareaRef}
            required={required}
            value={editorValue}
            onChange={(event) => {
              cancelAdapter();
              commit(event.currentTarget.value, "input");
            }}
            onCompositionEnd={(event: CompositionEvent<HTMLTextAreaElement>) => {
              composingRef.current = false;
              textareaProps?.onCompositionEnd?.(event);
            }}
            onCompositionStart={(event: CompositionEvent<HTMLTextAreaElement>) => {
              composingRef.current = true;
              textareaProps?.onCompositionStart?.(event);
            }}
            onKeyDown={onEditorKeyDown}
            onInvalid={(event) => {
              textareaProps?.onInvalid?.(event);
              if (event.defaultPrevented || previewLayout !== "tabs" || showWrite) return;
              event.preventDefault();
              setView("write");
              requestAnimationFrame(() => {
                const textarea = textareaRef.current;
                if (textarea === null || textarea.hidden) return;
                textarea.focus();
                textarea.reportValidity();
              });
            }}
            onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
              textareaProps?.onPaste?.(event);
              if (event.defaultPrevented || disabled || readOnly) return;
              const files = [...event.clipboardData.files];
              if (files.length > 0 && uploadAdapter !== undefined) {
                event.preventDefault();
                void runAdapter((context) => uploadAdapter(files, context), "upload-adapter");
              } else if (pasteAdapter !== undefined) {
                event.preventDefault();
                const data = event.clipboardData;
                void runAdapter((context) => pasteAdapter(data, context), "paste-adapter");
              }
            }}
          />
          {showPreview ? (
            <section
              aria-labelledby={
                previewLayout === "tabs" ? `mrg-markdown-editor-${id}-preview-tab` : labelId
              }
              className="mrg-markdown-editor__preview"
              data-slot="markdown-editor-preview"
              id={previewId}
              role={previewLayout === "tabs" ? "tabpanel" : "region"}
            >
              {renderPreview === undefined ? (
                <pre>{editorValue || "Nothing to preview"}</pre>
              ) : (
                renderPreview(editorValue)
              )}
            </section>
          ) : null}
        </div>
        <div className="mrg-markdown-editor__footer">
          {showWordCount ? (
            <output data-slot="markdown-editor-word-count">
              {countMarkdownWords(editorValue)} words
            </output>
          ) : null}
          {pending ? <span role="status">Processing pasted content…</span> : null}
          {error !== undefined || adapterError !== undefined ? (
            <p id={errorId} role="alert">
              {error ?? adapterError}
            </p>
          ) : null}
        </div>
      </div>
    );
  },
);
