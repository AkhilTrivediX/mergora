// Generated from registry/source/components/emoji-picker/emoji-picker.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./emoji-picker.css";

import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";

export type EmojiSkinTone =
  "default" | "dark" | "light" | "medium" | "medium-dark" | "medium-light";

export interface EmojiPickerItem {
  /** Stable unique identifier used for selection, focus, and recent-item ordering. */
  readonly id: string;
  /** Default rendered emoji grapheme when no supported tone override is selected. */
  readonly emoji: string;
  /** Human-readable emoji name used for search and the grid cell's accessible label. */
  readonly label: string;
  /** Category identifier used by the optional category filter and grouping control. */
  readonly category: string;
  /** Additional locale-appropriate search terms that do not appear in the rendered grid. */
  readonly keywords?: readonly string[];
  /** Optional emoji grapheme overrides keyed by each non-default skin tone. */
  readonly tones?: Partial<Record<Exclude<EmojiSkinTone, "default">, string>>;
}

export interface EmojiPickerMessages {
  /** Label for the category control's option that removes category filtering. */
  readonly allCategories: string;
  /** Visible label for the optional category selection control. */
  readonly categoryLabel: string;
  /** Recovery action text shown when search or category filters yield no results. */
  readonly clearFilters: string;
  /** Empty-result guidance shown when the current filters match no emoji. */
  readonly empty: string;
  /** Accessible name shared by the picker group and its keyboard grid. */
  readonly pickerLabel: string;
  /** Context text explaining that recently selected emoji are ordered first. */
  readonly recentFirst: string;
  /** Builds the optional polite result-count announcement for the visible collection. */
  readonly resultCount: (count: number) => string;
  /** Visible label for the optional emoji search input. */
  readonly searchLabel: string;
  /** Visible label for the optional skin-tone selection control. */
  readonly skinToneLabel: string;
  /** Localized accessible labels for every supported skin-tone value. */
  readonly toneLabels: Readonly<Record<EmojiSkinTone, string>>;
}

export interface EmojiPickerProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Complete emoji collection with unique IDs; filtering never mutates this array. */
  readonly items: readonly EmojiPickerItem[];
  /** Controlled selected item ID; use with `onValueChange` and omit `defaultValue`. */
  readonly value?: string;
  /** Initial selected item ID for uncontrolled selection. */
  readonly defaultValue?: string;
  /** Reports the selected ID and item after a pointer or keyboard activation. */
  readonly onValueChange?: (id: string, item: EmojiPickerItem) => void;
  /** Number of grid columns, constrained to an integer from two through sixteen. */
  readonly columns?: number;
  /** Disables every filter control and emoji choice while preserving readable content. */
  readonly disabled?: boolean;
  /** Adds the search field; false removes its UI, filtering behavior, and form semantics. */
  readonly searchable?: boolean;
  /** Controlled search query used only when `searchable` is enabled. */
  readonly searchValue?: string;
  /** Initial query for uncontrolled search; omitted when `searchValue` is controlled. */
  readonly defaultSearchValue?: string;
  /** Reports search edits whether the query is controlled or internally managed. */
  readonly onSearchValueChange?: (value: string) => void;
  /** Adds category filtering; false removes its control and ignores category state. */
  readonly showCategories?: boolean;
  /** Controlled category identifier used by the optional category filter. */
  readonly category?: string;
  /** Initial category identifier for uncontrolled filtering. */
  readonly defaultCategory?: string;
  /** Reports category changes from the filter and empty-result recovery action. */
  readonly onCategoryChange?: (category: string) => void;
  /** Orders matching recent IDs first and exposes recent context when enabled. */
  readonly showRecents?: boolean;
  /** Ordered recent item IDs supplied by the consumer for optional recent-first sorting. */
  readonly recentIds?: readonly string[];
  /** Reports a deduplicated recent-ID list after selection, limited to 24 entries. */
  readonly onRecentIdsChange?: (ids: readonly string[]) => void;
  /** Adds the skin-tone control; false removes it and renders each item's default emoji. */
  readonly showSkinToneSelector?: boolean;
  /** Controlled selected skin tone used when the selector enhancement is enabled. */
  readonly skinTone?: EmojiSkinTone;
  /** Initial skin tone for uncontrolled selection, defaulting to `default`. */
  readonly defaultSkinTone?: EmojiSkinTone;
  /** Reports a skin-tone selection from the optional control. */
  readonly onSkinToneChange?: (tone: EmojiSkinTone) => void;
  /** Adds a polite live result count; false removes the output and announcements. */
  readonly showResultSummary?: boolean;
  /** Locale used for search normalization and deterministic category sorting. */
  readonly locale?: string;
  /** Localized labels and recovery copy; omitted entries retain accessible defaults. */
  readonly messages?: Partial<EmojiPickerMessages>;
}

