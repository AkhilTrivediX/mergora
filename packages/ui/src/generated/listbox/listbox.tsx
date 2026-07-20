// Generated from registry/source/components/listbox/listbox.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Text as AriaText,
  type ListBoxItemRenderProps,
  type Selection,
} from "react-aria-components/ListBox";
import { Header as AriaHeader } from "react-aria-components/Header";
import { I18nProvider as AriaI18nProvider } from "react-aria-components/I18nProvider";
import { ListLayout, Virtualizer } from "react-aria-components/Virtualizer";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type AriaAttributes,
  type CSSProperties,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefAttributes,
} from "react";

import { useMergoraContext } from "../provider/index.js";
import "./listbox.css";

export type CollectionKey = string | number;
export type CollectionSelectionMode = "single" | "multiple";
export type CollectionValue<M extends CollectionSelectionMode> = M extends "single"
  ? CollectionKey | null
  : readonly CollectionKey[];
export type CollectionChangeValue<M extends CollectionSelectionMode> = M extends "single"
  ? CollectionKey | null
  : CollectionKey[];

export interface CollectionItem<T = unknown> {
  /** Optional discriminator; omitted entries are treated as individual items. */
  readonly type?: "item";
  /** Stable identity and canonical form value. String and number spellings may not collide. */
  readonly key: CollectionKey;
  /** Plain localized text used by typeahead, native options, and accessible summaries. */
  readonly textValue: string;
  /** Rich enhanced-mode rendering. Native Select intentionally uses textValue instead. */
  readonly label?: ReactNode;
  /** Optional supporting content announced with the item's accessible label. */
  readonly description?: ReactNode;
  /** Removes the item from selection and keyboard activation. */
  readonly disabled?: boolean;
  /** Consumer-owned model retained with this collection item. */
  readonly value?: T;
}

export interface CollectionSection<T = unknown> {
  /** Required discriminator identifying this entry as a grouped section. */
  readonly type: "section";
  /** Stable section identity that must not collide with item or section keys. */
  readonly key: CollectionKey;
  /** Plain localized section text used for validation and accessible fallbacks. */
  readonly textValue: string;
  /** Rich visible section heading; defaults to textValue. */
  readonly label?: ReactNode;
  /** Ordered selectable items contained in this section. */
  readonly items: readonly CollectionItem<T>[];
}

export type CollectionEntry<T = unknown> = CollectionItem<T> | CollectionSection<T>;

export interface CollectionVirtualizationOptions {
  /** Estimated pixel size only; measured content remains authoritative. */
  readonly estimatedItemSize?: number;
  /** Estimated section-heading size; measured content remains authoritative. */
  readonly estimatedSectionHeaderSize?: number;
}

export type CollectionAsyncStatus = "idle" | "loading" | "loading-more" | "error";

export interface CollectionAsyncState {
  /** Current remote-loading lifecycle state rendered by the collection. */
  readonly status: CollectionAsyncStatus;
  /** Localized recovery message required while status is error. */
  readonly errorMessage?: string;
  /** Whether another page is available and the load-more control should render. */
  readonly hasMore?: boolean;
  /** Recovery callback required by the rendered error state. */
  readonly onRetry?: () => void;
  /** Requests another page when hasMore renders the load-more control. */
  readonly onLoadMore?: () => void;
}

export interface CollectionMessages {
  /** Localized content shown when the materialized collection is empty. */
  readonly empty: string;
  /** Localized content shown while the initial collection request is pending. */
  readonly loading: string;
  /** Localized label shown while an additional page is pending. */
  readonly loadingMore: string;
  /** Localized action label used to request an additional page. */
  readonly loadMore: string;
  /** Localized action label used to retry a failed request. */
  readonly retry: string;
}

export interface CollectionSelectionSummaryContext {
  /** Complete number of currently selected entries. */
  readonly count: number;
  /** Active Mergora locale used for list and number formatting. */
  readonly locale: string;
  /** Bounded ordered text values available to the summary formatter. */
  readonly visibleTextValues: readonly string[];
  /** Number of selected entries omitted from visibleTextValues. */
  readonly omittedCount: number;
}

export interface CollectionPage<T = unknown> {
  /** Materialized entries returned for this page in their display order. */
  readonly entries: readonly CollectionEntry<T>[];
  /** Null means the complete remote collection has been loaded. */
  readonly cursor: string | null;
}

export type CollectionLoadReason = "initial" | "retry" | "load-more";

