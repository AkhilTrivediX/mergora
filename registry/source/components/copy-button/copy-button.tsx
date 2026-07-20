"use client";

import { forwardRef, useState, type ButtonHTMLAttributes, type MouseEventHandler } from "react";

import { runButtonActivation } from "../button/button-state.js";
import { useMergoraMessage } from "../provider/index.js";
import "./copy-button.css";

export type CopyButtonStatus = "idle" | "copying" | "copied" | "error";

export interface ClipboardEnvironment {
  /** Supplies the modern clipboard writer when the host grants access. */
  readonly clipboard?: { writeText(text: string): Promise<void> };
  /** Supplies a document only when the explicitly enabled legacy fallback is available. */
  readonly document?: Document;
}

export async function writeClipboardText(
  text: string,
  environment: ClipboardEnvironment = {
    ...(typeof navigator === "undefined" || navigator.clipboard === undefined
      ? {}
      : { clipboard: navigator.clipboard }),
    ...(typeof document === "undefined" ? {} : { document }),
  },
  allowFallback = true,
): Promise<"clipboard" | "fallback"> {
  if (environment.clipboard !== undefined) {
    await environment.clipboard.writeText(text);
    return "clipboard";
  }
  if (!allowFallback) {
    throw new Error("Clipboard API access is unavailable and the legacy fallback is disabled.");
  }
  if (environment.document === undefined) {
    throw new Error("Clipboard access is unavailable in this environment.");
  }
  const textarea = environment.document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  environment.document.body.append(textarea);
  try {
    textarea.select();
    const copied = environment.document.execCommand("copy");
    if (!copied) throw new Error("The browser rejected the clipboard fallback.");
    return "fallback";
  } finally {
    textarea.remove();
  }
}

export interface CopyButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onCopy" | "onError"
> {
  /** Exact string written to the clipboard; the component does not render this value. */
  readonly text: string;
  /** Localizable idle-state label; defaults through MergoraProvider messages. */
  readonly copyLabel?: string;
  /** Localizable in-progress label announced while the write is pending. */
  readonly copyingLabel?: string;
  /** Localizable success label announced after a completed write. */
  readonly copiedLabel?: string;
  /** Localizable failure label announced after a rejected write. */
  readonly errorLabel?: string;
  /** Allows the legacy hidden-control fallback when the Clipboard API is unavailable. */
  readonly allowFallback?: boolean;
  /** Called after a successful write with the method that completed it. */
  readonly onCopy?: (method: "clipboard" | "fallback") => void;
  /** Called with the rejected value when clipboard writing fails. */
  readonly onCopyError?: (error: unknown) => void;
}

export const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(function CopyButton(
  {
    allowFallback = true,
    className,
    copiedLabel: copiedLabelProp,
    copyingLabel: copyingLabelProp,
    copyLabel: copyLabelProp,
    disabled = false,
    errorLabel: errorLabelProp,
    onClick,
    onCopy,
    onCopyError,
    text,
    type = "button",
    ...nativeProps
  },
  ref,
) {
  const [status, setStatus] = useState<CopyButtonStatus>("idle");
  const defaultCopiedLabel = useMergoraMessage("copyButton.copied", "Copied");
  const defaultCopyingLabel = useMergoraMessage("copyButton.copying", "Copying");
  const defaultCopyLabel = useMergoraMessage("copyButton.copy", "Copy");
  const defaultErrorLabel = useMergoraMessage("copyButton.error", "Copy failed");
  const copiedLabel = copiedLabelProp ?? defaultCopiedLabel;
  const copyingLabel = copyingLabelProp ?? defaultCopyingLabel;
  const copyLabel = copyLabelProp ?? defaultCopyLabel;
  const errorLabel = errorLabelProp ?? defaultErrorLabel;
  const pending = status === "copying";
  const label =
    status === "copying"
      ? copyingLabel
      : status === "copied"
        ? copiedLabel
        : status === "error"
          ? errorLabel
          : copyLabel;

  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    const activation = runButtonActivation(pending, event, onClick);
    if (activation === "prevented-pending" || event.defaultPrevented) return;
    setStatus("copying");
    void writeClipboardText(text, undefined, allowFallback).then(
      (method) => {
        setStatus("copied");
        onCopy?.(method);
      },
      (error: unknown) => {
        setStatus("error");
        onCopyError?.(error);
      },
    );
  };

  return (
    <button
      {...nativeProps}
      aria-busy={pending || undefined}
      aria-disabled={pending || nativeProps["aria-disabled"]}
      className={className === undefined ? "mrg-copy-button" : `mrg-copy-button ${className}`}
      data-slot="copy-button"
      data-status={status}
      disabled={disabled}
      onClick={handleClick}
      ref={ref}
      type={type}
    >
      <span aria-hidden="true" data-slot="copy-button-icon">
        {status === "copied" ? "✓" : status === "error" ? "!" : "⧉"}
      </span>
      <span aria-live="polite" data-slot="copy-button-status">
        {label}
      </span>
    </button>
  );
});

CopyButton.displayName = "CopyButton";
Object.defineProperty(CopyButton, Symbol.for("mergora-ui/toolbar-action"), { value: true });
