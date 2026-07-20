// Generated from registry/source/components/select/select.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  Button as AriaButton,
  FieldError as AriaFieldError,
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
  Text as AriaText,
  type ListBoxItemRenderProps,
} from "react-aria-components/Select";
import { Header as AriaHeader } from "react-aria-components/Header";
import { I18nProvider as AriaI18nProvider } from "react-aria-components/I18nProvider";
import { ListLayout, Virtualizer } from "react-aria-components/Virtualizer";
import {
  forwardRef,
  useCallback,
  useId,
  useRef,
  useState,
  type AriaAttributes,
  type CSSProperties,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
} from "react";

import {
  assertCollectionAsyncState,
  assertCollectionEntries,
  collectionValueFromKeys,
  flattenCollection,
  formatCollectionSelectionSummary,
  normalizeCollectionValue,
  serializeCollectionKey,
  type CollectionAsyncState,
  type CollectionEntry,
  type CollectionItem,
  type CollectionKey,
  type CollectionMessages,
  type CollectionSection,
  type CollectionSelectionSummaryContext,
  type CollectionVirtualizationOptions,
} from "../listbox/index.js";
import { NativeSelect } from "../native-select/index.js";
import { useMergoraContext } from "../provider/index.js";
import "./select.css";

/** Explicit Mergora popover or browser-native select presentation. */
export type SelectPresentation = "enhanced" | "native";
/** Logical preferred placement for the enhanced select popover. */
export type SelectPlacement =
  "bottom" | "bottom start" | "bottom end" | "top" | "top start" | "top end";

export interface SelectProps<T = unknown> {
  /** Validated ordered item and section models shared by enhanced and native presentations. */
  readonly entries: readonly CollectionEntry<T>[];
  /** Persistent visible label supplying the select control's accessible name. */
  readonly label: ReactNode;
  /** Controlled canonical selected key, or null for no selection. */
  readonly value?: CollectionKey | null;
  /** Initial selected key for uncontrolled use and form reset. */
  readonly defaultValue?: CollectionKey | null;
  /** Reports the next canonical selected key from either presentation. */
  readonly onValueChange?: (value: CollectionKey | null) => void;
  /** Controlled popup state accepted only by the enhanced presentation. */
  readonly open?: boolean;
  /** Initial enhanced-popup state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Reports enhanced-popup visibility changes and is unavailable in native presentation. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Optional visible guidance associated with the select control. */
  readonly description?: ReactNode;
  /** Optional visible validation message rendered as an alert. */
  readonly errorMessage?: ReactNode;
  /** Applies invalid styling and aria-invalid when no explicit aria-invalid is supplied. */
  readonly invalid?: boolean;
  /** Requires a non-placeholder selection through the configured validation behavior. */
  readonly required?: boolean;
  /** Disables popup activation and native form interaction. */
  readonly disabled?: boolean;
  /** Native form field name used directly by either presentation. */
  readonly name?: string;
  /** Native form owner id used directly by either presentation. */
  readonly form?: string;
  /** Browser autofill hint forwarded to the enhanced or native form control. */
  readonly autoComplete?: string;
  /** Chooses browser-native constraint validation or ARIA-only validation semantics. */
  readonly validationBehavior?: "native" | "aria";
  /** Explicit enhanced or platform-native control; native removes custom popup and open-state behavior. */
  readonly presentation?: SelectPresentation;
  /** Localized text shown when no value is selected. */
  readonly placeholder?: string;
  /** Optional loading, pagination, and recovery state; omitting it removes async controls. */
  readonly asyncState?: CollectionAsyncState;
  /** Localized overrides for empty, loading, load-more, and retry copy. */
  readonly messages?: Partial<CollectionMessages>;
  /** Enables measured enhanced-list virtualization; omitting it renders the normal collection. */
  readonly virtualization?: CollectionVirtualizationOptions;
  /** Pass false to remove the summary callback, text, id, and aria-describedby contribution. */
  readonly formatSelectionSummary?:
    false | ((context: CollectionSelectionSummaryContext) => string);
  /** Logical enhanced-popover placement; native presentation leaves placement to the browser. */
  readonly placement?: SelectPlacement;
  /** Stable root id used to derive control, description, error, and summary ids. */
  readonly id?: string;
  /** Class name applied to the outer select field wrapper. */
  readonly className?: string;
  /** Inline style applied to the outer select field wrapper. */
  readonly style?: CSSProperties;
  /** Additional class name applied only to the enhanced popover. */
  readonly popoverClassName?: string;
  /** Additional class name applied only to the enhanced listbox. */
  readonly listboxClassName?: string;
  /** Additional description ids merged with component-owned description and summary ids. */
  readonly "aria-describedby"?: string;
  /** Explicit validation-message id; defaults to the component-owned error element. */
  readonly "aria-errormessage"?: string;
  /** Explicit ARIA invalid state overriding the invalid boolean. */
  readonly "aria-invalid"?: AriaAttributes["aria-invalid"];
}

