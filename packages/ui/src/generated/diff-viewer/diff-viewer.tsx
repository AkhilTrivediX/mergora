// Generated from registry/source/components/diff-viewer/diff-viewer.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";

import { useMergoraContext, useMergoraMessage, type MergoraMessage } from "../provider/index.js";
import "./diff-viewer.css";

export type DiffViewerMode = "unified" | "split";
export type DiffLineKind = "context" | "added" | "removed" | "changed";

export interface DiffLine {
  readonly content: string;
  readonly id?: string;
  readonly kind: DiffLineKind;
  readonly newContent?: string;
  readonly newLineNumber?: number;
  readonly oldContent?: string;
  readonly oldLineNumber?: number;
}

export interface DiffViewerProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly activeLine?: number;
  readonly copiedLabel?: string;
  readonly copyErrorLabel?: string;
  readonly copyLabel?: string;
  readonly defaultActiveLine?: number;
  readonly label: string;
  readonly lines: readonly DiffLine[];
  readonly mode?: DiffViewerMode;
  readonly onActiveLineChange?: (index: number, line: DiffLine) => void;
  readonly wrap?: boolean;
}

const markerByKind: Readonly<Record<DiffLineKind, string>> = {
  added: "+",
  changed: "~",
  context: " ",
  removed: "−",
};

const defaultSummaryMessage: MergoraMessage = ({ locale, values }) => {
  const added = Number(values.added ?? 0);
  const removed = Number(values.removed ?? 0);
  const number = new Intl.NumberFormat(locale);
  const plural = new Intl.PluralRules(locale);
  const addition = plural.select(added) === "one" ? "addition" : "additions";
  const removal = plural.select(removed) === "one" ? "removal" : "removals";
  return `${number.format(added)} ${addition}, ${number.format(removed)} ${removal}`;
};

