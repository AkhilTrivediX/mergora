// Generated from registry/source/components/combobox/combobox.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./combobox.css";

import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  FieldError as AriaFieldError,
  Input as AriaInput,
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Popover as AriaPopover,
  Text as AriaText,
  type ButtonProps as AriaButtonProps,
  type ComboBoxProps as AriaComboBoxProps,
  type FieldErrorProps as AriaFieldErrorProps,
  type InputProps as AriaInputProps,
  type ListBoxItemProps as AriaListBoxItemProps,
  type ListBoxItemRenderProps,
  type ListBoxProps as AriaListBoxProps,
  type PopoverProps as AriaPopoverProps,
} from "react-aria-components/ComboBox";
import { Header as AriaHeader } from "react-aria-components/Header";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ForwardedRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
} from "react";

export type ComboboxKey = string | number;
export type ComboboxMenuTrigger = "focus" | "input" | "manual";

export interface ComboboxValueChangeDetail {
  readonly reason: "selection";
}

export interface ComboboxInputChangeDetail {
  readonly reason: "input";
}

export interface ComboboxOpenChangeDetail {
  readonly reason: ComboboxMenuTrigger | "dismiss";
}

export interface ComboboxRootProps {
  readonly children: ReactNode;
  readonly value?: ComboboxKey | null;
  readonly defaultValue?: ComboboxKey | null;
  readonly onValueChange?: (value: ComboboxKey | null, detail: ComboboxValueChangeDetail) => void;
  readonly inputValue?: string;
  readonly defaultInputValue?: string;
  readonly onInputValueChange?: (value: string, detail: ComboboxInputChangeDetail) => void;
  readonly onOpenChange?: (open: boolean, detail: ComboboxOpenChangeDetail) => void;
  readonly allowsCustomValue?: boolean;
  readonly allowsEmptyCollection?: boolean;
  readonly menuTrigger?: ComboboxMenuTrigger;
  readonly disabledKeys?: Iterable<ComboboxKey>;
  readonly isDisabled?: boolean;
  readonly isReadOnly?: boolean;
  readonly isRequired?: boolean;
  readonly isInvalid?: boolean;
  readonly name?: string;
  readonly formValue?: "key" | "text";
  readonly validationBehavior?: "aria" | "native";
  readonly className?: string;
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
}

function classes(base: string, className: string | undefined): string {
  return className === undefined || className.trim() === "" ? base : `${base} ${className}`;
}