const DEFAULT_MESSAGES: CollectionMessages = {
  empty: "No options available.",
  loading: "Loading options...",
  loadingMore: "Loading more options...",
  loadMore: "Load more options",
  retry: "Retry loading options",
};
const MAX_MESSAGE_CODE_POINTS = 1_024;
const MAX_SELECTION_SUMMARY_ITEMS = 12;

function codePointLength(value: string): number {
  return [...value].length;
}

function assertMessage(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`Mergora Select ${label} must not be empty.`);
  }
  if (codePointLength(value) > MAX_MESSAGE_CODE_POINTS) {
    throw new RangeError(
      `Mergora Select ${label} must not exceed ${String(MAX_MESSAGE_CODE_POINTS)} Unicode code points.`,
    );
  }
}

function isSection<T>(entry: CollectionEntry<T>): entry is CollectionSection<T> {
  return entry.type === "section";
}

function renderEnhancedItem<T>(item: CollectionItem<T>): ReactElement {
  return (
    <AriaListBoxItem<CollectionItem<T>>
      {...(item.disabled === undefined ? {} : { isDisabled: item.disabled })}
      className="mrg-select-item"
      data-slot="select-item"
      id={item.key}
      key={item.key}
      textValue={item.textValue}
      value={item}
    >
      {(state: ListBoxItemRenderProps) => (
        <>
          <span className="mrg-select-item-copy" data-slot="select-item-copy">
            <AriaText data-slot="select-item-label" dir="auto" slot="label">
              {item.label ?? item.textValue}
            </AriaText>
            {item.description === undefined ? null : (
              <AriaText data-slot="select-item-description" dir="auto" slot="description">
                {item.description}
              </AriaText>
            )}
          </span>
          <span aria-hidden="true" data-slot="select-item-check">
            {state.isSelected ? "✓" : ""}
          </span>
        </>
      )}
    </AriaListBoxItem>
  );
}

function renderEnhancedEntries<T>(entries: readonly CollectionEntry<T>[]): readonly ReactElement[] {
  return entries.map((entry) => {
    if (!isSection(entry)) return renderEnhancedItem(entry);
    return (
      <AriaListBoxSection<CollectionItem<T>>
        className="mrg-select-section"
        data-slot="select-section"
        id={entry.key}
        key={entry.key}
      >
        <AriaHeader className="mrg-select-section-header" data-slot="select-section-header">
          <span dir="auto">{entry.label ?? entry.textValue}</span>
        </AriaHeader>
        {entry.items.map((item) => renderEnhancedItem(item))}
      </AriaListBoxSection>
    );
  });
}

function renderNativeEntries<T>(entries: readonly CollectionEntry<T>[]): readonly ReactElement[] {
  return entries.map((entry) => {
    if (!isSection(entry)) {
      return (
        <option disabled={entry.disabled} key={entry.key} value={serializeCollectionKey(entry.key)}>
          {entry.textValue}
        </option>
      );
    }
    return (
      <optgroup key={entry.key} label={entry.textValue}>
        {entry.items.map((item) => (
          <option disabled={item.disabled} key={item.key} value={serializeCollectionKey(item.key)}>
            {item.textValue}
          </option>
        ))}
      </optgroup>
    );
  });
}

