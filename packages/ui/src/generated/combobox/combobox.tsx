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
  ComboBoxStateContext as AriaComboBoxStateContext,
} from "react-aria-components/ComboBox";
import { Header as AriaHeader } from "react-aria-components/Header";
import {
  createContext,
  forwardRef,
  useContext,
  type ButtonHTMLAttributes,
  type ForwardedRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
} from "react";

/** Canonical string or safe numeric identity accepted by compound combobox items. */
export type ComboboxKey = string | number;
/** Interaction channel allowed to open the compound combobox menu. */
export type ComboboxMenuTrigger = "focus" | "input" | "manual";

export interface ComboboxValueChangeDetail {
  /** Selection interaction that committed the next canonical key. */
  readonly reason: "selection";
}

export interface ComboboxInputChangeDetail {
  /** Direct input edit that committed the next search text. */
  readonly reason: "input";
}

export interface ComboboxOpenChangeDetail {
  /** Focus, input, manual, or dismiss interaction that changed popup visibility. */
  readonly reason: ComboboxMenuTrigger | "dismiss";
}

interface ComboboxRootContextValue {
  /** Whether the root blocks all child-control interaction. */
  readonly disabled: boolean;
  /** Whether the root preserves interaction while blocking value changes. */
  readonly readOnly: boolean;
}

const ComboboxRootContext = createContext<ComboboxRootContextValue | null>(null);

export interface ComboboxRootProps {
  /** Compound Combobox parts rendered inside the React Aria collection root. */
  readonly children: ReactNode;
  /** Controlled canonical selected key, or null for no selection. */
  readonly value?: ComboboxKey | null;
  /** Initial canonical selected key for uncontrolled use and form reset. */
  readonly defaultValue?: ComboboxKey | null;
  /** Reports canonical key selection with a stable interaction detail. */
  readonly onValueChange?: (value: ComboboxKey | null, detail: ComboboxValueChangeDetail) => void;
  /** Controlled input text used for search and optional custom values. */
  readonly inputValue?: string;
  /** Initial input text for uncontrolled use. */
  readonly defaultInputValue?: string;
  /** Reports direct input edits with a stable interaction detail. */
  readonly onInputValueChange?: (value: string, detail: ComboboxInputChangeDetail) => void;
  /** Reports popup visibility and the focus, input, manual, or dismiss reason. */
  readonly onOpenChange?: (open: boolean, detail: ComboboxOpenChangeDetail) => void;
  /** Allows unlisted input text to remain a valid value; false requires collection selection. */
  readonly allowsCustomValue?: boolean;
  /** Allows the popup to open with no items; false uses the library's normal empty handling. */
  readonly allowsEmptyCollection?: boolean;
  /** Focus, input, or manual interaction that opens the listbox. */
  readonly menuTrigger?: ComboboxMenuTrigger;
  /** Canonical keys kept visible while removed from selection and focus. */
  readonly disabledKeys?: Iterable<ComboboxKey>;
  /** Disables input, trigger, clear, selection, and native form interaction. */
  readonly isDisabled?: boolean;
  /** Preserves navigation while blocking input, clear, and selection changes. */
  readonly isReadOnly?: boolean;
  /** Requires a non-empty value through the configured validation behavior. */
  readonly isRequired?: boolean;
  /** Exposes invalid semantics and the Mergora validation treatment. */
  readonly isInvalid?: boolean;
  /** Native form field name managed by the React Aria combobox root. */
  readonly name?: string;
  /** Chooses whether native form serialization submits the selected key or input text. */
  readonly formValue?: "key" | "text";
  /** Chooses browser-native constraint validation or ARIA-only validation semantics. */
  readonly validationBehavior?: "aria" | "native";
  /** Additional class name merged onto the root element. */
  readonly className?: string;
  /** Direct accessible name used when no visible Combobox.Label is rendered. */
  readonly "aria-label"?: string;
  /** Id reference supplying the accessible name from external visible content. */
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
    <ComboboxRootContext.Provider
      value={{ disabled: isDisabled === true, readOnly: isReadOnly === true }}
    >
      <AriaComboBox<Record<string, unknown>, "single">
        {...ariaProps}
        ref={ref}
        data-slot="combobox-root"
      />
    </ComboboxRootContext.Provider>
  );
}

export const ComboboxRoot = forwardRef<HTMLDivElement, ComboboxRootProps>(ComboboxRootInner);