const DEFAULT_MESSAGES: EmojiPickerMessages = {
  allCategories: "All categories",
  categoryLabel: "Category",
  clearFilters: "Clear filters",
  empty: "No emoji match. Clear the search or choose another category.",
  pickerLabel: "Emoji picker",
  recentFirst: "Recently used choices appear first.",
  resultCount: (count) => `${count} emoji available`,
  searchLabel: "Search emoji",
  skinToneLabel: "Skin tone",
  toneLabels: {
    default: "Default",
    dark: "Dark skin tone",
    light: "Light skin tone",
    medium: "Medium skin tone",
    "medium-dark": "Medium-dark skin tone",
    "medium-light": "Medium-light skin tone",
  },
};

function classes(...values: readonly (false | string | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

function chunks<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    rows.push(items.slice(index, index + size));
  return rows;
}

export function filterEmojiItems(
  items: readonly EmojiPickerItem[],
  query: string,
  category: string,
  locale = "en-US",
): readonly EmojiPickerItem[] {
  const normalizedQuery = query.trim().normalize("NFKC").toLocaleLowerCase(locale);
  return items.filter((item) => {
    if (category.length > 0 && item.category !== category) return false;
    if (normalizedQuery.length === 0) return true;
    return [item.label, item.category, ...(item.keywords ?? [])].some((candidate) =>
      candidate.normalize("NFKC").toLocaleLowerCase(locale).includes(normalizedQuery),
    );
  });
}

export const EmojiPicker = forwardRef<HTMLDivElement, EmojiPickerProps>(function EmojiPicker(
  {
    items,
    value,
    defaultValue,
    onValueChange,
    columns = 8,
    disabled = false,
    searchable = false,
    searchValue,
    defaultSearchValue,
    onSearchValueChange,
    showCategories = false,
    category: categoryValue,
    defaultCategory,
    onCategoryChange,
    showRecents = false,
    recentIds = [],
    onRecentIdsChange,
    showSkinToneSelector = false,
    skinTone,
    defaultSkinTone = "default",
    onSkinToneChange,
    showResultSummary = false,
    locale = "en-US",
    messages: messageOverrides,
    className,
    ...props
  },
  ref,
) {
  if (value !== undefined && defaultValue !== undefined) {
    throw new RangeError("Mergora EmojiPicker cannot receive both value and defaultValue.");
  }
  if (skinTone !== undefined && defaultSkinTone !== "default") {
    throw new RangeError("Mergora EmojiPicker cannot receive both skinTone and defaultSkinTone.");
  }
  if (searchValue !== undefined && defaultSearchValue !== undefined) {
    throw new RangeError(
      "Mergora EmojiPicker cannot receive both searchValue and defaultSearchValue.",
    );
  }
  if (categoryValue !== undefined && defaultCategory !== undefined) {
    throw new RangeError("Mergora EmojiPicker cannot receive both category and defaultCategory.");
  }
  if (!Number.isSafeInteger(columns) || columns < 2 || columns > 16) {
    throw new RangeError("Mergora EmojiPicker columns must be an integer from 2 through 16.");
  }
  const duplicateIds = items.filter(
    (item, index) => items.findIndex((other) => other.id === item.id) !== index,
  );
  if (duplicateIds.length > 0) throw new RangeError("Mergora EmojiPicker item ids must be unique.");
  const messages = {
    ...DEFAULT_MESSAGES,
    ...messageOverrides,
    toneLabels: { ...DEFAULT_MESSAGES.toneLabels, ...messageOverrides?.toneLabels },
  };
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedId = value ?? internalValue;
  const toneControlled = skinTone !== undefined;
  const [internalTone, setInternalTone] = useState(defaultSkinTone);
  const selectedTone = skinTone ?? internalTone;
  const searchControlled = searchValue !== undefined;
  const [internalSearchValue, setInternalSearchValue] = useState(defaultSearchValue ?? "");
  const query = searchValue ?? internalSearchValue;
  const categoryControlled = categoryValue !== undefined;
  const [internalCategory, setInternalCategory] = useState(defaultCategory ?? "");
  const category = categoryValue ?? internalCategory;
  const [activeId, setActiveId] = useState<string>();
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const categories = useMemo(
    () =>
      [...new Set(items.map((item) => item.category))].sort((left, right) =>
        left.localeCompare(right, locale),
      ),
    [items, locale],
  );
  const filtered = useMemo(
    () => filterEmojiItems(items, searchable ? query : "", showCategories ? category : "", locale),
    [category, items, locale, query, searchable, showCategories],
  );
  const visible = useMemo(() => {
    if (!showRecents || recentIds.length === 0) return filtered;
    const rank = new Map(recentIds.map((id, index) => [id, index]));
    return [...filtered].sort((left, right) => {
      const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
  }, [filtered, recentIds, showRecents]);
  const rows = chunks(visible, columns);

  useEffect(() => {
    if (visible.length === 0) setActiveId(undefined);
    else if (activeId === undefined || !visible.some((item) => item.id === activeId)) {
      setActiveId(visible[0]!.id);
    }
  }, [activeId, visible]);

  const select = (item: EmojiPickerItem): void => {
    if (!controlled) setInternalValue(item.id);
    onValueChange?.(item.id, item);
    if (showRecents) {
      onRecentIdsChange?.([item.id, ...recentIds.filter((id) => id !== item.id)].slice(0, 24));
    }
  };

  const setQuery = (next: string): void => {
    if (!searchControlled) setInternalSearchValue(next);
    onSearchValueChange?.(next);
  };

  const setCategory = (next: string): void => {
    if (!categoryControlled) setInternalCategory(next);
    onCategoryChange?.(next);
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (visible.length === 0) return;
    const currentIndex = Math.max(
      0,
      visible.findIndex((item) => item.id === activeId),
    );
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex += rtl ? -1 : 1;
    else if (event.key === "ArrowLeft") nextIndex += rtl ? 1 : -1;
    else if (event.key === "ArrowDown") nextIndex += columns;
    else if (event.key === "ArrowUp") nextIndex -= columns;
    else if (event.key === "Home")
      nextIndex = event.ctrlKey ? 0 : currentIndex - (currentIndex % columns);
    else if (event.key === "End") {
      nextIndex = event.ctrlKey
        ? visible.length - 1
        : Math.min(visible.length - 1, currentIndex - (currentIndex % columns) + columns - 1);
    } else return;
    event.preventDefault();
    nextIndex = Math.min(Math.max(nextIndex, 0), visible.length - 1);
    const nextId = visible[nextIndex]!.id;
    setActiveId(nextId);
    buttonRefs.current.get(nextId)?.focus();
  };

  return (
    <div
      {...props}
      ref={ref}
      aria-label={messages.pickerLabel}
      className={classes("mrg-emoji-picker", className)}
      data-disabled={disabled || undefined}
      data-slot="emoji-picker"
      role="group"
    >
      {searchable || showCategories || showSkinToneSelector ? (
        <div className="mrg-emoji-picker__controls" data-slot="emoji-picker-controls">
          {searchable ? (
            <label>
              <span>{messages.searchLabel}</span>
              <input
                disabled={disabled}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
          ) : null}
          {showCategories ? (
            <label>
              <span>{messages.categoryLabel}</span>
              <select
                disabled={disabled}
                value={category}
                onChange={(event) => setCategory(event.currentTarget.value)}
              >
                <option value="">{messages.allCategories}</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {showSkinToneSelector ? (
            <label>
              <span>{messages.skinToneLabel}</span>
              <select
                disabled={disabled}
                value={selectedTone}
                onChange={(event) => {
                  const next = event.currentTarget.value as EmojiSkinTone;
                  if (!toneControlled) setInternalTone(next);
                  onSkinToneChange?.(next);
                }}
              >
                {(Object.keys(messages.toneLabels) as EmojiSkinTone[]).map((tone) => (
                  <option key={tone} value={tone}>
                    {messages.toneLabels[tone]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      {showRecents && recentIds.length > 0 ? (
        <p className="mrg-emoji-picker__recent" data-slot="emoji-picker-recent-context">
          {messages.recentFirst}
        </p>
      ) : null}
      {showResultSummary ? (
        <output
          aria-live="polite"
          className="mrg-emoji-picker__summary"
          data-slot="emoji-picker-summary"
        >
          {messages.resultCount(visible.length)}
        </output>
      ) : null}
      {visible.length === 0 ? (
        <div className="mrg-emoji-picker__empty" data-slot="emoji-picker-empty">
          <p>{messages.empty}</p>
          {(query.length > 0 || category.length > 0) && (searchable || showCategories) ? (
            <button
              disabled={disabled}
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("");
              }}
            >
              {messages.clearFilters}
            </button>
          ) : null}
        </div>
      ) : (
        <div
          aria-colcount={columns}
          aria-label={messages.pickerLabel}
          aria-rowcount={rows.length}
          className="mrg-emoji-picker__grid"
          data-slot="emoji-picker-grid"
          role="grid"
          onKeyDown={onGridKeyDown}
        >
          {rows.map((row, rowIndex) => (
            <div aria-rowindex={rowIndex + 1} key={`row-${rowIndex}`} role="row">
              {row.map((item, columnIndex) => {
                const renderedEmoji =
                  selectedTone === "default"
                    ? item.emoji
                    : (item.tones?.[selectedTone] ?? item.emoji);
                return (
                  <button
                    aria-colindex={columnIndex + 1}
                    aria-label={`${item.label}${selectedTone === "default" ? "" : `, ${messages.toneLabels[selectedTone]}`}`}
                    aria-selected={selectedId === item.id}
                    data-recent={(showRecents && recentIds.includes(item.id)) || undefined}
                    data-slot="emoji-picker-item"
                    disabled={disabled}
                    key={item.id}
                    ref={(node) => {
                      if (node === null) buttonRefs.current.delete(item.id);
                      else buttonRefs.current.set(item.id, node);
                    }}
                    role="gridcell"
                    tabIndex={item.id === activeId ? 0 : -1}
                    type="button"
                    onClick={() => select(item)}
                    onFocus={() => setActiveId(item.id)}
                  >
                    <span aria-hidden="true">{renderedEmoji}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
