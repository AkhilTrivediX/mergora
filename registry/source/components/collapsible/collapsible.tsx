"use client";

import { forwardRef, type ReactNode } from "react";
import {
  Button as AriaButton,
  Disclosure as AriaDisclosure,
  DisclosurePanel as AriaDisclosurePanel,
  type ButtonProps as AriaButtonProps,
  type DisclosurePanelProps as AriaDisclosurePanelProps,
  type DisclosureProps as AriaDisclosureProps,
} from "react-aria-components/Disclosure";

import "./collapsible.css";

export interface CollapsibleRootProps extends Omit<
  AriaDisclosureProps,
  "children" | "className" | "defaultExpanded" | "isDisabled" | "isExpanded" | "onExpandedChange"
> {
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly disabled?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
}

export const CollapsibleRoot = forwardRef<HTMLDivElement, CollapsibleRootProps>(
  function CollapsibleRoot(
    { children, defaultOpen = false, disabled = false, onOpenChange, open, ...props },
    ref,
  ) {
    return (
      <AriaDisclosure
        {...props}
        {...(onOpenChange === undefined ? {} : { onExpandedChange: onOpenChange })}
        {...(open === undefined ? {} : { isExpanded: open })}
        className="mrg-collapsible"
        data-slot="collapsible"
        defaultExpanded={defaultOpen}
        isDisabled={disabled}
        ref={ref}
      >
        {children}
      </AriaDisclosure>
    );
  },
);

CollapsibleRoot.displayName = "CollapsibleRoot";

export interface CollapsibleTriggerProps extends Omit<AriaButtonProps, "children" | "className"> {
  readonly children: ReactNode;
}

export const CollapsibleTrigger = forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  function CollapsibleTrigger({ children, ...props }, ref) {
    return (
      <AriaButton
        {...props}
        className="mrg-collapsible__trigger"
        data-slot="collapsible-trigger"
        ref={ref}
        slot="trigger"
      >
        <span data-slot="collapsible-trigger-label">{children}</span>
        <span aria-hidden="true" data-slot="collapsible-trigger-indicator">
          ▾
        </span>
      </AriaButton>
    );
  },
);

CollapsibleTrigger.displayName = "CollapsibleTrigger";

export interface CollapsibleContentProps extends Omit<
  AriaDisclosurePanelProps,
  "children" | "className"
> {
  readonly children: ReactNode;
}

export const CollapsibleContent = forwardRef<HTMLDivElement, CollapsibleContentProps>(
  function CollapsibleContent({ children, ...props }, ref) {
    return (
      <AriaDisclosurePanel
        {...props}
        className="mrg-collapsible__content"
        data-slot="collapsible-content"
        ref={ref}
      >
        {children}
      </AriaDisclosurePanel>
    );
  },
);

CollapsibleContent.displayName = "CollapsibleContent";

export const Collapsible = {
  Content: CollapsibleContent,
  Root: CollapsibleRoot,
  Trigger: CollapsibleTrigger,
} as const;