function ComboboxRootInner(
  {
    children,
    value,
    defaultValue,
    onValueChange,
    inputValue,
    defaultInputValue,
    onInputValueChange,
    onOpenChange,
    allowsCustomValue,
    allowsEmptyCollection,
    menuTrigger,
    disabledKeys,
    isDisabled,
    isReadOnly,
    isRequired,
    isInvalid,
    name,
    formValue,
    validationBehavior,
    className,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
  }: ComboboxRootProps,
  ref: ForwardedRef<HTMLDivElement>,
): ReactElement {
  const ariaProps: AriaComboBoxProps<Record<string, unknown>, "single"> = {
    children,
    className: classes("mrg-combobox", className),
    ...(value !== undefined ? { value } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(onValueChange === undefined
      ? {}
      : {
          onChange: (nextValue) =>
            onValueChange(nextValue as ComboboxKey | null, { reason: "selection" }),
        }),
    ...(inputValue !== undefined ? { inputValue } : {}),
    ...(defaultInputValue !== undefined ? { defaultInputValue } : {}),
    ...(onInputValueChange === undefined
      ? {}
      : {
          onInputChange: (nextValue) => onInputValueChange(nextValue, { reason: "input" }),
        }),
    ...(onOpenChange === undefined
      ? {}
      : {
          onOpenChange: (nextOpen, trigger) =>
            onOpenChange(nextOpen, { reason: nextOpen ? (trigger ?? "manual") : "dismiss" }),
        }),
    ...(allowsCustomValue !== undefined ? { allowsCustomValue } : {}),
    ...(allowsEmptyCollection !== undefined ? { allowsEmptyCollection } : {}),
    ...(menuTrigger !== undefined ? { menuTrigger } : {}),
    ...(disabledKeys !== undefined ? { disabledKeys } : {}),
    ...(isDisabled !== undefined ? { isDisabled } : {}),
    ...(isReadOnly !== undefined ? { isReadOnly } : {}),
    ...(isRequired !== undefined ? { isRequired } : {}),
    ...(isInvalid !== undefined ? { isInvalid } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(formValue !== undefined ? { formValue } : {}),
    ...(validationBehavior !== undefined ? { validationBehavior } : {}),
    ...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {}),
    ...(ariaLabelledBy !== undefined ? { "aria-labelledby": ariaLabelledBy } : {}),
  };

  return (
    <AriaComboBox<Record<string, unknown>, "single">
      {...ariaProps}
      ref={ref}
      data-slot="combobox-root"
    />
  );
}

export const ComboboxRoot = forwardRef<HTMLDivElement, ComboboxRootProps>(ComboboxRootInner);

export interface ComboboxLabelProps extends HTMLAttributes<HTMLLabelElement> {
  readonly className?: string;
}

export const ComboboxLabel = forwardRef<HTMLLabelElement, ComboboxLabelProps>(
  ({ className, ...props }, ref) => (
    <AriaLabel
      {...props}
      ref={ref}
      data-slot="combobox-label"
      className={classes("mrg-combobox__label", className)}
    />
  ),
);

export interface ComboboxInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "defaultValue" | "onChange" | "style" | "value"
> {
  readonly className?: string;
}

export const ComboboxInput = forwardRef<HTMLInputElement, ComboboxInputProps>(
  ({ className, ...props }, ref) => {
    const ariaProps = props as unknown as AriaInputProps;
    return (
      <AriaInput
        {...ariaProps}
        ref={ref}
        data-slot="combobox-input"
        className={classes("mrg-combobox__input", className)}
      />
    );
  },
);

export interface ComboboxTriggerProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "style"
> {
  readonly className?: string;
  readonly label?: string;
}

export const ComboboxTrigger = forwardRef<HTMLButtonElement, ComboboxTriggerProps>(
  ({ children, className, label = "Show options", ...props }, ref) => {
    const ariaProps = props as unknown as AriaButtonProps;
    return (
      <AriaButton
        {...ariaProps}
        ref={ref}
        data-slot="combobox-trigger"
        aria-label={props["aria-label"] ?? label}
        className={classes("mrg-combobox__trigger", className)}
      >
        {children ?? <span aria-hidden="true">⌄</span>}
      </AriaButton>
    );
  },
);

export interface ComboboxPopoverProps extends HTMLAttributes<HTMLElement> {
  readonly className?: string;
  readonly placement?: "bottom" | "bottom start" | "bottom end" | "top" | "top start" | "top end";
  readonly offset?: number;
}

export const ComboboxPopover = forwardRef<HTMLElement, ComboboxPopoverProps>(
  ({ className, placement = "bottom start", offset = 6, ...props }, ref) => {
    const ariaProps = props as unknown as AriaPopoverProps;
    return (
      <AriaPopover
        {...ariaProps}
        ref={ref}
        placement={placement}
        offset={offset}
        data-slot="combobox-popover"
        className={classes("mrg-combobox__popover", className)}
      />
    );
  },
);

export interface ComboboxListBoxProps<T extends object = Record<string, unknown>> {
  readonly children: ReactNode | ((item: T) => ReactElement);
  readonly items?: Iterable<T>;
  readonly emptyContent?: ReactNode;
  readonly className?: string;
  readonly "aria-label"?: string;
}

function ComboboxListBoxInner<T extends object>(
  {
    children,
    items,
    emptyContent = "No results",
    className,
    "aria-label": ariaLabel,
  }: ComboboxListBoxProps<T>,
  ref: ForwardedRef<HTMLDivElement>,
): ReactElement {
  const ariaProps: AriaListBoxProps<T> = {
    children,
    className: classes("mrg-combobox__listbox", className),
    renderEmptyState: () => <div className="mrg-combobox__empty">{emptyContent}</div>,
    ...(items !== undefined ? { items } : {}),
    ...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {}),
  };
  return <AriaListBox<T> {...ariaProps} ref={ref} data-slot="combobox-listbox" />;
}

export interface ComboboxListBoxComponent {
  <T extends object = Record<string, unknown>>(
    props: ComboboxListBoxProps<T> & RefAttributes<HTMLDivElement>,
  ): ReactElement | null;
}

export const ComboboxListBox = forwardRef(ComboboxListBoxInner) as ComboboxListBoxComponent;

export interface ComboboxItemState {
  readonly isDisabled: boolean;
  readonly isFocused: boolean;
  readonly isFocusVisible: boolean;
  readonly isHovered: boolean;
  readonly isPressed: boolean;
  readonly isSelected: boolean;
}

export interface ComboboxItemProps<T extends object = Record<string, unknown>> {
  readonly id?: ComboboxKey;
  readonly value?: T;
  readonly textValue?: string;
  readonly isDisabled?: boolean;
  readonly className?: string;
  readonly children: ReactNode | ((state: ComboboxItemState) => ReactNode);
  readonly "aria-label"?: string;
}