export interface CollectionLoadContext {
  /** Cursor to request, or null for the first page or full reload. */
  readonly cursor: string | null;
  /** Initial, retry, or load-more operation that initiated this request. */
  readonly reason: CollectionLoadReason;
  /** Monotonically increasing identity for suppressing stale request results. */
  readonly requestId: number;
  /** Abort signal cancelled when this request is replaced or the hook unmounts. */
  readonly signal: AbortSignal;
}

export interface UseCollectionLoaderOptions<T = unknown> {
  /** Consumer-owned asynchronous page loader receiving cursor, reason, request identity, and signal. */
  readonly load: (context: CollectionLoadContext) => Promise<CollectionPage<T>>;
  /** Already available entries retained before the first remote page arrives. */
  readonly initialEntries?: readonly CollectionEntry<T>[];
  /** Initial next-page cursor, or null when initialEntries are complete. */
  readonly initialCursor?: string | null;
  /** Starts an initial load after mount; false leaves loading under consumer control. */
  readonly autoLoad?: boolean;
  /** Converts an unknown request failure into bounded localized recovery text. */
  readonly getErrorMessage?: (error: unknown) => string;
}

export interface CollectionLoaderResult<T = unknown> {
  /** Current validated entries accumulated from successful pages. */
  readonly entries: readonly CollectionEntry<T>[];
  /** Render-ready async state with valid retry and load-more callbacks. */
  readonly asyncState: CollectionAsyncState;
  /** Aborts the current request without clearing successfully loaded entries. */
  readonly abort: () => void;
  /** Requests the current next-page cursor when one is available. */
  readonly loadMore: () => void;
  /** Clears accumulated remote entries and loads from the first page. */
  readonly reload: () => void;
  /** Repeats the operation that most recently failed. */
  readonly retry: () => void;
}

const DEFAULT_MESSAGES: CollectionMessages = {
  empty: "No options available.",
  loading: "Loading options...",
  loadingMore: "Loading more options...",
  loadMore: "Load more options",
  retry: "Retry loading options",
};

const MAX_KEY_CODE_POINTS = 256;
const MAX_TEXT_CODE_POINTS = 512;
const MAX_ERROR_CODE_POINTS = 1_024;
const MAX_SUMMARY_ITEMS = 12;

function codePointLength(value: string): number {
  return [...value].length;
}

function hasUnsafeKeyCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function assertBoundedText(value: string, label: string, maximum: number): void {
  if (value.trim().length === 0) {
    throw new RangeError(`Mergora collection ${label} must not be empty.`);
  }
  if (codePointLength(value) > maximum) {
    throw new RangeError(
      `Mergora collection ${label} must not exceed ${String(maximum)} Unicode code points.`,
    );
  }
}

export function serializeCollectionKey(key: CollectionKey): string {
  if (typeof key === "number") {
    if (!Number.isSafeInteger(key)) {
      throw new RangeError("Mergora collection numeric keys must be safe integers.");
    }
    return String(key);
  }
  assertBoundedText(key, "string keys", MAX_KEY_CODE_POINTS);
  if (key !== key.trim()) {
    throw new RangeError("Mergora collection string keys may not have surrounding whitespace.");
  }
  if (hasUnsafeKeyCharacters(key)) {
    throw new RangeError("Mergora collection string keys may not contain control characters.");
  }
  return key;
}

function isSection<T>(entry: CollectionEntry<T>): entry is CollectionSection<T> {
  return entry.type === "section";
}

export function flattenCollection<T>(
  entries: readonly CollectionEntry<T>[],
): readonly CollectionItem<T>[] {
  return entries.flatMap((entry) => (isSection(entry) ? entry.items : [entry]));
}

export function assertCollectionEntries<T>(entries: readonly CollectionEntry<T>[]): void {
  const identityKeys = new Set<CollectionKey>();
  const serializedKeys = new Set<string>();
  for (const entry of entries) {
    const serializedEntryKey = serializeCollectionKey(entry.key);
    if (identityKeys.has(entry.key)) {
      throw new RangeError(
        `Mergora collection keys must be globally unique. Duplicate key: ${JSON.stringify(entry.key)}.`,
      );
    }
    identityKeys.add(entry.key);
    if (serializedKeys.has(serializedEntryKey)) {
      throw new RangeError(
        `Mergora collection keys must remain unique after form serialization. Collision: ${JSON.stringify(serializedEntryKey)}.`,
      );
    }
    serializedKeys.add(serializedEntryKey);
    assertBoundedText(entry.textValue, "textValue", MAX_TEXT_CODE_POINTS);

    if (!isSection(entry)) continue;
    if (entry.items.length === 0) {
      throw new RangeError("Mergora collection sections must contain at least one item.");
    }
    for (const item of entry.items) {
      const serializedItemKey = serializeCollectionKey(item.key);
      if (identityKeys.has(item.key)) {
        throw new RangeError(
          `Mergora collection keys must be globally unique. Duplicate key: ${JSON.stringify(item.key)}.`,
        );
      }
      identityKeys.add(item.key);
      if (serializedKeys.has(serializedItemKey)) {
        throw new RangeError(
          `Mergora collection keys must remain unique after form serialization. Collision: ${JSON.stringify(serializedItemKey)}.`,
        );
      }
      serializedKeys.add(serializedItemKey);
      assertBoundedText(item.textValue, "item textValue", MAX_TEXT_CODE_POINTS);
    }
  }
}

