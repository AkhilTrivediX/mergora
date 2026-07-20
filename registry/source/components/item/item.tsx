import "./item.css";

import { Fragment, forwardRef, isValidElement, type HTMLAttributes, type ReactNode } from "react";

function hasContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasContent);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) {
    if (value.type === Fragment) return hasContent(value.props.children);
    return typeof value.type === "string" ? hasContent(value.props.children) : true;
  }
  return true;
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export interface ItemProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Native container element used for the item; defaults to div. */
  readonly as?: "div" | "li" | "article";
  /** Optional leading media content; empty content removes its wrapper. */
  readonly media?: ReactNode;
  /** Primary visible content that names the item. */
  readonly title: ReactNode;
  /** Optional supporting copy rendered below the title when non-empty. */
  readonly description?: ReactNode;
  /** Optional trailing controls or links rendered in the action region when non-empty. */
  readonly actions?: ReactNode;
  /** Marks the item visually selected and adds text context before the title. */
  readonly selected?: boolean;
  /** Marks the item as the current destination through aria-current and family styling. */
  readonly current?: boolean;
  /** Adds optional state-specific output; omitting it removes the output region entirely. */
  readonly renderSelectionContext?: (state: {
    /** Whether the item currently carries the selected treatment. */
    readonly selected: boolean;
    /** Whether the item currently represents the user's destination. */
    readonly current: boolean;
  }) => ReactNode;
}

export const Item = forwardRef<HTMLElement, ItemProps>(function Item(
  {
    as: Element = "div",
    media,
    title,
    description,
    actions,
    selected = false,
    current = false,
    renderSelectionContext,
    className,
    ...props
  },
  ref,
) {
  const context = renderSelectionContext?.({ selected, current });
  return (
    <Element
      {...props}
      ref={ref as never}
      aria-current={current ? "true" : undefined}
      className={classes("mrg-item", className)}
      data-slot="item"
      data-selected={selected || undefined}
      data-current={current || undefined}
    >
      {hasContent(media) ? (
        <div className="mrg-item__media" data-slot="item-media">
          {media}
        </div>
      ) : null}
      <div className="mrg-item__body" data-slot="item-body">
        <div className="mrg-item__title" data-slot="item-title">
          {selected ? <span className="mrg-item__visually-hidden">Selected. </span> : null}
          {title}
        </div>
        {hasContent(description) ? (
          <div className="mrg-item__description" data-slot="item-description">
            {description}
          </div>
        ) : null}
        {hasContent(context) ? (
          <output className="mrg-item__context" data-slot="item-selection-context">
            {context}
          </output>
        ) : null}
      </div>
      {hasContent(actions) ? (
        <div className="mrg-item__actions" data-slot="item-actions">
          {actions}
        </div>
      ) : null}
    </Element>
  );
});