function itemState(state: ListBoxItemRenderProps): ComboboxItemState {
  return {
    isDisabled: state.isDisabled,
    isFocused: state.isFocused,
    isFocusVisible: state.isFocusVisible,
    isHovered: state.isHovered,
    isPressed: state.isPressed,
    isSelected: state.isSelected,
  };
}

function ComboboxItemInner<T extends object>(
  {
    id,
    value,
    textValue,
    isDisabled,
    className,
    children,
    "aria-label": ariaLabel,
  }: ComboboxItemProps<T>,
  ref: ForwardedRef<HTMLDivElement>,
): ReactElement {
  const resolvedTextValue =
    textValue ??
    (typeof children === "string" || typeof children === "number" ? String(children) : undefined);
  const ariaProps: AriaListBoxItemProps<T> = {
    children: (state) => (
      <>
        <span className="mrg-combobox__item-content">
          {typeof children === "function" ? children(itemState(state)) : children}
        </span>
        <span className="mrg-combobox__check" aria-hidden="true">
          ✓
        </span>
      </>
    ),
    className: classes("mrg-combobox__item", className),
    ...(id !== undefined ? { id } : {}),
    ...(value !== undefined ? { value } : {}),
    ...(resolvedTextValue !== undefined ? { textValue: resolvedTextValue } : {}),
    ...(isDisabled !== undefined ? { isDisabled } : {}),
    ...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {}),
  };
  return <AriaListBoxItem<T> {...ariaProps} ref={ref} data-slot="combobox-item" />;
}

export interface ComboboxItemComponent {
  <T extends object = Record<string, unknown>>(
    props: ComboboxItemProps<T> & RefAttributes<HTMLDivElement>,
  ): ReactElement | null;
}

export const ComboboxItem = forwardRef(ComboboxItemInner) as ComboboxItemComponent;

export interface ComboboxSectionProps {
  readonly id?: ComboboxKey;
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

function ComboboxSectionInner(
  { id, title, children, className }: ComboboxSectionProps,
  ref: ForwardedRef<HTMLElement>,
): ReactElement {
  const sectionProps = id === undefined ? {} : { id };
  return (
    <AriaListBoxSection<Record<string, unknown>>
      {...sectionProps}
      ref={ref}
      data-slot="combobox-section"
      className={classes("mrg-combobox__section", className)}
    >
      <AriaHeader data-slot="combobox-section-header" className="mrg-combobox__section-header">
        {title}
      </AriaHeader>
      {children}
    </AriaListBoxSection>
  );
}

export const ComboboxSection = forwardRef<HTMLElement, ComboboxSectionProps>(ComboboxSectionInner);

export interface ComboboxDescriptionProps extends HTMLAttributes<HTMLElement> {
  readonly className?: string;
}

export const ComboboxDescription = forwardRef<HTMLElement, ComboboxDescriptionProps>(
  ({ className, ...props }, ref) => (
    <AriaText
      {...props}
      ref={ref}
      slot="description"
      data-slot="combobox-description"
      className={classes("mrg-combobox__description", className)}
    />
  ),
);

export interface ComboboxErrorMessageProps extends HTMLAttributes<HTMLElement> {
  readonly className?: string;
}

export const ComboboxErrorMessage = forwardRef<HTMLElement, ComboboxErrorMessageProps>(
  ({ className, ...props }, ref) => {
    const ariaProps = props as unknown as AriaFieldErrorProps;
    return (
      <AriaFieldError
        {...ariaProps}
        ref={ref}
        data-slot="combobox-error-message"
        className={classes("mrg-combobox__error", className)}
      />
    );
  },
);

ComboboxLabel.displayName = "Combobox.Label";
ComboboxInput.displayName = "Combobox.Input";
ComboboxTrigger.displayName = "Combobox.Trigger";
ComboboxPopover.displayName = "Combobox.Popover";
ComboboxDescription.displayName = "Combobox.Description";
ComboboxErrorMessage.displayName = "Combobox.ErrorMessage";

export const Combobox = {
  Root: ComboboxRoot,
  Label: ComboboxLabel,
  Input: ComboboxInput,
  Trigger: ComboboxTrigger,
  Popover: ComboboxPopover,
  ListBox: ComboboxListBox,
  Section: ComboboxSection,
  Item: ComboboxItem,
  Description: ComboboxDescription,
  ErrorMessage: ComboboxErrorMessage,
} as const;