function orderedItemKeys<T>(entries: readonly CollectionEntry<T>[]): readonly CollectionKey[] {
  return flattenCollection(entries).map((item) => item.key);
}

function selectedKeyArray(
  mode: CollectionSelectionMode,
  value: CollectionKey | null | readonly CollectionKey[] | undefined,
): readonly CollectionKey[] {
  if (value === undefined || value === null) return [];
  if (mode === "single") {
    if (Array.isArray(value)) {
      throw new TypeError("Mergora single-selection collections accept one key or null.");
    }
    return [value as CollectionKey];
  }
  if (!Array.isArray(value)) {
    throw new TypeError("Mergora multiple-selection collections accept an array of keys.");
  }
  return value;
}

function validatedSelectedKeys(
  mode: CollectionSelectionMode,
  value: CollectionKey | null | readonly CollectionKey[] | undefined,
): readonly CollectionKey[] {
  return validateSelectedKeyList(mode, selectedKeyArray(mode, value));
}

function validateSelectedKeyList(
  mode: CollectionSelectionMode,
  normalized: readonly CollectionKey[],
): readonly CollectionKey[] {
  const unique = new Set<CollectionKey>();
  for (const key of normalized) {
    serializeCollectionKey(key);
    if (unique.has(key)) {
      throw new RangeError(
        `Mergora collection selections may not repeat a key: ${JSON.stringify(key)}.`,
      );
    }
    unique.add(key);
  }
  if (mode === "single" && unique.size > 1) {
    throw new RangeError("Mergora single-selection collections accept at most one key.");
  }
  return [...unique];
}

export function normalizeCollectionValue(
  mode: CollectionSelectionMode,
  value: CollectionKey | null | readonly CollectionKey[] | undefined,
  entries: readonly CollectionEntry<unknown>[],
): readonly CollectionKey[] {
  assertCollectionEntries(entries);
  return normalizeCollectionValueAgainstKeys(mode, value, new Set(orderedItemKeys(entries)));
}

function normalizeCollectionValueAgainstKeys(
  mode: CollectionSelectionMode,
  value: CollectionKey | null | readonly CollectionKey[] | undefined,
  available: ReadonlySet<CollectionKey>,
): readonly CollectionKey[] {
  const normalized = validatedSelectedKeys(mode, value);
  for (const key of normalized) {
    if (!available.has(key)) {
      throw new RangeError(
        `Mergora collection selection references an unavailable key: ${JSON.stringify(key)}. Keep selected pages materialized or clear the selection first.`,
      );
    }
  }
  return normalized;
}

export function collectionValueFromKeys(
  mode: CollectionSelectionMode,
  keys: Iterable<CollectionKey>,
  entries: readonly CollectionEntry<unknown>[],
): CollectionKey | null | CollectionKey[] {
  const requested = new Set(keys);
  const ordered = orderedItemKeys(entries).filter((key) => requested.has(key));
  return mode === "single" ? (ordered[0] ?? null) : ordered;
}

export function assertCollectionAsyncState(state: CollectionAsyncState | undefined): void {
  if (state === undefined) return;
  if (state.status === "error") {
    if (state.errorMessage === undefined) {
      throw new TypeError("Mergora collection error state requires errorMessage.");
    }
    assertBoundedText(state.errorMessage, "errorMessage", MAX_ERROR_CODE_POINTS);
    if (state.onRetry === undefined) {
      throw new TypeError("Mergora collection error state requires an onRetry recovery action.");
    }
  } else if (state.errorMessage !== undefined || state.onRetry !== undefined) {
    throw new TypeError("Mergora collection error details are only valid in the error state.");
  }
  if (state.status === "loading-more" && state.hasMore !== true) {
    throw new TypeError("Mergora collection loading-more state requires hasMore=true.");
  }
  if (state.hasMore === true && state.onLoadMore === undefined) {
    throw new TypeError("Mergora paginated collection state requires onLoadMore.");
  }
}

function defaultErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "The options could not be loaded.";
}