function lineNumber(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function boundedIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

export function formatUnifiedDiff(lines: readonly DiffLine[]): string {
  return lines.map((line) => `${markerByKind[line.kind]}${line.content}`).join("\n");
}

async function writeDiffClipboard(value: string): Promise<void> {
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

export const DiffViewer = forwardRef<HTMLDivElement, DiffViewerProps>(function DiffViewer(
  {
    activeLine,
    className,
    copiedLabel: copiedLabelProp,
    copyErrorLabel: copyErrorLabelProp,
    copyLabel: copyLabelProp,
    defaultActiveLine = 0,
    label,
    lines,
    mode = "unified",
    onActiveLineChange,
    wrap = false,
    ...nativeProps
  },
  forwardedRef,
) {
  const [uncontrolledActive, setUncontrolledActive] = useState(defaultActiveLine);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const statusId = useId();
  const { getMessage } = useMergoraContext();
  const defaultCopiedLabel = useMergoraMessage("diffViewer.copied", "Diff copied");
  const defaultCopyErrorLabel = useMergoraMessage("diffViewer.copyError", "Copy failed");
  const defaultCopyLabel = useMergoraMessage("diffViewer.copy", "Copy diff");
  const copiedLabel = copiedLabelProp ?? defaultCopiedLabel;
  const copyErrorLabel = copyErrorLabelProp ?? defaultCopyErrorLabel;
  const copyLabel = copyLabelProp ?? defaultCopyLabel;
  const emptyLabel = useMergoraMessage("diffViewer.empty", "No differences.");
  const noneLabel = useMergoraMessage("diffViewer.none", "none");
  const kindLabels: Readonly<Record<DiffLineKind, string>> = {
    added: useMergoraMessage("diffViewer.kind.added", "Added"),
    changed: useMergoraMessage("diffViewer.kind.changed", "Changed"),
    context: useMergoraMessage("diffViewer.kind.context", "Unchanged"),
    removed: useMergoraMessage("diffViewer.kind.removed", "Removed"),
  };
  const changeColumnLabel = useMergoraMessage("diffViewer.column.change", "Change");
  const oldColumnLabel = useMergoraMessage("diffViewer.column.old", "Old");
  const newColumnLabel = useMergoraMessage("diffViewer.column.new", "New");
  const contentColumnLabel = useMergoraMessage("diffViewer.column.content", "Content");
  const oldLineColumnLabel = useMergoraMessage("diffViewer.column.oldLine", "Old line");
  const previousContentColumnLabel = useMergoraMessage(
    "diffViewer.column.previousContent",
    "Previous content",
  );
  const newLineColumnLabel = useMergoraMessage("diffViewer.column.newLine", "New line");
  const currentContentColumnLabel = useMergoraMessage(
    "diffViewer.column.currentContent",
    "Current content",
  );
  const addedCount = lines.filter((line) => line.kind === "added").length;
  const removedCount = lines.filter((line) => line.kind === "removed").length;
  const summary = getMessage("diffViewer.summary", defaultSummaryMessage, {
    added: addedCount,
    removed: removedCount,
  });
  const currentIndex = boundedIndex(activeLine ?? uncontrolledActive, lines.length);

  const moveTo = (nextIndex: number): void => {
    if (lines.length === 0) return;
    const bounded = boundedIndex(nextIndex, lines.length);
    if (activeLine === undefined) setUncontrolledActive(bounded);
    const line = lines[bounded];
    if (line !== undefined) onActiveLineChange?.(bounded, line);
    rowRefs.current.get(bounded)?.focus({ preventScroll: true });
    rowRefs.current.get(bounded)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const onLineKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number): void => {
    let destination: number | undefined;
    switch (event.key) {
      case "ArrowDown":
        destination = index + 1;
        break;
      case "ArrowUp":
        destination = index - 1;
        break;
      case "End":
        destination = lines.length - 1;
        break;
      case "Home":
        destination = 0;
        break;
      case "PageDown":
        destination = index + 10;
        break;
      case "PageUp":
        destination = index - 10;
        break;
      default:
        return;
    }
    event.preventDefault();
    moveTo(destination);
  };

  const copy = async (): Promise<void> => {
    try {
      await writeDiffClipboard(formatUnifiedDiff(lines));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <div
      {...nativeProps}
      ref={forwardedRef}
      aria-label={label}
      className={
        className === undefined || className.trim().length === 0
          ? "mrg-diff-viewer"
          : `mrg-diff-viewer ${className}`
      }
      data-mode={mode}
      data-slot="diff-viewer"
      data-wrap={wrap ? "true" : "false"}
      role="region"
    >
      <div data-slot="diff-toolbar">
        <strong>{label}</strong>
        <span data-slot="diff-summary">{summary}</span>
        <button
          aria-describedby={statusId}
          data-copy-status={copyStatus}
          data-slot="diff-copy"
          onClick={() => void copy()}
          type="button"
        >
          {copyStatus === "copied" ? copiedLabel : copyLabel}
        </button>
      </div>
      {lines.length === 0 ? (
        <p data-slot="diff-empty">{emptyLabel}</p>
      ) : (
        <div data-slot="diff-scroll" tabIndex={0}>
          <table>
            <caption className="mrg-diff-sr-only">{label}</caption>
            <thead>
              {mode === "unified" ? (
                <tr>
                  <th scope="col">{changeColumnLabel}</th>
                  <th scope="col">{oldColumnLabel}</th>
                  <th scope="col">{newColumnLabel}</th>
                  <th scope="col">{contentColumnLabel}</th>
                </tr>
              ) : (
                <tr>
                  <th scope="col">{oldLineColumnLabel}</th>
                  <th scope="col">{previousContentColumnLabel}</th>
                  <th scope="col">{newLineColumnLabel}</th>
                  <th scope="col">{currentContentColumnLabel}</th>
                </tr>
              )}
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const kindLabel = kindLabels[line.kind];
                const accessibleLabel = getMessage(
                  "diffViewer.line",
                  "{kind} line. Old {oldLine}. New {newLine}. {content}",
                  {
                    content: line.content,
                    kind: kindLabel,
                    newLine: lineNumber(line.newLineNumber) || noneLabel,
                    oldLine: lineNumber(line.oldLineNumber) || noneLabel,
                  },
                );
                const oldLineLabel = getMessage("diffViewer.oldLine", "{kind} old line", {
                  kind: kindLabel,
                });
                return (
                  <tr
                    aria-label={accessibleLabel}
                    data-active={currentIndex === index ? "true" : "false"}
                    data-kind={line.kind}
                    data-slot="diff-line"
                    key={line.id ?? `${line.kind}-${String(index)}`}
                    onClick={() => moveTo(index)}
                    onFocus={() => {
                      if (activeLine === undefined) setUncontrolledActive(index);
                    }}
                    onKeyDown={(event) => onLineKeyDown(event, index)}
                    ref={(node) => {
                      if (node === null) rowRefs.current.delete(index);
                      else rowRefs.current.set(index, node);
                    }}
                    tabIndex={currentIndex === index ? 0 : -1}
                  >
                    {mode === "unified" ? (
                      <>
                        <th data-slot="diff-marker" scope="row">
                          <span aria-hidden="true">{markerByKind[line.kind]}</span>
                          <span className="mrg-diff-sr-only">{kindLabel}</span>
                        </th>
                        <td data-slot="diff-old-line">{lineNumber(line.oldLineNumber)}</td>
                        <td data-slot="diff-new-line">{lineNumber(line.newLineNumber)}</td>
                        <td data-slot="diff-content">
                          <code>{line.content}</code>
                        </td>
                      </>
                    ) : (
                      <>
                        <th data-slot="diff-old-line" scope="row">
                          <span className="mrg-diff-sr-only">{oldLineLabel} </span>
                          {lineNumber(line.oldLineNumber)}
                        </th>
                        <td data-slot="diff-old-content">
                          <code>
                            {line.kind === "added" ? "" : (line.oldContent ?? line.content)}
                          </code>
                        </td>
                        <td data-slot="diff-new-line">{lineNumber(line.newLineNumber)}</td>
                        <td data-slot="diff-new-content">
                          <code>
                            {line.kind === "removed" ? "" : (line.newContent ?? line.content)}
                          </code>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <span className="mrg-diff-sr-only" id={statusId} role="status">
        {copyStatus === "copied" ? copiedLabel : copyStatus === "error" ? copyErrorLabel : ""}
      </span>
    </div>
  );
});

DiffViewer.displayName = "DiffViewer";
