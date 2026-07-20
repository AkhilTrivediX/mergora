"use client";

import { forwardRef, useId, useState, type HTMLAttributes, type ReactNode } from "react";

import { useMergoraMessage } from "../provider/index.js";
import "./code-block.css";

export type CodeBlockStatus = "idle" | "copied" | "error";

export interface CodeBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Exact source text rendered line by line and written by the optional copy action. */
  readonly code: string;
  /** Localized status announced after a successful clipboard write. */
  readonly copiedLabel?: string;
  /** Adds the clipboard action and its private live status when enabled. */
  readonly copyable?: boolean;
  /** Localized status announced when the clipboard write fails. */
  readonly copyErrorLabel?: string;
  /** Localized accessible label for the clipboard action. */
  readonly copyLabel?: string;
  /** Optional visible filename shown in place of the region label. */
  readonly filename?: string;
  /** One-based line numbers receiving a visible and screen-reader highlight cue. */
  readonly highlightedLines?: readonly number[];
  /** Accessible name for the code region and source viewport. */
  readonly label: string;
  /** Optional language identifier displayed as source context. */
  readonly language?: string;
  /** Called only after the exact source text is written successfully. */
  readonly onCopyComplete?: (code: string) => void;
  /** Replaces each line's visual content without changing copy-source bytes or numbering. */
  readonly renderLine?: (line: string, lineNumber: number) => ReactNode;
  /** Shows aria-hidden one-based line numbers alongside source lines. */
  readonly showLineNumbers?: boolean;
  /** Wraps long source lines; false keeps a keyboard-scrollable horizontal viewport. */
  readonly wrap?: boolean;
}

export function codeBlockLines(code: string): readonly string[] {
  return code.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

export async function writeCodeBlockClipboard(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
    await navigator.clipboard.writeText(value);
    return;
  }
  if (typeof document === "undefined") throw new Error("Clipboard is unavailable.");
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.insetInlineStart = "-10000px";
  document.body.append(textarea);
  try {
    textarea.select();
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("Clipboard copy was rejected.");
  } finally {
    textarea.remove();
  }
}

export const CodeBlock = forwardRef<HTMLDivElement, CodeBlockProps>(function CodeBlock(
  {
    className,
    code,
    copiedLabel: copiedLabelProp,
    copyable = true,
    copyErrorLabel: copyErrorLabelProp,
    copyLabel: copyLabelProp,
    filename,
    highlightedLines = [],
    label,
    language,
    onCopyComplete,
    renderLine,
    showLineNumbers = true,
    wrap = false,
    ...nativeProps
  },
  forwardedRef,
) {
  const [status, setStatus] = useState<CodeBlockStatus>("idle");
  const statusId = useId();
  const lines = codeBlockLines(code);
  const highlighted = new Set(highlightedLines);
  const defaultCopiedLabel = useMergoraMessage("codeBlock.copied", "Copied");
  const defaultCopyErrorLabel = useMergoraMessage("codeBlock.copyError", "Copy failed");
  const defaultCopyLabel = useMergoraMessage("codeBlock.copy", "Copy code");
  const sourceLabel = useMergoraMessage("codeBlock.source", "{label} source", { label });
  const highlightedLabel = useMergoraMessage("codeBlock.highlighted", "Highlighted: ");
  const copiedLabel = copiedLabelProp ?? defaultCopiedLabel;
  const copyErrorLabel = copyErrorLabelProp ?? defaultCopyErrorLabel;
  const copyLabel = copyLabelProp ?? defaultCopyLabel;

  const copy = async (): Promise<void> => {
    try {
      await writeCodeBlockClipboard(code);
      setStatus("copied");
      onCopyComplete?.(code);
    } catch {
      setStatus("error");
    }
  };

  return (
    <div
      {...nativeProps}
      ref={forwardedRef}
      aria-label={label}
      className={
        className === undefined || className.trim().length === 0
          ? "mrg-code-block"
          : `mrg-code-block ${className}`
      }
      data-copyable={copyable ? "true" : "false"}
      data-slot="code-block"
      data-wrap={wrap ? "true" : "false"}
      role="region"
    >
      <div className="mrg-code-block-header" data-slot="code-block-header">
        <span data-slot="code-block-title">{filename ?? label}</span>
        {language === undefined ? null : <span data-slot="code-block-language">{language}</span>}
        {copyable ? (
          <button
            aria-describedby={statusId}
            data-copy-status={status}
            data-slot="code-block-copy"
            onClick={() => void copy()}
            type="button"
          >
            {status === "copied" ? copiedLabel : copyLabel}
          </button>
        ) : null}
      </div>
      <pre aria-label={sourceLabel} data-slot="code-block-scroll" tabIndex={0}>
        <code data-slot="code-block-code">
          {lines.map((line, index) => {
            const lineNumber = index + 1;
            const isHighlighted = highlighted.has(lineNumber);
            return (
              <span
                data-highlighted={isHighlighted ? "true" : "false"}
                data-line={String(lineNumber)}
                data-slot="code-block-line"
                key={lineNumber}
              >
                {showLineNumbers ? (
                  <span aria-hidden="true" data-slot="code-block-line-number">
                    {lineNumber}
                  </span>
                ) : null}
                {isHighlighted ? (
                  <span className="mrg-code-block-sr-only">{highlightedLabel}</span>
                ) : null}
                <span data-slot="code-block-line-content">
                  {renderLine?.(line, lineNumber) ?? line}
                </span>
                {index === lines.length - 1 ? null : "\n"}
              </span>
            );
          })}
        </code>
      </pre>
      {copyable ? (
        <span className="mrg-code-block-sr-only" id={statusId} role="status">
          {status === "copied" ? copiedLabel : status === "error" ? copyErrorLabel : ""}
        </span>
      ) : null}
    </div>
  );
});

CodeBlock.displayName = "CodeBlock";
