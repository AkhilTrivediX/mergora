import "./message.css";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export type MessageRole = "assistant" | "system" | "tool" | "user";
export type MessageDeliveryState = "complete" | "error" | "pending" | "streaming";

export interface MessageProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Optional consumer actions rendered in the message footer. */
  readonly actions?: ReactNode;
  /** Optional visible author identity rendered alongside the timestamp. */
  readonly author?: ReactNode;
  /** Primary message content rendered in a dedicated content region. */
  readonly children: ReactNode;
  /** Delivery lifecycle reflected by stable state metadata for styling and context. */
  readonly deliveryState?: MessageDeliveryState;
  /** Optional supporting metadata rendered after the primary message content. */
  readonly metadata?: ReactNode;
  /** Semantic conversation origin used for role context and family styling. */
  readonly role: MessageRole;
  /** Localized role-name overrides merged with defaults for omitted roles. */
  readonly roleLabels?: Partial<Record<MessageRole, string>>;
  /** Adds visible role and delivery context; false removes that extra explanatory UI. */
  readonly showRoleContext?: boolean;
  /** Valid date rendered with a machine-readable ISO `dateTime` and localized visible text. */
  readonly timestamp?: Date | string;
}

const DEFAULT_ROLE_LABELS: Readonly<Record<MessageRole, string>> = {
  assistant: "Assistant",
  system: "System",
  tool: "Tool",
  user: "You",
};

function timestampValue(value: Date | string): {
  readonly dateTime: string;
  readonly text: string;
} {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new RangeError("Mergora Message timestamp must be a valid date.");
  }
  return { dateTime: date.toISOString(), text: date.toLocaleString() };
}

export const Message = forwardRef<HTMLElement, MessageProps>(function Message(
  {
    actions,
    author,
    children,
    className,
    deliveryState = "complete",
    metadata,
    role,
    roleLabels,
    showRoleContext = false,
    timestamp,
    ...props
  },
  ref,
) {
  const roleLabel = roleLabels?.[role] ?? DEFAULT_ROLE_LABELS[role];
  const time = timestamp === undefined ? null : timestampValue(timestamp);

  return (
    <article
      {...props}
      className={className === undefined ? "mrg-message" : `mrg-message ${className}`}
      data-delivery-state={deliveryState}
      data-message-role={role}
      data-slot="message"
      ref={ref}
    >
      {author !== undefined || time !== null ? (
        <header data-slot="message-header">
          {author === undefined ? null : <strong>{author}</strong>}
          {time === null ? null : <time dateTime={time.dateTime}>{time.text}</time>}
        </header>
      ) : null}
      {showRoleContext ? (
        <p data-slot="message-role-context">
          <span>{roleLabel}</span>
          <span>{deliveryState}</span>
        </p>
      ) : null}
      <div data-slot="message-content">{children}</div>
      {metadata === undefined ? null : <div data-slot="message-metadata">{metadata}</div>}
      {actions === undefined ? null : <footer data-slot="message-actions">{actions}</footer>}
    </article>
  );
});

Message.displayName = "Message";
