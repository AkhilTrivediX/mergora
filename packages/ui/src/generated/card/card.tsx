// Generated from registry/source/components/card/card.tsx by @mergora-internal/source-transformer. Do not edit.
import "./card.css";

import { forwardRef, isValidElement, Fragment, type HTMLAttributes, type ReactNode } from "react";

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

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

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Native container element used without changing Card's visual structure; defaults to div. */
  readonly as?: "div" | "article" | "section";
  /** Optional contextual status rail rendered before the card body; empty content removes the rail entirely. */
  readonly statusRail?: ReactNode;
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as: Element = "div", statusRail, className, children, ...props },
  ref,
) {
  return (
    <Element
      {...props}
      ref={ref as never}
      className={classes("mrg-card", className)}
      data-slot="card"
      data-has-status={hasContent(statusRail) || undefined}
    >
      {hasContent(statusRail) ? (
        <div className="mrg-card__status" data-slot="card-status">
          {statusRail}
        </div>
      ) : null}
      {children}
    </Element>
  );
});

export type CardSectionProps = HTMLAttributes<HTMLDivElement>;

function cardPart(slot: string, className: string) {
  return forwardRef<HTMLDivElement, CardSectionProps>(function CardPart(
    { className: consumerClassName, ...props },
    ref,
  ) {
    return (
      <div
        {...props}
        ref={ref}
        className={classes(className, consumerClassName)}
        data-slot={slot}
      />
    );
  });
}

export const CardHeader = cardPart("card-header", "mrg-card__header");
export const CardContent = cardPart("card-content", "mrg-card__content");
export const CardFooter = cardPart("card-footer", "mrg-card__footer");
export const CardAction = cardPart("card-action", "mrg-card__action");

export type CardTitleProps = HTMLAttributes<HTMLHeadingElement>;
export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(function CardTitle(
  { className, ...props },
  ref,
) {
  return (
    <h3
      {...props}
      ref={ref}
      className={classes("mrg-card__title", className)}
      data-slot="card-title"
    />
  );
});

export type CardDescriptionProps = HTMLAttributes<HTMLParagraphElement>;
export const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  function CardDescription({ className, ...props }, ref) {
    return (
      <p
        {...props}
        ref={ref}
        className={classes("mrg-card__description", className)}
        data-slot="card-description"
      />
    );
  },
);