export interface ComboboxLabelProps extends HTMLAttributes<HTMLLabelElement> {
  /** Additional class name merged onto the visible label element. */
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
  /** Additional class name merged onto the native combobox input. */
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
  /** Additional class name merged onto the popup trigger button. */
  readonly className?: string;
  /** Localized accessible name used when aria-label is not supplied. */
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

export interface ComboboxClearProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "type"
> {
  /** Additional class name merged onto the clear action button. */
  readonly className?: string;
  /** Localized accessible name; the clear part is omitted entirely unless composed. */
  readonly label?: string;
}

export const ComboboxClear = forwardRef<HTMLButtonElement, ComboboxClearProps>(
  ({ children, className, disabled, label = "Clear selection", onClick, ...props }, ref) => {
    const root = useContext(ComboboxRootContext);
    const state = useContext(AriaComboBoxStateContext);
    if (root === null) throw new Error("Mergora Combobox.Clear requires Combobox.Root.");
    // React Aria renders compound children once without state while building the option collection.
    // The clear control is not a collection node and must remain absent from that inert pass.
    if (state === null) return null;
    const accessibleLabel = props["aria-label"] ?? label;
    if (accessibleLabel.trim().length === 0) {
      throw new Error("Mergora Combobox.Clear label must be non-empty.");
    }
    const isEmpty = state.inputValue.length === 0 && state.selectedKey === null;
    return (
      <button
        {...props}
        aria-label={accessibleLabel}
        className={classes("mrg-combobox__clear", className)}
        data-slot="combobox-clear"
        disabled={disabled === true || root.disabled || root.readOnly || isEmpty}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          state.setSelectedKey(null);
          state.setInputValue("");
          state.close();
        }}
        ref={ref}
        type="button"
      >
        {children ?? <span aria-hidden="true">{"\u00d7"}</span>}
      </button>
    );
  },
);

export interface ComboboxPopoverProps extends HTMLAttributes<HTMLElement> {
  /** Additional class name merged onto the listbox popover. */
  readonly className?: string;
  /** Logical preferred popover placement with automatic collision handling. */
  readonly placement?: "bottom" | "bottom start" | "bottom end" | "top" | "top start" | "top end";
  /** Distance in pixels between the trigger and popover; defaults to six. */
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
  /** Static option parts or a renderer for each item supplied through items. */
  readonly children: ReactNode | ((item: T) => ReactElement);
  /** Optional iterable model used for dynamic collection rendering. */
  readonly items?: Iterable<T>;
  /** Visible non-interactive result rendered when the collection is empty. */
  readonly emptyContent?: ReactNode;
  /** Additional class name merged onto the listbox element. */
  readonly className?: string;
  /** Direct accessible name when the listbox needs a name separate from the root label. */
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

/** Generic ref-aware call signature preserved by the forwarded ListBox implementation. */
export interface ComboboxListBoxComponent {
  <T extends object = Record<string, unknown>>(
    props: ComboboxListBoxProps<T> & RefAttributes<HTMLDivElement>,
  ): ReactElement | null;
}

export const ComboboxListBox = forwardRef(ComboboxListBoxInner) as ComboboxListBoxComponent;

export interface ComboboxItemState {
  /** Whether the item is unavailable for selection. */
  readonly isDisabled: boolean;
  /** Whether the item currently owns composite focus. */
  readonly isFocused: boolean;
  /** Whether focus should receive the keyboard-visible treatment. */
  readonly isFocusVisible: boolean;
  /** Whether a pointing device currently hovers the item. */
  readonly isHovered: boolean;
  /** Whether the item is currently pressed. */
  readonly isPressed: boolean;
  /** Whether the item matches the root's canonical selected key. */
  readonly isSelected: boolean;
}

export interface ComboboxItemProps<T extends object = Record<string, unknown>> {
  /** Stable canonical item key; inferred by React Aria when omitted in dynamic collections. */
  readonly id?: ComboboxKey;
  /** Consumer-owned item model used by dynamic collection rendering. */
  readonly value?: T;
  /** Plain localized text used for typeahead and accessible naming. */
  readonly textValue?: string;
  /** Keeps the item visible while removing it from focus and selection. */
  readonly isDisabled?: boolean;
  /** Additional class name merged onto the option element. */
  readonly className?: string;
  /** Static content or state renderer for the option's visible content. */
  readonly children: ReactNode | ((state: ComboboxItemState) => ReactNode);
  /** Direct accessible name when visible content cannot provide one. */
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

/** Generic ref-aware call signature preserved by the forwarded Item implementation. */
export interface ComboboxItemComponent {
  <T extends object = Record<string, unknown>>(
    props: ComboboxItemProps<T> & RefAttributes<HTMLDivElement>,
  ): ReactElement | null;
}

export const ComboboxItem = forwardRef(ComboboxItemInner) as ComboboxItemComponent;

export interface ComboboxSectionProps {
  /** Stable section key for dynamic collection rendering. */
  readonly id?: ComboboxKey;
  /** Visible heading that names this group of options. */
  readonly title: ReactNode;
  /** Ordered Combobox.Item parts contained in the section. */
  readonly children: ReactNode;
  /** Additional class name merged onto the section element. */
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
  /** Additional class name merged onto the associated description element. */
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
  /** Additional class name merged onto the associated field-error element. */
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
ComboboxClear.displayName = "Combobox.Clear";
ComboboxPopover.displayName = "Combobox.Popover";
ComboboxDescription.displayName = "Combobox.Description";
ComboboxErrorMessage.displayName = "Combobox.ErrorMessage";

export const Combobox = {
  Root: ComboboxRoot,
  Label: ComboboxLabel,
  Input: ComboboxInput,
  Trigger: ComboboxTrigger,
  Clear: ComboboxClear,
  Popover: ComboboxPopover,
  ListBox: ComboboxListBox,
  Section: ComboboxSection,
  Item: ComboboxItem,
  Description: ComboboxDescription,
  ErrorMessage: ComboboxErrorMessage,
} as const;