/**
 * Deterministic async seam shared by collection components. New initial/retry requests abort older
 * work, monotonically ordered request ids reject stale completions even when an adapter ignores its
 * AbortSignal, and pagination appends only after the page passes global key validation.
 */
export function useCollectionLoader<T = unknown>(
  options: UseCollectionLoaderOptions<T>,
): CollectionLoaderResult<T> {
  const {
    autoLoad = true,
    getErrorMessage = defaultErrorMessage,
    initialCursor = null,
    initialEntries = [],
    load,
  } = options;
  assertCollectionEntries(initialEntries);
  if (initialCursor !== null)
    assertBoundedText(initialCursor, "initialCursor", MAX_TEXT_CODE_POINTS);

  const loadRef = useRef(load);
  const errorMessageRef = useRef(getErrorMessage);
  const entriesRef = useRef<readonly CollectionEntry<T>[]>(initialEntries);
  const cursorRef = useRef<string | null>(initialCursor);
  const requestIdRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const pendingRef = useRef(false);
  const failedReasonRef = useRef<"initial" | "load-more">("initial");
  const [entries, setEntries] = useState<readonly CollectionEntry<T>[]>(initialEntries);
  const [state, setState] = useState<CollectionAsyncState>({
    status: "idle",
    ...(initialCursor === null ? {} : { hasMore: true }),
  });

  useEffect(() => {
    loadRef.current = load;
    errorMessageRef.current = getErrorMessage;
  }, [getErrorMessage, load]);

  const execute = useCallback(async (reason: "initial" | "load-more" | "retry") => {
    const retryTarget = failedReasonRef.current;
    const actualReason = reason === "retry" ? retryTarget : reason;
    if (actualReason === "load-more" && (cursorRef.current === null || pendingRef.current)) return;

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    pendingRef.current = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const requestCursor = actualReason === "load-more" ? cursorRef.current : null;
    failedReasonRef.current = actualReason;
    setState({
      status: actualReason === "load-more" ? "loading-more" : "loading",
      ...(actualReason === "load-more" ? { hasMore: true } : {}),
    });

    try {
      const page = await loadRef.current({
        cursor: requestCursor,
        reason,
        requestId,
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestIdRef.current !== requestId || !mountedRef.current) {
        return;
      }
      if (page.cursor !== null) {
        assertBoundedText(page.cursor, "page cursor", MAX_TEXT_CODE_POINTS);
      }
      const nextEntries =
        actualReason === "load-more" ? [...entriesRef.current, ...page.entries] : page.entries;
      assertCollectionEntries(nextEntries);
      entriesRef.current = nextEntries;
      cursorRef.current = page.cursor;
      setEntries(nextEntries);
      setState({
        status: "idle",
        ...(page.cursor === null ? {} : { hasMore: true }),
      });
    } catch (error) {
      if (controller.signal.aborted || requestIdRef.current !== requestId || !mountedRef.current) {
        return;
      }
      const errorMessage = errorMessageRef.current(error);
      assertBoundedText(errorMessage, "resolved errorMessage", MAX_ERROR_CODE_POINTS);
      setState({
        errorMessage,
        status: "error",
        ...(actualReason === "load-more" && cursorRef.current !== null ? { hasMore: true } : {}),
      });
    } finally {
      if (requestIdRef.current === requestId) pendingRef.current = false;
    }
  }, []);

  const abort = useCallback(() => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    pendingRef.current = false;
    requestIdRef.current += 1;
    setState({
      status: "idle",
      ...(cursorRef.current === null ? {} : { hasMore: true }),
    });
  }, []);
  const reload = useCallback(() => void execute("initial"), [execute]);
  const retry = useCallback(() => void execute("retry"), [execute]);
  const loadMore = useCallback(() => void execute("load-more"), [execute]);

  useEffect(() => {
    mountedRef.current = true;
    if (autoLoad) void execute("initial");
    return () => {
      mountedRef.current = false;
      activeControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [autoLoad, execute]);

  const asyncState = useMemo<CollectionAsyncState>(
    () => ({
      ...state,
      ...(state.status === "error" ? { onRetry: retry } : {}),
      ...(state.hasMore === true ? { onLoadMore: loadMore } : {}),
    }),
    [loadMore, retry, state],
  );
  assertCollectionAsyncState(asyncState);

  return { abort, asyncState, entries, loadMore, reload, retry };
}

export interface ListboxProps<T = unknown, M extends CollectionSelectionMode = "single"> {
  /** Validated ordered item and section models rendered by the listbox. */
  readonly entries: readonly CollectionEntry<T>[];
  /** Persistent visible label that supplies the listbox accessible name. */
  readonly label: ReactNode;
  /** Single or multiple selection semantics; defaults to single. */
  readonly selectionMode?: M;
  /** Controlled canonical selected key or key array matching selectionMode. */
  readonly value?: CollectionValue<M>;
  /** Initial canonical selected key or key array for uncontrolled use and form reset. */
  readonly defaultValue?: CollectionValue<M>;
  /** Reports the complete canonical selection after a user change. */
  readonly onValueChange?: (value: CollectionChangeValue<M>) => void;
  /** Optional visible guidance associated with the listbox through aria-describedby. */
  readonly description?: ReactNode;
  /** Optional visible validation message rendered as an alert. */
  readonly errorMessage?: ReactNode;
  /** Applies invalid styling and aria-invalid when no explicit aria-invalid is supplied. */
  readonly invalid?: boolean;
  /** Requires a non-empty selection and exposes required semantics. */
  readonly required?: boolean;
  /** Disables selection, native hidden controls, and collection items. */
  readonly disabled?: boolean;
  /** Preserves focus and navigation while blocking selection changes. */
  readonly readOnly?: boolean;
  /** Native form field name used by one hidden input per selected key. */
  readonly name?: string;
  /** Native form owner id for hidden selection inputs and uncontrolled reset behavior. */
  readonly form?: string;
  /** Optional loading and recovery state; omitting it removes async controls and status output. */
  readonly asyncState?: CollectionAsyncState;
  /** Localized overrides for empty, loading, load-more, and retry copy. */
  readonly messages?: Partial<CollectionMessages>;
  /** Enables measured collection virtualization; omitting it uses the normal listbox tree. */
  readonly virtualization?: CollectionVirtualizationOptions;
  /** Pass false to remove the summary callback, text, id, and aria-describedby contribution. */
  readonly formatSelectionSummary?:
    false | ((context: CollectionSelectionSummaryContext) => string);
  /** Stable listbox id used to derive associated label, description, error, and summary ids. */
  readonly id?: string;
  /** Class name applied directly to the focusable listbox element. */
  readonly className?: string;
  /** Inline style applied directly to the focusable listbox element. */
  readonly style?: CSSProperties;
  /** Class name applied to the outer field wrapper. */
  readonly rootClassName?: string;
  /** Additional description ids merged with component-owned description and summary ids. */
  readonly "aria-describedby"?: string;
  /** Explicit validation-message id; defaults to the component-owned error element. */
  readonly "aria-errormessage"?: string;
  /** Explicit ARIA invalid state overriding the invalid boolean. */
  readonly "aria-invalid"?: AriaAttributes["aria-invalid"];
}

function setForwardedRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null && ref !== undefined) {
    (ref as { current: T | null }).current = value;
  }
}

