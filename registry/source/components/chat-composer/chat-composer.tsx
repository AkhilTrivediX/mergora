"use client";

import "./chat-composer.css";

import {
  forwardRef,
  useRef,
  useState,
  type FormEvent,
  type FormHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type ChatComposerStatus = "error" | "idle" | "offline" | "streaming" | "submitting";
export type ChatComposerShortcut = false | "enter" | "mod-enter";

export interface ChatComposerAttachment {
  /** Stable unique attachment identifier used for rendering and removal. */
  readonly id: string;
  /** Human-readable attachment name used by default rendering and removal labels. */
  readonly name: string;
  /** Optional attachment readiness lifecycle shown as stable state metadata. */
  readonly status?: "error" | "pending" | "ready";
}

export interface ChatComposerSubmitDetail {
  /** Complete native FormData snapshot, including consumer-added form controls. */
  readonly formData: FormData;
  /** Exact controlled or uncontrolled composer text at submission time. */
  readonly value: string;
}

export interface ChatComposerProps extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  "children" | "defaultValue" | "onChange" | "onSubmit"
> {
  /** Accessible name for the optional attachment collection. */
  readonly attachmentLabel?: string;
  /** Adds consumer-owned attachment context; false removes its list and removal UI. */
  readonly attachments?: false | readonly ChatComposerAttachment[];
  /** Initial textarea value for uncontrolled use and native form reset. */
  readonly defaultValue?: string;
  /** Disables textarea, submit, stop, and attachment-removal interactions. */
  readonly disabled?: boolean;
  /** Consumer recovery content announced for error and offline statuses. */
  readonly errorContent?: ReactNode;
  /** Required visible label for the native textarea. */
  readonly label: string;
  /** Native maximum text length used by validation and optional character budget. */
  readonly maxLength?: number;
  /** Native textarea field name used for form serialization. */
  readonly name?: string;
  /** Adds attachment removal actions; storage and upload deletion remain consumer-owned. */
  readonly onAttachmentRemove?: (attachment: ChatComposerAttachment) => void;
  /** Adds a stop action while streaming; model and network cancellation remain consumer-owned. */
  readonly onStop?: () => void;
  /** Receives native form data and text after enabled submit activation. */
  readonly onSubmitMessage?: (
    detail: ChatComposerSubmitDetail,
    event: FormEvent<HTMLFormElement>,
  ) => void;
  /** Reports controlled or uncontrolled text changes and native form reset. */
  readonly onValueChange?: (value: string) => void;
  /** Optional native textarea placeholder; it does not replace the required label. */
  readonly placeholder?: string;
  /** Prevents text, submit, reset, and removal mutation while retaining readable values. */
  readonly readOnly?: boolean;
  /** Consumer attachment renderer; omission uses the safe attachment name. */
  readonly renderAttachment?: (attachment: ChatComposerAttachment) => ReactNode;
  /** Adds a character-count output; false removes its UI and accessibility output. */
  readonly showCharacterBudget?: boolean;
  /** Composer lifecycle controlling busy, offline, error, stop, and submit behavior. */
  readonly status?: ChatComposerStatus;
  /** Localized label for the streaming stop action. */
  readonly stopLabel?: string;
  /** Localized label for the message submit action. */
  readonly submitLabel?: string;
  /** Enables one IME-safe keyboard submission pattern; false removes shortcut behavior and hint UI. */
  readonly submitShortcut?: ChatComposerShortcut;
  /** Controlled textarea value; use with `onValueChange`. */
  readonly value?: string;
}

export const ChatComposer = forwardRef<HTMLFormElement, ChatComposerProps>(function ChatComposer(
  {
    attachmentLabel = "Attached files",
    attachments = false,
    className,
    defaultValue = "",
    disabled,
    errorContent,
    label,
    maxLength,
    name = "message",
    onAttachmentRemove,
    onReset,
    onStop,
    onSubmitMessage,
    onValueChange,
    placeholder,
    readOnly = false,
    renderAttachment,
    showCharacterBudget = false,
    status = "idle",
    stopLabel = "Stop response",
    submitLabel = "Send message",
    submitShortcut = false,
    value,
    ...props
  },
  ref,
) {
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const currentValue = controlled ? value : uncontrolledValue;
  const composing = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const submitUnavailable =
    disabled ||
    readOnly ||
    status === "offline" ||
    status === "submitting" ||
    currentValue.trim() === "";
  const enabledAttachments = attachments === false ? [] : attachments;

  const publish = (next: string) => {
    if (!controlled) setUncontrolledValue(next);
    onValueChange?.(next);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (onSubmitMessage === undefined) return;
    event.preventDefault();
    if (submitUnavailable || status === "streaming") return;
    onSubmitMessage({ formData: new FormData(event.currentTarget), value: currentValue }, event);
  };
  const handleShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (submitShortcut === false || composing.current || event.nativeEvent.isComposing) return;
    const enter = event.key === "Enter";
    const shouldSubmit =
      submitShortcut === "enter"
        ? enter && !event.shiftKey
        : enter && (event.metaKey || event.ctrlKey);
    if (!shouldSubmit || submitUnavailable || status === "streaming") return;
    event.preventDefault();
    formRef.current?.requestSubmit();
  };

  return (
    <form
      {...props}
      aria-busy={status === "submitting" || status === "streaming" || undefined}
      className={className === undefined ? "mrg-chat-composer" : `mrg-chat-composer ${className}`}
      data-slot="chat-composer"
      data-status={status}
      onReset={(event) => {
        onReset?.(event);
        if (!event.defaultPrevented) publish(defaultValue);
      }}
      onSubmit={submit}
      ref={(node) => {
        formRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref !== null) ref.current = node;
      }}
    >
      <label data-slot="chat-composer-field">
        <span>{label}</span>
        <textarea
          disabled={disabled}
          maxLength={maxLength}
          name={name}
          onChange={(event) => publish(event.currentTarget.value)}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onKeyDown={handleShortcut}
          placeholder={placeholder}
          readOnly={readOnly}
          value={currentValue}
        />
      </label>
      {showCharacterBudget ? (
        <output data-slot="chat-composer-budget">
          {currentValue.length}
          {maxLength === undefined ? " characters" : ` of ${maxLength} characters`}
        </output>
      ) : null}
      {enabledAttachments.length > 0 ? (
        <ul aria-label={attachmentLabel} data-slot="chat-composer-attachments">
          {enabledAttachments.map((attachment) => (
            <li data-status={attachment.status ?? "ready"} key={attachment.id}>
              <span>{renderAttachment?.(attachment) ?? attachment.name}</span>
              {onAttachmentRemove === undefined ? null : (
                <button
                  aria-label={`Remove ${attachment.name}`}
                  disabled={disabled || readOnly}
                  onClick={() => onAttachmentRemove(attachment)}
                  type="button"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {errorContent === undefined || (status !== "error" && status !== "offline") ? null : (
        <div data-slot="chat-composer-error" role="alert">
          {errorContent}
        </div>
      )}
      <div data-slot="chat-composer-actions">
        {status === "streaming" && onStop !== undefined ? (
          <button disabled={disabled} onClick={onStop} type="button">
            {stopLabel}
          </button>
        ) : (
          <button disabled={submitUnavailable} type="submit">
            {submitLabel}
          </button>
        )}
        {submitShortcut === false ? null : (
          <span data-slot="chat-composer-shortcut">
            {submitShortcut === "enter"
              ? "Enter to send · Shift+Enter for a new line"
              : "Ctrl/⌘+Enter to send"}
          </span>
        )}
      </div>
    </form>
  );
});

ChatComposer.displayName = "ChatComposer";
