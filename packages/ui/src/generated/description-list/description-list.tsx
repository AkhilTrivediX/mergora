// Generated from registry/source/components/description-list/description-list.tsx by @mergora-internal/source-transformer. Do not edit.
import { forwardRef, type HTMLAttributes } from "react";

import "./description-list.css";

export type DescriptionListLayout = "stacked" | "columns" | "responsive";
export type DescriptionListDensity = "compact" | "comfortable";

export interface DescriptionListProps extends HTMLAttributes<HTMLDListElement> {
  /** Selects compact or comfortable spacing without changing native list semantics. */
  readonly density?: DescriptionListDensity;
  /** Selects stacked, column, or responsive term-detail layout. */
  readonly layout?: DescriptionListLayout;
}

export type DescriptionTermProps = HTMLAttributes<HTMLElement>;
export type DescriptionDetailsProps = HTMLAttributes<HTMLElement>;

export const DescriptionList = forwardRef<HTMLDListElement, DescriptionListProps>(
  function DescriptionList(
    { className, density = "comfortable", layout = "responsive", ...nativeProps },
    forwardedRef,
  ) {
    return (
      <dl
        {...nativeProps}
        ref={forwardedRef}
        className={
          className === undefined || className.trim().length === 0
            ? "mrg-description-list"
            : `mrg-description-list ${className}`
        }
        data-density={density}
        data-layout={layout}
        data-slot="description-list"
      />
    );
  },
);

DescriptionList.displayName = "DescriptionList";

export const DescriptionTerm = forwardRef<HTMLElement, DescriptionTermProps>(
  function DescriptionTerm({ className, ...nativeProps }, forwardedRef) {
    return (
      <dt
        {...nativeProps}
        ref={forwardedRef}
        className={
          className === undefined || className.trim().length === 0
            ? "mrg-description-term"
            : `mrg-description-term ${className}`
        }
        data-slot="description-term"
      />
    );
  },
);

DescriptionTerm.displayName = "DescriptionTerm";

export const DescriptionDetails = forwardRef<HTMLElement, DescriptionDetailsProps>(
  function DescriptionDetails({ className, ...nativeProps }, forwardedRef) {
    return (
      <dd
        {...nativeProps}
        ref={forwardedRef}
        className={
          className === undefined || className.trim().length === 0
            ? "mrg-description-details"
            : `mrg-description-details ${className}`
        }
        data-slot="description-details"
      />
    );
  },
);

DescriptionDetails.displayName = "DescriptionDetails";