function assertNativeEntries<T>(entries: readonly CollectionEntry<T>[]): void {
  for (const item of flattenCollection(entries)) {
    if (item.description !== undefined) {
      throw new TypeError(
        "Mergora Select native presentation does not silently discard item descriptions. Remove them or use enhanced presentation.",
      );
    }
  }
}

function selectionKeys<T>(
  value: CollectionKey | null | readonly CollectionKey[] | undefined,
  entries: readonly CollectionEntry<T>[],
): readonly CollectionKey[] {
  if (value === undefined) return [];
  return normalizeCollectionValue("single", value, entries);
}

function selectionSummary<T>(input: {
  readonly entries: readonly CollectionEntry<T>[];
  readonly format: (context: CollectionSelectionSummaryContext) => string;
  readonly keys: readonly CollectionKey[];
  readonly locale: string;
}): string | null {
  if (input.keys.length === 0) return null;
  const selected = new Set(input.keys);
  const textValues = flattenCollection(input.entries)
    .filter((item) => selected.has(item.key))
    .map((item) => item.textValue);
  const visibleTextValues = textValues.slice(0, MAX_SELECTION_SUMMARY_ITEMS);
  const summary = input.format({
    count: textValues.length,
    locale: input.locale,
    omittedCount: Math.max(0, textValues.length - visibleTextValues.length),
    visibleTextValues,
  });
  assertMessage(summary, "selection summary");
  return summary;
}

function asyncControls(
  asyncState: CollectionAsyncState | undefined,
  messages: CollectionMessages,
): ReactElement | null {
  if (asyncState?.status === "error") {
    return (
      <div className="mrg-select-async" data-slot="select-async-error" role="alert">
        <span>{asyncState.errorMessage}</span>
        <button onClick={asyncState.onRetry} type="button">
          {messages.retry}
        </button>
      </div>
    );
  }
  if (asyncState?.hasMore === true) {
    return (
      <button
        aria-busy={asyncState.status === "loading-more" || undefined}
        className="mrg-select-load-more"
        data-slot="select-load-more"
        disabled={asyncState.status === "loading-more"}
        onClick={asyncState.onLoadMore}
        type="button"
      >
        {asyncState.status === "loading-more" ? messages.loadingMore : messages.loadMore}
      </button>
    );
  }
  return null;
}

function setForwardedRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null) ref.current = value;
}

