"use client";

import { forwardRef, type HTMLAttributes, type KeyboardEventHandler, type ReactNode } from "react";
import {
  Button as AriaButton,
  Disclosure as AriaDisclosure,
  DisclosureGroup as AriaDisclosureGroup,
  DisclosurePanel as AriaDisclosurePanel,
  Heading as AriaHeading,
  type ButtonProps as AriaButtonProps,
  type DisclosurePanelProps as AriaDisclosurePanelProps,
  type DisclosureProps as AriaDisclosureProps,
  type HeadingProps as AriaHeadingProps,
} from "react-aria-components/DisclosureGroup";

import "./accordion.css";

export interface AccordionRootProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  readonly children: ReactNode;
  readonly defaultValue?: readonly string[];
  readonly disabled?: boolean;
  readonly multiple?: boolean;
  readonly onValueChange?: (value: readonly string[]) => void;
  readonly value?: readonly string[];
}

function validateAccordionValues(values: readonly string[] | undefined, name: string): void {
  if (values === undefined) return;
  const unique = new Set<string>();
  for (const value of values) {
    if (value.trim().length === 0) {
      throw new Error(`Mergora Accordion ${name} values must be non-empty strings.`);
    }
    if (unique.has(value)) {
      throw new Error(`Mergora Accordion ${name} values must be unique.`);
    }
    unique.add(value);
  }
}

function enabledAccordionTriggers(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('[data-slot="accordion-trigger"]')].filter(
    (trigger) => !trigger.disabled && trigger.getAttribute("aria-disabled") !== "true",
  );
}

export const AccordionRoot = forwardRef<HTMLDivElement, AccordionRootProps>(function AccordionRoot(
  {
    children,
    className,
    defaultValue,
    disabled = false,
    multiple = false,
    onKeyDown,
    onValueChange,
    value,
    ...nativeProps
  },
  ref,
) {
  validateAccordionValues(value, "controlled");
  validateAccordionValues(defaultValue, "default");
  if (!multiple && (value?.length ?? 0) > 1) {
    throw new Error("Mergora Accordion single mode accepts at most one controlled value.");
  }
  if (!multiple && (defaultValue?.length ?? 0) > 1) {
    throw new Error("Mergora Accordion single mode accepts at most one default value.");
  }

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !(event.target instanceof HTMLButtonElement)) return;
    if (event.target.dataset.slot !== "accordion-trigger") return;
    const triggers = enabledAccordionTriggers(event.currentTarget);
    const current = triggers.indexOf(event.target);
    if (current < 0 || triggers.length === 0) return;
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (current + 1) % triggers.length;
    else if (event.key === "ArrowUp") next = (current - 1 + triggers.length) % triggers.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = triggers.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    triggers[next]?.focus();
  };

  return (
    <div
      {...nativeProps}
      className={className === undefined ? "mrg-accordion" : `mrg-accordion ${className}`}
      data-slot="accordion"
      onKeyDown={handleKeyDown}
      ref={ref}
    >
      <AriaDisclosureGroup
        {...(defaultValue === undefined ? {} : { defaultExpandedKeys: defaultValue })}
        {...(value === undefined ? {} : { expandedKeys: value })}
        allowsMultipleExpanded={multiple}
        data-slot="accordion-group"
        isDisabled={disabled}
        onExpandedChange={(keys) => onValueChange?.([...keys].map(String))}
      >
        {children}
      </AriaDisclosureGroup>
    </div>
  );
});

AccordionRoot.displayName = "AccordionRoot";

export interface AccordionItemProps extends Omit<
  AriaDisclosureProps,
  "children" | "className" | "id" | "isDisabled"
> {
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly value: string;
}

export const AccordionItem = forwardRef<HTMLDivElement, AccordionItemProps>(function AccordionItem(
  { children, disabled = false, value, ...props },
  ref,
) {
  if (value.trim().length === 0) {
    throw new Error("Mergora Accordion.Item value must be a non-empty string.");
  }
  return (
    <AriaDisclosure
      {...props}
      className="mrg-accordion__item"
      data-slot="accordion-item"
      id={value}
      isDisabled={disabled}
      ref={ref}
    >
      {children}
    </AriaDisclosure>
  );
});

AccordionItem.displayName = "AccordionItem";

export interface AccordionHeaderProps extends Omit<
  AriaHeadingProps,
  "children" | "className" | "level"
> {
  readonly children: ReactNode;
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
}

export const AccordionHeader = forwardRef<HTMLHeadingElement, AccordionHeaderProps>(
  function AccordionHeader({ children, level, ...props }, ref) {
    return (
      <AriaHeading
        {...props}
        className="mrg-accordion__header"
        data-slot="accordion-header"
        level={level}
        ref={ref}
      >
        {children}
      </AriaHeading>
    );
  },
);

AccordionHeader.displayName = "AccordionHeader";

export interface AccordionTriggerProps extends Omit<AriaButtonProps, "children" | "className"> {
  readonly children: ReactNode;
}

export const AccordionTrigger = forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  function AccordionTrigger({ children, ...props }, ref) {
    return (
      <AriaButton
        {...props}
        className="mrg-accordion__trigger"
        data-slot="accordion-trigger"
        ref={ref}
        slot="trigger"
      >
        <span data-slot="accordion-trigger-label">{children}</span>
        <span aria-hidden="true" data-slot="accordion-trigger-indicator">
          ▾
        </span>
      </AriaButton>
    );
  },
);

AccordionTrigger.displayName = "AccordionTrigger";

export interface AccordionPanelProps extends Omit<
  AriaDisclosurePanelProps,
  "children" | "className"
> {
  readonly children: ReactNode;
}

export const AccordionPanel = forwardRef<HTMLDivElement, AccordionPanelProps>(
  function AccordionPanel({ children, ...props }, ref) {
    return (
      <AriaDisclosurePanel
        {...props}
        className="mrg-accordion__panel"
        data-slot="accordion-panel"
        ref={ref}
      >
        {children}
      </AriaDisclosurePanel>
    );
  },
);

AccordionPanel.displayName = "AccordionPanel";

export const Accordion = {
  Header: AccordionHeader,
  Item: AccordionItem,
  Panel: AccordionPanel,
  Root: AccordionRoot,
  Trigger: AccordionTrigger,
} as const;
