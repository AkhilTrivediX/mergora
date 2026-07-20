import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useId,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

import "./empty-state.css";

export type EmptyStateHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type EmptyStateContext = "collection" | "search" | "first-use" | "permission" | "filtered";

export interface EmptyStateRecoverySuggestions {
  /** Non-empty contextual suggestions rendered as an ordered visible list. */
  readonly items: readonly ReactNode[];
  /** Visible text that names the recovery-suggestions list. */
  readonly label: ReactNode;
}

export interface EmptyStateProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "children" | "role" | "title"
> {
  /** Optional non-empty visible body content between the description and recovery actions. */
  readonly children?: ReactNode;
  /** Domain-neutral state metadata used for styling; defaults to `collection`. */
  readonly context?: EmptyStateContext;
  /** Non-empty visible explanation linked to the named section. */
  readonly description: ReactNode;
  /** Native heading level used for `title`; defaults to 2. */
  readonly headingLevel?: EmptyStateHeadingLevel;
  /** Decorative visual rendered outside the accessibility tree. */
  readonly icon?: ReactNode;
  /** One enabled native or custom recovery action rendered first. */
  readonly primaryAction: ReactElement;
  /** Optional labelled recovery list; omitting it removes the suggestions UI and semantics. */
  readonly recoverySuggestions?: EmptyStateRecoverySuggestions;
  /** Optional second enabled native or custom recovery action. */
  readonly secondaryAction?: ReactElement;
  /** Non-empty visible heading that names the section. */
  readonly title: ReactNode;
}

function hasEmptyStateContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasEmptyStateContent(item));
  if (isValidElement(value) && value.type === Fragment) {
    return hasEmptyStateContent((value.props as { readonly children?: ReactNode }).children);
  }
  return true;
}

function assertRecoveryAction(value: unknown, name: "primaryAction" | "secondaryAction"): void {
  if (!isValidElement(value) || value.type === Fragment) {
    throw new Error(
      name === "primaryAction"
        ? "Mergora EmptyState requires a primary recovery action as one non-fragment React element."
        : "Mergora EmptyState secondaryAction must be one non-fragment React element.",
    );
  }
  if (typeof value.type !== "string") return;

  const props = value.props as Readonly<Record<string, unknown>>;
  if (
    props.disabled === true ||
    props["aria-disabled"] === true ||
    props["aria-disabled"] === "true"
  ) {
    throw new Error(`Mergora EmptyState ${name} must not be a disabled native action.`);
  }

  if (value.type === "button") return;
  if (value.type === "a") {
    if (typeof props.href === "string" && props.href.trim().length > 0) return;
    throw new Error(`Mergora EmptyState ${name} anchor must have a non-empty href.`);
  }
  if (value.type === "input") {
    const inputType = typeof props.type === "string" ? props.type.toLowerCase() : "text";
    if (["button", "image", "reset", "submit"].includes(inputType)) return;
    throw new Error(
      `Mergora EmptyState ${name} input must use an action-capable button, image, reset, or submit type.`,
    );
  }
  throw new Error(
    `Mergora EmptyState ${name} native element must be a button, href-bearing anchor, or action-capable input.`,
  );
}

export const EmptyState = forwardRef<HTMLElement, EmptyStateProps>(function EmptyState(
  {
    children,
    className,
    context = "collection",
    description,
    headingLevel = 2,
    icon,
    primaryAction,
    recoverySuggestions,
    secondaryAction,
    title,
    ...nativeProps
  },
  ref,
) {
  if (!hasEmptyStateContent(title) || !hasEmptyStateContent(description)) {
    throw new Error("Mergora EmptyState requires non-empty title and description.");
  }
  if (children !== undefined && !hasEmptyStateContent(children)) {
    throw new Error("Mergora EmptyState body must be non-empty when provided.");
  }
  assertRecoveryAction(primaryAction, "primaryAction");
  if (secondaryAction !== undefined) assertRecoveryAction(secondaryAction, "secondaryAction");
  if (recoverySuggestions !== undefined) {
    if (!hasEmptyStateContent(recoverySuggestions.label)) {
      throw new Error("Mergora EmptyState recoverySuggestions requires a non-empty label.");
    }
    if (
      !Array.isArray(recoverySuggestions.items) ||
      recoverySuggestions.items.length === 0 ||
      recoverySuggestions.items.some((item) => !hasEmptyStateContent(item))
    ) {
      throw new Error("Mergora EmptyState recoverySuggestions requires non-empty items.");
    }
  }
  const reactId = useId();
  const titleId = `mrg-empty-state-${reactId.replaceAll(":", "")}-title`;
  const descriptionId = `mrg-empty-state-${reactId.replaceAll(":", "")}-description`;
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      {...nativeProps}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={className === undefined ? "mrg-empty-state" : `mrg-empty-state ${className}`}
      data-context={context}
      data-slot="empty-state"
      ref={ref}
    >
      {hasEmptyStateContent(icon) ? (
        <span aria-hidden="true" data-slot="empty-state-icon">
          {icon}
        </span>
      ) : null}
      <Heading data-slot="empty-state-title" id={titleId}>
        {title}
      </Heading>
      <div data-slot="empty-state-description" id={descriptionId}>
        {description}
      </div>
      {hasEmptyStateContent(children) ? <div data-slot="empty-state-body">{children}</div> : null}
      {recoverySuggestions === undefined ? null : (
        <div data-slot="empty-state-suggestions">
          <span data-slot="empty-state-suggestions-label">{recoverySuggestions.label}</span>
          <ul>
            {Children.map(recoverySuggestions.items, (item) => (
              <li>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <div data-slot="empty-state-actions">
        <span data-slot="empty-state-primary-action">{primaryAction}</span>
        {secondaryAction !== undefined ? (
          <span data-slot="empty-state-secondary-action">{secondaryAction}</span>
        ) : null}
      </div>
    </section>
  );
});

EmptyState.displayName = "EmptyState";