function SelectInner<T>(props: SelectProps<T>, ref: ForwardedRef<HTMLDivElement>): ReactElement {
  const {
    "aria-describedby": ariaDescribedBy,
    "aria-errormessage": ariaErrorMessage,
    "aria-invalid": ariaInvalid,
    asyncState,
    autoComplete,
    className,
    defaultOpen,
    defaultValue,
    description,
    disabled = false,
    entries,
    errorMessage,
    form,
    formatSelectionSummary,
    id,
    invalid = false,
    label,
    listboxClassName,
    messages: messageOverrides,
    name,
    onOpenChange,
    onValueChange,
    open,
    placement = "bottom start",
    placeholder,
    popoverClassName,
    presentation = "enhanced",
    required = false,
    style,
    validationBehavior = "native",
    value,
    virtualization,
  } = props;
  assertCollectionEntries(entries);
  assertCollectionAsyncState(asyncState);
  if (label === null || label === undefined || typeof label === "boolean") {
    throw new TypeError("Mergora Select requires a persistent visible label.");
  }
  if (name !== undefined) assertMessage(name, "form name");
  if (placeholder !== undefined) assertMessage(placeholder, "placeholder");
  if (value !== undefined) {
    normalizeCollectionValue(
      "single",
      value as CollectionKey | null | readonly CollectionKey[],
      entries,
    );
  }
  if (defaultValue !== undefined) {
    normalizeCollectionValue(
      "single",
      defaultValue as CollectionKey | null | readonly CollectionKey[],
      entries,
    );
  }
  if (virtualization !== undefined) {
    const itemSize = virtualization.estimatedItemSize ?? 48;
    const headingSize = virtualization.estimatedSectionHeaderSize ?? 40;
    if (itemSize < 32 || itemSize > 256 || headingSize < 24 || headingSize > 256) {
      throw new RangeError(
        "Mergora Select virtualization estimates must be between 32/24 and 256 pixels.",
      );
    }
  }

  const { direction, locale, portalContainer } = useMergoraContext();
  const generatedId = `mrg-select-${useId().replaceAll(":", "")}`;
  const rootId = id ?? generatedId;
  const controlId = `${rootId}-control`;
  const descriptionId = description === undefined ? undefined : `${rootId}-description`;
  const errorId = errorMessage === undefined ? undefined : `${rootId}-error`;
  const summaryId = `${rootId}-selection-summary`;
  const messages = { ...DEFAULT_MESSAGES, ...messageOverrides };
  for (const [key, message] of Object.entries(messages)) assertMessage(message, `message ${key}`);
  const controlled = value !== undefined;
  const initialEnhancedValue = useRef<CollectionKey | null>(defaultValue ?? null);
  const [uncontrolledEnhancedValue, setUncontrolledEnhancedValue] = useState<CollectionKey | null>(
    initialEnhancedValue.current,
  );
  const enhancedValue = controlled ? (value ?? null) : uncontrolledEnhancedValue;
  const disabledKeys = new Set(
    flattenCollection(entries)
      .filter((item) => item.disabled === true)
      .map((item) => item.key),
  );
  const setRootElement = useCallback(
    (element: HTMLDivElement | null) => {
      setForwardedRef(ref, element);
    },
    [ref],
  );
  const selectedKeys = selectionKeys(
    (presentation === "enhanced" ? enhancedValue : value) as
      CollectionKey | null | readonly CollectionKey[] | undefined,
    entries,
  );
  const resolvedSummaryFormatter =
    formatSelectionSummary === undefined
      ? formatCollectionSelectionSummary
      : formatSelectionSummary;
  const summary =
    resolvedSummaryFormatter === false || (presentation === "native" && value === undefined)
      ? null
      : selectionSummary({
          entries,
          format: resolvedSummaryFormatter,
          keys: selectedKeys,
          locale,
        });
  const resolvedPlaceholder = placeholder ?? "Select an option";
  const describedBy = [ariaDescribedBy, descriptionId, summary === null ? undefined : summaryId]
    .filter((candidate): candidate is string => candidate !== undefined && candidate.length > 0)
    .join(" ");
  const enhancedDescribedBy = [ariaDescribedBy, summary === null ? undefined : summaryId]
    .filter((candidate): candidate is string => candidate !== undefined && candidate.length > 0)
    .join(" ");
  const resolvedInvalid =
    ariaInvalid === true ||
    ariaInvalid === "true" ||
    ariaInvalid === "grammar" ||
    ariaInvalid === "spelling" ||
    invalid;

  if (presentation === "native") {
    if (virtualization !== undefined) {
      throw new TypeError(
        "Mergora Select native presentation uses the platform picker and cannot be virtualized.",
      );
    }
    if (open !== undefined || defaultOpen !== undefined || onOpenChange !== undefined) {
      throw new TypeError(
        "Mergora Select native presentation leaves popup state to the browser and does not accept open-state props.",
      );
    }
    assertNativeEntries(entries);
    const keyBySerializedValue = new Map(
      flattenCollection(entries).map(
        (item) => [serializeCollectionKey(item.key), item.key] as const,
      ),
    );
    const controlledKeys =
      value === undefined
        ? undefined
        : normalizeCollectionValue(
            "single",
            value as CollectionKey | null | readonly CollectionKey[],
            entries,
          );
    const defaultKeys = normalizeCollectionValue(
      "single",
      defaultValue as CollectionKey | null | readonly CollectionKey[] | undefined,
      entries,
    );
    const nativeValue = controlledKeys?.map(serializeCollectionKey);
    const nativeDefaultValue = defaultKeys.map(serializeCollectionKey);
    return (
      <div
        className={className === undefined ? "mrg-select" : `mrg-select ${className}`}
        data-disabled={disabled || undefined}
        data-invalid={resolvedInvalid || undefined}
        data-presentation="native"
        data-slot="select"
        id={rootId}
        ref={setRootElement}
        style={style}
      >
        <label className="mrg-select-label" data-slot="select-label" htmlFor={controlId}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
        {description === undefined ? null : (
          <span data-slot="select-description" id={descriptionId}>
            {description}
          </span>
        )}
        <NativeSelect
          aria-busy={asyncState?.status === "loading" || asyncState?.status === "loading-more"}
          aria-describedby={describedBy || undefined}
          aria-errormessage={ariaErrorMessage ?? errorId}
          aria-invalid={resolvedInvalid || undefined}
          autoComplete={autoComplete}
          className="mrg-select-native-control"
          {...(nativeValue === undefined
            ? { defaultValue: nativeDefaultValue[0] ?? "" }
            : { value: nativeValue[0] ?? "" })}
          disabled={disabled}
          form={form}
          id={controlId}
          invalid={resolvedInvalid}
          multiple={false}
          name={name}
          onChange={(event) => {
            const serializedValues =
              event.currentTarget.value === "" ? [] : [event.currentTarget.value];
            const nextKeys = serializedValues.map((serialized) => {
              const key = keyBySerializedValue.get(serialized);
              if (key === undefined) {
                throw new RangeError(
                  `Mergora Select received an unknown native option value: ${JSON.stringify(serialized)}.`,
                );
              }
              return key;
            });
            onValueChange?.(
              collectionValueFromKeys("single", nextKeys, entries) as CollectionKey | null,
            );
          }}
          required={required}
        >
          <option disabled={required} value="">
            {resolvedPlaceholder}
          </option>
          {asyncState?.status === "loading" && entries.length === 0 ? (
            <option disabled value="">
              {messages.loading}
            </option>
          ) : null}
          {renderNativeEntries(entries)}
        </NativeSelect>
        {summary === null ? null : (
          <span
            className="mrg-collection-visually-hidden"
            data-slot="select-selection-summary"
            id={summaryId}
          >
            {summary}
          </span>
        )}
        {errorMessage === undefined ? null : (
          <span data-slot="select-error" id={errorId} role="alert">
            {errorMessage}
          </span>
        )}
        {asyncControls(asyncState, messages)}
      </div>
    );
  }

  const listbox = (
    <AriaListBox<CollectionItem<T>>
      aria-busy={asyncState?.status === "loading" || asyncState?.status === "loading-more"}
      className={
        listboxClassName === undefined
          ? "mrg-select-listbox"
          : `mrg-select-listbox ${listboxClassName}`
      }
      data-slot="select-listbox"
      data-virtualized={virtualization === undefined ? undefined : true}
      renderEmptyState={() => (
        <span className="mrg-select-empty" data-slot="select-empty">
          {asyncState?.status === "loading" ? messages.loading : messages.empty}
        </span>
      )}
    >
      {renderEnhancedEntries(entries)}
    </AriaListBox>
  );

  return (
    <AriaI18nProvider locale={locale}>
      <div
        className={className === undefined ? "mrg-select" : `mrg-select ${className}`}
        data-disabled={disabled || undefined}
        data-invalid={resolvedInvalid || undefined}
        data-presentation="enhanced"
        data-slot="select"
        id={rootId}
        ref={setRootElement}
        style={style}
      >
        <AriaSelect<CollectionItem<T>>
          {...(enhancedDescribedBy.length === 0 ? {} : { "aria-describedby": enhancedDescribedBy })}
          {...((ariaErrorMessage ?? errorId) === undefined
            ? {}
            : { "aria-errormessage": ariaErrorMessage ?? errorId })}
          {...(ariaInvalid === undefined ? {} : { "aria-invalid": ariaInvalid })}
          {...(autoComplete === undefined ? {} : { autoComplete })}
          {...(defaultOpen === undefined ? {} : { defaultOpen })}
          disabledKeys={disabledKeys}
          {...(form === undefined ? {} : { form })}
          {...(open === undefined ? {} : { isOpen: open })}
          {...(name === undefined ? {} : { name })}
          {...(onOpenChange === undefined ? {} : { onOpenChange })}
          value={enhancedValue}
          allowsEmptyCollection={asyncState !== undefined || entries.length === 0}
          className="mrg-select-control"
          data-slot="select-control"
          id={controlId}
          isDisabled={disabled}
          isInvalid={resolvedInvalid}
          isRequired={required}
          onChange={(next) => {
            const nextKeys = normalizeCollectionValue("single", next, entries);
            if (disabled || nextKeys.some((key) => disabledKeys.has(key))) return;
            const nextValue = collectionValueFromKeys(
              "single",
              nextKeys,
              entries,
            ) as CollectionKey | null;
            if (!controlled) setUncontrolledEnhancedValue(nextValue);
            onValueChange?.(nextValue);
          }}
          placeholder={resolvedPlaceholder}
          validationBehavior={validationBehavior}
        >
          <AriaLabel className="mrg-select-label" data-slot="select-label">
            {label}
            {required ? <span aria-hidden="true"> *</span> : null}
          </AriaLabel>
          {description === undefined ? null : (
            <AriaText
              className="mrg-select-description"
              data-slot="select-description"
              slot="description"
            >
              {description}
            </AriaText>
          )}
          <AriaButton className="mrg-select-trigger" data-slot="select-trigger">
            <AriaSelectValue className="mrg-select-value" data-slot="select-value">
              {({ isPlaceholder, selectedText }) =>
                isPlaceholder ? resolvedPlaceholder : selectedText
              }
            </AriaSelectValue>
            <span aria-hidden="true" data-slot="select-indicator">
              ▾
            </span>
          </AriaButton>
          <AriaPopover
            {...(portalContainer === null ? {} : { UNSTABLE_portalContainer: portalContainer })}
            className={
              popoverClassName === undefined
                ? "mrg-select-popover"
                : `mrg-select-popover ${popoverClassName}`
            }
            containerPadding={12}
            data-slot="select-popover"
            dir={direction}
            lang={locale}
            offset={6}
            placement={placement}
            shouldFlip
          >
            {virtualization === undefined ? (
              listbox
            ) : (
              <Virtualizer
                layout={ListLayout}
                layoutOptions={{
                  estimatedHeadingSize: virtualization.estimatedSectionHeaderSize ?? 40,
                  estimatedRowSize: virtualization.estimatedItemSize ?? 48,
                }}
              >
                {listbox}
              </Virtualizer>
            )}
            {asyncState?.status === "error" ? null : asyncControls(asyncState, messages)}
          </AriaPopover>
          {errorMessage === undefined ? null : (
            <AriaFieldError
              {...(errorId === undefined ? {} : { id: errorId })}
              className="mrg-select-error"
              data-slot="select-error"
            >
              {errorMessage}
            </AriaFieldError>
          )}
        </AriaSelect>
        {asyncState?.status === "error" ? asyncControls(asyncState, messages) : null}
        {summary === null ? null : (
          <span
            className="mrg-collection-visually-hidden"
            data-slot="select-selection-summary"
            id={summaryId}
          >
            {summary}
          </span>
        )}
      </div>
    </AriaI18nProvider>
  );
}

/** Generic ref-aware call signature preserved by the forwarded Select implementation. */
export interface SelectComponent {
  <T = unknown>(props: SelectProps<T> & RefAttributes<HTMLDivElement>): ReactElement | null;
}

const SelectForwardRef = forwardRef(SelectInner);
SelectForwardRef.displayName = "Select";
export const Select = SelectForwardRef as SelectComponent;
