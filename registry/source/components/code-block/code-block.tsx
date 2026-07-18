"use client";

import { forwardRef, useId, useState, type HTMLAttributes, type ReactNode } from "react";

import { useMergoraMessage } from "../provider/index.js";
import "./code-block.css";

export type CodeBlockStatus = "idle" | "copied" | "error";

export interface CodeBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly code: string;
  readonly copiedLabel?: string;
  readonly copyErrorLabel?: string;
  readonly copyLabel?: string;
  readonly filename?: string;
  readonly highlightedLines?: readonly number[];
  readonly label: string;
  readonly language?: string;
  readonly onCopyComplete?: (code: string) => void;
  readonly renderLine?: (line: string, lineNumber: number) => ReactNode;
  readonly showLineNumbers?: boolean;
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
      data-slot="code-block"
      data-wrap={wrap ? "true" : "false"}
      role="region"
    >
      <div className="mrg-code-block-header" data-slot="code-block-header">
        <span data-slot="code-block-title">{filename ?? label}</span>
        {language === undefined ? null : <span data-slot="code-block-language">{language}</span>}
        <button
          aria-describedby={statusId}
          data-copy-status={status}
          data-slot="code-block-copy"
          onClick={() => void copy()}
          type="button"
        >
          {status === "copied" ? copiedLabel : copyLabel}
        </button>
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
      <span className="mrg-code-block-sr-only" id={statusId} role="status">
        {status === "copied" ? copiedLabel : status === "error" ? copyErrorLabel : ""}
      </span>
    </div>
  );
});

CodeBlock.displayName = "CodeBlock";
