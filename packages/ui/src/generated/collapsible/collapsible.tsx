// Generated from registry/source/components/collapsible/collapsible.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  Fragment,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  Button as AriaButton,
  Disclosure as AriaDisclosure,
  DisclosurePanel as AriaDisclosurePanel,
  type ButtonProps as AriaButtonProps,
  type DisclosurePanelProps as AriaDisclosurePanelProps,
  type DisclosureProps as AriaDisclosureProps,
} from "react-aria-components/Disclosure";

import "./collapsible.css";

interface CollapsibleStateContextValue {
  readonly open: boolean;
}

const CollapsibleStateContext = createContext<CollapsibleStateContextValue | null>(null);

function hasAccessibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAccessibleContent);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) {
    if (value.type === Fragment) return hasAccessibleContent(value.props.children);
    return typeof value.type === "string" ? hasAccessibleContent(value.props.children) : true;
  }
  return true;
}

export interface CollapsibleRootProps extends Omit<
  AriaDisclosureProps,
  "children" | "className" | "defaultExpanded" | "isDisabled" | "isExpanded" | "onExpandedChange"
> {
  /** Trigger and content parts owned by this disclosure root. */
  readonly children: ReactNode;
  /** Initial open state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Disables native disclosure activation. */
  readonly disabled?: boolean;
  /** Reports every committed disclosure open-state change. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Controlled open state; pair with onOpenChange. */
  readonly open?: boolean;
}

export const CollapsibleRoot = forwardRef<HTMLDivElement, CollapsibleRootProps>(
  function CollapsibleRoot(
    { children, defaultOpen = false, disabled = false, onOpenChange, open, ...props },
    ref,
  ) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
    const resolvedOpen = open ?? uncontrolledOpen;
    return (
      <CollapsibleStateContext.Provider value={{ open: resolvedOpen }}>
        <AriaDisclosure
          {...props}
          className="mrg-collapsible"
          data-slot="collapsible"
          isDisabled={disabled}
          isExpanded={resolvedOpen}
          onExpandedChange={(nextOpen) => {
            if (open === undefined) setUncontrolledOpen(nextOpen);
            onOpenChange?.(nextOpen);
          }}
          ref={ref}
        >
          {children}
        </AriaDisclosure>
      </CollapsibleStateContext.Provider>
    );
  },
);

CollapsibleRoot.displayName = "CollapsibleRoot";

export interface CollapsibleTriggerProps extends Omit<AriaButtonProps, "children" | "className"> {
  /** Visible name rendered inside the native disclosure button. */
  readonly children: ReactNode;
  /** Optional visible state wording; omitted state emits no supplementary UI. */
  readonly stateText?: {
    /** Supplementary visible wording used while the disclosure is closed. */
    readonly closed: ReactNode;
    /** Supplementary visible wording used while the disclosure is open. */
    readonly open: ReactNode;
  };
}

export const CollapsibleTrigger = forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  function CollapsibleTrigger({ children, stateText, ...props }, ref) {
    const context = useContext(CollapsibleStateContext);
    if (context === null) throw new Error("Mergora Collapsible.Trigger requires Collapsible.Root.");
    const activeStateText = context.open ? stateText?.open : stateText?.closed;
    const hasStateText = hasAccessibleContent(activeStateText);
    return (
      <AriaButton
        {...props}
        className="mrg-collapsible__trigger"
        data-slot="collapsible-trigger"
        ref={ref}
        slot="trigger"
      >
        <span data-slot="collapsible-trigger-label">{children}</span>
        {hasStateText ? (
          <span aria-hidden="true" data-slot="collapsible-state-text">
            {activeStateText}
          </span>
        ) : null}
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
  /** Content controlled by the associated disclosure trigger. */
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