function selectionFromAria(
  selection: Selection,
  entries: readonly CollectionEntry<unknown>[],
): readonly CollectionKey[] {
  if (selection === "all") {
    return flattenCollection(entries)
      .filter((item) => item.disabled !== true)
      .map((item) => item.key);
  }
  return [...selection] as CollectionKey[];
}

function selectedTextValues<T>(
  entries: readonly CollectionEntry<T>[],
  keys: readonly CollectionKey[],
): readonly string[] {
  const selected = new Set(keys);
  return flattenCollection(entries)
    .filter((item) => selected.has(item.key))
    .map((item) => item.textValue);
}

export function formatCollectionSelectionSummary(
  context: CollectionSelectionSummaryContext,
): string {
  const formatter = new Intl.ListFormat(context.locale, { style: "long", type: "conjunction" });
  const values = [...context.visibleTextValues];
  if (context.omittedCount > 0) {
    const count = new Intl.NumberFormat(context.locale).format(context.omittedCount);
    values.push(`... (+${count})`);
  }
  return formatter.format(values);
}

function renderItem<T>(item: CollectionItem<T>): ReactElement {
  return (
    <AriaListBoxItem<CollectionItem<T>>
      {...(item.disabled === undefined ? {} : { isDisabled: item.disabled })}
      className="mrg-listbox-item"
      data-slot="listbox-item"
      id={item.key}
      key={item.key}
      textValue={item.textValue}
      value={item}
    >
      {(state: ListBoxItemRenderProps) => (
        <>
          <span className="mrg-listbox-item-copy" data-slot="listbox-item-copy">
            <AriaText data-slot="listbox-item-label" dir="auto" slot="label">
              {item.label ?? item.textValue}
            </AriaText>
            {item.description === undefined ? null : (
              <AriaText data-slot="listbox-item-description" dir="auto" slot="description">
                {item.description}
              </AriaText>
            )}
          </span>
          <span aria-hidden="true" data-slot="listbox-item-check">
            {state.isSelected ? "✓" : ""}
          </span>
        </>
      )}
    </AriaListBoxItem>
  );
}

function renderEntries<T>(entries: readonly CollectionEntry<T>[]): readonly ReactElement[] {
  return entries.map((entry) => {
    if (!isSection(entry)) return renderItem(entry);
    return (
      <AriaListBoxSection<CollectionItem<T>>
        className="mrg-listbox-section"
        data-slot="listbox-section"
        id={entry.key}
        key={entry.key}
      >
        <AriaHeader className="mrg-listbox-section-header" data-slot="listbox-section-header">
          <span dir="auto">{entry.label ?? entry.textValue}</span>
        </AriaHeader>
        {entry.items.map((item) => renderItem(item))}
      </AriaListBoxSection>
    );
  });
}

function ListboxInner<T, M extends CollectionSelectionMode>(
  props: ListboxProps<T, M>,
  ref: ForwardedRef<HTMLDivElement>,
): ReactElement {
  const {
    "aria-describedby": ariaDescribedBy,
    "aria-errormessage": ariaErrorMessage,
    "aria-invalid": ariaInvalid,
    asyncState,
    className,
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
    messages: messageOverrides,
    name,
    onValueChange,
    readOnly = false,
    required = false,
    rootClassName,
    selectionMode = "single" as M,
    style,
    value,
    virtualization,
  } = props;
  assertCollectionEntries(entries);
  assertCollectionAsyncState(asyncState);
  if (name !== undefined) assertBoundedText(name, "form name", MAX_KEY_CODE_POINTS);
  if (label === null || label === undefined || typeof label === "boolean") {
    throw new TypeError("Mergora Listbox requires a persistent visible label.");
  }
  if (virtualization !== undefined) {
    const estimatedItemSize = virtualization.estimatedItemSize ?? 48;
    const estimatedSectionHeaderSize = virtualization.estimatedSectionHeaderSize ?? 40;
    if (estimatedItemSize < 32 || estimatedItemSize > 256) {
      throw new RangeError("Mergora Listbox estimatedItemSize must be between 32 and 256 pixels.");
    }
    if (estimatedSectionHeaderSize < 24 || estimatedSectionHeaderSize > 256) {
      throw new RangeError(
        "Mergora Listbox estimatedSectionHeaderSize must be between 24 and 256 pixels.",
      );
    }
  }

  const { locale } = useMergoraContext();
  const generatedId = `mrg-listbox-${useId().replaceAll(":", "")}`;
  const listboxId = id ?? generatedId;
  const labelId = `${listboxId}-label`;
  const descriptionId = description === undefined ? undefined : `${listboxId}-description`;
  const errorId = errorMessage === undefined ? undefined : `${listboxId}-error`;
  const summaryId = `${listboxId}-selection-summary`;
  const messages = { ...DEFAULT_MESSAGES, ...messageOverrides };
  for (const [key, message] of Object.entries(messages)) {
    assertBoundedText(message, `message ${key}`, MAX_TEXT_CODE_POINTS);
  }

  const controlled = value !== undefined;
  const entryItems = useMemo(() => flattenCollection(entries), [entries]);
  const entryKeys = useMemo<ReadonlySet<CollectionKey>>(
    () => new Set(entryItems.map((item) => item.key)),
    [entryItems],
  );
  const listboxElementRef = useRef<HTMLDivElement | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialSelection = useRef<readonly CollectionKey[] | undefined>(undefined);
  initialSelection.current ??= normalizeCollectionValueAgainstKeys(
    selectionMode,
    defaultValue as CollectionKey | null | readonly CollectionKey[] | undefined,
    entryKeys,
  );
  const [uncontrolledSelection, setUncontrolledSelection] = useState<readonly CollectionKey[]>(
    initialSelection.current,
  );
  const requestedSelection = validatedSelectedKeys(
    selectionMode,
    controlled ? (value as CollectionKey | null | readonly CollectionKey[]) : undefined,
  );
  const resolvedRequestedSelection = controlled
    ? requestedSelection
    : validateSelectedKeyList(selectionMode, uncontrolledSelection);
  const retainedItemsRef = useRef(new Map<CollectionKey, CollectionItem<T>>());
  const retainedKeys = new Set([
    ...resolvedRequestedSelection,
    ...(initialSelection.current ?? []),
  ]);
  for (const item of entryItems) {
    if (retainedKeys.has(item.key)) retainedItemsRef.current.set(item.key, item);
  }
  for (const retainedKey of retainedItemsRef.current.keys()) {
    if (!retainedKeys.has(retainedKey)) retainedItemsRef.current.delete(retainedKey);
  }
  const retainedSelectionItems = resolvedRequestedSelection
    .filter((key) => !entryKeys.has(key))
    .map((key) => {
      const retained = retainedItemsRef.current.get(key);
      if (retained === undefined) {
        throw new RangeError(
          `Mergora collection selection references an unavailable key: ${JSON.stringify(key)}. Keep selected pages materialized or clear the selection first.`,
        );
      }
      return retained;
    });
  const materializedEntries: readonly CollectionEntry<T>[] =
    retainedSelectionItems.length === 0 ? entries : [...entries, ...retainedSelectionItems];
  if (retainedSelectionItems.length > 0) assertCollectionEntries(materializedEntries);
  const materializedKeys = useMemo<ReadonlySet<CollectionKey>>(
    () => new Set(orderedItemKeys(materializedEntries)),
    [materializedEntries],
  );
  const selectedKeys = normalizeCollectionValueAgainstKeys(
    selectionMode,
    selectionMode === "single"
      ? (resolvedRequestedSelection[0] ?? null)
      : resolvedRequestedSelection,
    materializedKeys,
  );
  const disabledKeys = useMemo(
    () =>
      new Set(
        flattenCollection(materializedEntries)
          .filter((item) => disabled || item.disabled === true)
          .map((item) => item.key),
      ),
    [disabled, materializedEntries],
  );
  const resolvedSummaryFormatter =
    formatSelectionSummary === undefined
      ? formatCollectionSelectionSummary
      : formatSelectionSummary;
  const selectedText =
    resolvedSummaryFormatter === false ? [] : selectedTextValues(materializedEntries, selectedKeys);
  const visibleTextValues = selectedText.slice(0, MAX_SUMMARY_ITEMS);
  const summary =
    resolvedSummaryFormatter === false || selectedText.length === 0
      ? null
      : resolvedSummaryFormatter({
          count: selectedText.length,
          locale,
          omittedCount: Math.max(0, selectedText.length - visibleTextValues.length),
          visibleTextValues,
        });
  if (summary !== null) assertBoundedText(summary, "selection summary", MAX_ERROR_CODE_POINTS);
  const resolvedAriaInvalid = ariaInvalid ?? (invalid ? "true" : undefined);
  const resolvedInvalid =
    resolvedAriaInvalid === true ||
    resolvedAriaInvalid === "true" ||
    resolvedAriaInvalid === "grammar" ||
    resolvedAriaInvalid === "spelling";
  const describedBy = [ariaDescribedBy, descriptionId, summary === null ? undefined : summaryId]
    .filter((candidate): candidate is string => candidate !== undefined && candidate.length > 0)
    .join(" ");
  const setListboxElement = useCallback(
    (element: HTMLDivElement | null) => {
      listboxElementRef.current = element;
      setForwardedRef(ref, element);
      if (element === null) return;
      const attributes = {
        "aria-busy":
          asyncState?.status === "loading" || asyncState?.status === "loading-more"
            ? "true"
            : undefined,
        "aria-disabled": disabled ? "true" : undefined,
        "aria-errormessage": ariaErrorMessage ?? errorId,
        "aria-invalid": resolvedAriaInvalid,
        "aria-readonly": readOnly ? "true" : undefined,
        "aria-required": required ? "true" : undefined,
      } as const;
      for (const [name, attributeValue] of Object.entries(attributes)) {
        if (attributeValue === undefined || attributeValue === false) element.removeAttribute(name);
        else element.setAttribute(name, String(attributeValue));
      }
    },
    [
      ariaErrorMessage,
      asyncState?.status,
      disabled,
      errorId,
      readOnly,
      ref,
      required,
      resolvedAriaInvalid,
    ],
  );

  useEffect(() => {
    if (controlled) return undefined;
    const associatedForm =
      form === undefined
        ? listboxElementRef.current?.closest("form")
        : document.getElementById(form);
    if (!(associatedForm instanceof HTMLFormElement)) return undefined;
    const handleReset = (event: Event) => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        if (!event.defaultPrevented) {
          setUncontrolledSelection(initialSelection.current ?? []);
        }
      }, 0);
    };
    associatedForm.addEventListener("reset", handleReset, { capture: true });
    return () => {
      associatedForm.removeEventListener("reset", handleReset, { capture: true });
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, [controlled, form]);

  const listbox = (
    <AriaListBox<CollectionItem<T>>
      {...(virtualization === undefined ? {} : { "data-virtualized": true })}
      {...(style === undefined ? {} : { style })}
      {...(asyncState?.status === "loading" || asyncState?.status === "loading-more"
        ? { "aria-busy": true }
        : {})}
      {...(describedBy.length === 0 ? {} : { "aria-describedby": describedBy })}
      {...(disabled ? { "aria-disabled": true } : {})}
      {...((ariaErrorMessage ?? errorId) === undefined
        ? {}
        : { "aria-errormessage": ariaErrorMessage ?? errorId })}
      {...(resolvedAriaInvalid === undefined ? {} : { "aria-invalid": resolvedAriaInvalid })}
      aria-labelledby={labelId}
      {...(readOnly ? { "aria-readonly": true } : {})}
      {...(required ? { "aria-required": true } : {})}
      className={className === undefined ? "mrg-listbox" : `mrg-listbox ${className}`}
      data-slot="listbox"
      disabledKeys={disabledKeys}
      disallowEmptySelection={required}
      id={listboxId}
      onSelectionChange={(selection) => {
        if (disabled || readOnly) return;
        const nextKeys = selectionFromAria(selection, materializedEntries);
        if (!controlled) setUncontrolledSelection(nextKeys);
        onValueChange?.(
          collectionValueFromKeys(
            selectionMode,
            nextKeys,
            materializedEntries,
          ) as CollectionChangeValue<M>,
        );
      }}
      ref={setListboxElement}
      renderEmptyState={() => (
        <span className="mrg-listbox-empty" data-slot="listbox-empty">
          {asyncState?.status === "loading" ? messages.loading : messages.empty}
        </span>
      )}
      selectedKeys={new Set(selectedKeys)}
      selectionBehavior={selectionMode === "multiple" ? "toggle" : "replace"}
      selectionMode={selectionMode}
    >
      {renderEntries(materializedEntries)}
    </AriaListBox>
  );

  return (
    <AriaI18nProvider locale={locale}>
      <div
        aria-busy={
          asyncState?.status === "loading" || asyncState?.status === "loading-more" || undefined
        }
        aria-disabled={disabled || undefined}
        aria-invalid={resolvedAriaInvalid}
        className={
          rootClassName === undefined ? "mrg-listbox-field" : `mrg-listbox-field ${rootClassName}`
        }
        data-disabled={disabled || undefined}
        data-invalid={resolvedInvalid || undefined}
        data-loading={
          asyncState?.status === "loading" || asyncState?.status === "loading-more" || undefined
        }
        data-readonly={readOnly || undefined}
        data-required={required || undefined}
        data-slot="listbox-field"
      >
        <span className="mrg-listbox-label" data-slot="listbox-label" id={labelId}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </span>
        {description === undefined ? null : (
          <span data-slot="listbox-description" id={descriptionId}>
            {description}
          </span>
        )}
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
        {selectedKeys.map((key) => (
          <input
            disabled={disabled}
            form={form}
            key={`${typeof key}:${serializeCollectionKey(key)}`}
            name={name}
            type="hidden"
            value={serializeCollectionKey(key)}
          />
        ))}
        {summary === null ? null : (
          <span
            className="mrg-collection-visually-hidden"
            data-slot="listbox-selection-summary"
            id={summaryId}
          >
            {summary}
          </span>
        )}
        {errorMessage === undefined ? null : (
          <span data-slot="listbox-error" id={errorId} role="alert">
            {errorMessage}
          </span>
        )}
        {asyncState?.status === "error" ? (
          <div className="mrg-listbox-async" data-slot="listbox-async-error" role="alert">
            <span>{asyncState.errorMessage}</span>
            <button onClick={asyncState.onRetry} type="button">
              {messages.retry}
            </button>
          </div>
        ) : null}
        {asyncState?.hasMore === true ? (
          <button
            aria-busy={asyncState.status === "loading-more" || undefined}
            className="mrg-listbox-load-more"
            data-slot="listbox-load-more"
            disabled={asyncState.status === "loading-more"}
            onClick={asyncState.onLoadMore}
            type="button"
          >
            {asyncState.status === "loading-more" ? messages.loadingMore : messages.loadMore}
          </button>
        ) : null}
      </div>
    </AriaI18nProvider>
  );
}

/** Generic ref-aware call signature preserved by the forwarded Listbox implementation. */
export interface ListboxComponent {
  <T = unknown, M extends CollectionSelectionMode = "single">(
    props: ListboxProps<T, M> & RefAttributes<HTMLDivElement>,
  ): ReactElement | null;
}

const ListboxForwardRef = forwardRef(ListboxInner);
ListboxForwardRef.displayName = "Listbox";
export const Listbox = ListboxForwardRef as ListboxComponent;
