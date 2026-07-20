"use client";

import "./sortable-list.css";

import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

export interface SortableListVirtualWindow {
  /** Sets the inclusive first item index rendered in the current window. */
  readonly start: number;
  /** Sets the exclusive final item index rendered in the current window. */
  readonly end: number;
  /** Supplies the measured or estimated item size used for scroll-space preservation. */
  readonly itemSize: number;
}

export type SortableListChangeReason =
  | "move-button"
  | "destination"
  | "keyboard-preview"
  | "keyboard-drop"
  | "keyboard-cancel"
  | "pointer-drop"
  | "undo"
  | "reset";

export interface SortableListMoveDetail {
  /** Identifies the moved item using the consumer’s stable key. */
  readonly id: string;
  /** Reports the item’s zero-based position before the move. */
  readonly from: number;
  /** Reports the item’s zero-based position after the move. */
  readonly to: number;
  /** Identifies the pointer, keyboard, button, destination, undo, or reset operation. */
  readonly reason: SortableListChangeReason;
}

export interface SortableListMessages {
  /** Explains keyboard pickup, movement, drop, and cancellation commands. */
  readonly instructions: string;
  /** Labels the explicit action that moves an item one position earlier. */
  readonly moveUp: string;
  /** Labels the explicit action that moves an item one position later. */
  readonly moveDown: string;
  /** Labels the optional destination-position control. */
  readonly moveTo: string;
  /** Labels the optional action that restores the previous ordering. */
  readonly undo: string;
  /** Generates human-readable one-based position context. */
  readonly position: (position: number, total: number) => string;
  /** Announces keyboard pickup with the item label and position. */
  readonly pickedUp: (label: string, position: number, total: number) => string;
  /** Announces a previewed keyboard destination before drop. */
  readonly moved: (label: string, position: number, total: number) => string;
  /** Announces the committed destination after a drop. */
  readonly dropped: (label: string, position: number, total: number) => string;
  /** Announces cancellation and restoration of the original position. */
  readonly cancelled: (label: string) => string;
  /** Announces how many items were restored by the optional undo action. */
  readonly restored: (count: number) => string;
  /** Generates each drag handle’s accessible name and position context. */
  readonly handleLabel: (label: string, position: number, total: number) => string;
  /** Generates the accessible name for one item’s explicit move controls. */
  readonly actionsLabel: (label: string) => string;
  /** Labels the action that advances a consumer-controlled virtual window. */
  readonly showMore: string;
  /** Explains that the consumer’s move policy rejected a destination. */
  readonly moveRejected: string;
}

export interface SortableListProps<TItem> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onChange"
> {
  /** Names the sortable list for visible and assistive-technology context. */
  readonly label: string;
  /** Controls the ordered item collection when supplied. */
  readonly items?: readonly TItem[];
  /** Sets the initial ordered item collection for uncontrolled use. */
  readonly defaultItems?: readonly TItem[];
  /** Returns a stable identifier used for rendering, movement, and serialization. */
  readonly getItemId: (item: TItem) => string;
  /** Returns a human-readable label used in controls and announcements. */
  readonly getItemLabel: (item: TItem) => string;
  /** Renders an item’s domain-neutral visible content. */
  readonly renderItem: (item: TItem) => ReactNode;
  /** Reports committed ordering changes or native form reset. */
  readonly onItemsChange?: (
    items: readonly TItem[],
    detail: SortableListMoveDetail | { readonly reason: "reset" },
  ) => void;
  /** Allows or rejects individual destinations and may explain a rejected move. */
  readonly canMove?: (
    item: TItem,
    destination: number,
  ) => boolean | { readonly allowed: boolean; readonly reason: string };
  /** Prevents pointer, keyboard, destination, undo, and explicit-control moves. */
  readonly disabled?: boolean;
  /** Serializes ordered stable identifiers into a hidden control for native form submission. */
  readonly name?: string;
  /** Shows a destination selector per item; false removes its UI and behavior. */
  readonly showDestinationControls?: boolean;
  /** Enables private live movement announcements; false removes the live region output. */
  readonly announceMoves?: boolean;
  /** Keeps one previous ordering for restoration; false removes undo UI and state. */
  readonly undoable?: boolean;
  /** Enables consumer-controlled windowing; false renders the complete collection. */
  readonly virtualWindow?: false | SortableListVirtualWindow;
  /** Requests a new render window without mutating or owning consumer scroll state. */
  readonly onVirtualWindowChange?: (window: SortableListVirtualWindow) => void;
  /** Overrides individual localized strings while retaining defaults for omitted entries. */
  readonly messages?: Partial<SortableListMessages>;
}

const defaultMessages: SortableListMessages = {
  instructions:
    "Use Move up or Move down. On a drag handle, press Space to pick up, Arrow keys to move, Enter to drop, or Escape to cancel.",
  moveUp: "Move up",
  moveDown: "Move down",
  moveTo: "Move to position",
  undo: "Undo last move",
  position: (position, total) => `Position ${position} of ${total}`,
  pickedUp: (label, position, total) => `Picked up ${label}, position ${position} of ${total}.`,
  moved: (label, position, total) => `${label} moved to position ${position} of ${total}.`,
  dropped: (label, position, total) => `${label} dropped at position ${position} of ${total}.`,
  cancelled: (label) => `Movement cancelled. ${label} returned to its original position.`,
  restored: (count) => `Restored the previous order of ${count} items.`,
  handleLabel: (label, position, total) => `Move ${label}. Position ${position} of ${total}.`,
  actionsLabel: (label) => `Move ${label}`,
  showMore: "Show more items",
  moveRejected: "Move is not allowed.",
};

function classes(...values: readonly (string | false | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function moveSortableItem<TItem>(
  items: readonly TItem[],
  from: number,
  to: number,
): readonly TItem[] {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function SortableList<TItem>({
  label,
  items: controlledItems,
  defaultItems: defaultItemsProp,
  getItemId,
  getItemLabel,
  renderItem,
  onItemsChange,
  canMove,
  disabled = false,
  name,
  showDestinationControls = false,
  announceMoves = false,
  undoable = false,
  virtualWindow = false,
  onVirtualWindowChange,
  messages: messageOverrides,
  className,
  onReset,
  ...props
}: SortableListProps<TItem>): ReactElement {
  const defaultItems = defaultItemsProp ?? [];
  if (controlledItems !== undefined && defaultItemsProp !== undefined) {
    throw new Error("Mergora SortableList controlled items cannot be combined with defaultItems.");
  }
  const messages = { ...defaultMessages, ...messageOverrides };
  const instructionsId = `${useId().replaceAll(":", "")}-instructions`;
  const [internalItems, setInternalItems] = useState<readonly TItem[]>(defaultItems);
  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [undoSnapshot, setUndoSnapshot] = useState<readonly TItem[] | null>(null);
  const keyboardSnapshot = useRef<readonly TItem[] | null>(null);
  const draggedId = useRef<string | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const items = controlledItems ?? internalItems;
  const ids = items.map(getItemId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Mergora SortableList item IDs must be unique.");
  }
  if (virtualWindow !== false && onVirtualWindowChange === undefined) {
    throw new Error("Mergora SortableList virtualWindow requires onVirtualWindowChange.");
  }
  if (
    virtualWindow !== false &&
    (!Number.isInteger(virtualWindow.start) ||
      !Number.isInteger(virtualWindow.end) ||
      !Number.isFinite(virtualWindow.itemSize) ||
      virtualWindow.start < 0 ||
      virtualWindow.end < virtualWindow.start ||
      virtualWindow.itemSize <= 0)
  ) {
    throw new Error(
      "Mergora SortableList virtualWindow requires bounded integer indexes and a positive itemSize.",
    );
  }

  const announce = (message: string) => {
    if (announceMoves) setAnnouncement(message);
  };
  const requestFocus = (id: string) => {
    queueMicrotask(() => {
      const handle = handles.current.get(id);
      handle?.focus();
      handle?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    });
  };
  const allowed = (item: TItem, destination: number) => {
    const result = canMove?.(item, destination) ?? true;
    return typeof result === "boolean"
      ? { allowed: result, reason: messages.moveRejected }
      : result;
  };
  const publish = (next: readonly TItem[], detail: SortableListMoveDetail, remember: boolean) => {
    if (remember && undoable) setUndoSnapshot(items);
    if (controlledItems === undefined) setInternalItems(next);
    onItemsChange?.(next, detail);
  };
  const move = (
    id: string,
    destination: number,
    reason: SortableListChangeReason,
    remember = true,
  ) => {
    const from = items.findIndex((item) => getItemId(item) === id);
    if (from < 0 || from === destination) return false;
    const item = items[from]!;
    const permission = allowed(item, destination);
    if (!permission.allowed) {
      announce(permission.reason);
      return false;
    }
    const next = moveSortableItem(items, from, destination);
    publish(next, { id, from, to: destination, reason }, remember);
    announce(messages.moved(getItemLabel(item), destination + 1, items.length));
    requestFocus(id);
    return true;
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const index = items.findIndex((item) => getItemId(item) === id);
    const item = items[index];
    if (item === undefined || disabled) return;
    if ((event.key === " " || event.key === "Enter") && grabbedId === null) {
      event.preventDefault();
      keyboardSnapshot.current = items;
      setGrabbedId(id);
      announce(messages.pickedUp(getItemLabel(item), index + 1, items.length));
      return;
    }
    if (grabbedId !== id) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const destination = Math.max(
        0,
        Math.min(items.length - 1, index + (event.key === "ArrowUp" ? -1 : 1)),
      );
      move(id, destination, "keyboard-preview", false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setGrabbedId(null);
      if (undoable && keyboardSnapshot.current) setUndoSnapshot(keyboardSnapshot.current);
      keyboardSnapshot.current = null;
      announce(messages.dropped(getItemLabel(item), index + 1, items.length));
      onItemsChange?.(items, { id, from: index, to: index, reason: "keyboard-drop" });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      const snapshot = keyboardSnapshot.current;
      if (snapshot) {
        if (controlledItems === undefined) setInternalItems(snapshot);
        onItemsChange?.(snapshot, {
          id,
          from: index,
          to: snapshot.findIndex((candidate) => getItemId(candidate) === id),
          reason: "keyboard-cancel",
        });
      }
      keyboardSnapshot.current = null;
      setGrabbedId(null);
      announce(messages.cancelled(getItemLabel(item)));
    }
  };

  const onDragStart = (event: DragEvent<HTMLButtonElement>, id: string) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    draggedId.current = id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  };
  const onDrop = (event: DragEvent<HTMLLIElement>, destination: number) => {
    event.preventDefault();
    const id = draggedId.current;
    if (id) move(id, destination, "pointer-drop");
    draggedId.current = null;
  };

  const windowStart = virtualWindow === false ? 0 : Math.max(0, virtualWindow.start);
  const windowEnd =
    virtualWindow === false ? items.length : Math.min(items.length, virtualWindow.end);
  const visibleItems = items.slice(windowStart, windowEnd);
  const handleReset = (event: FormEvent<HTMLDivElement>) => {
    onReset?.(event);
    if (!event.defaultPrevented && controlledItems === undefined) {
      setInternalItems(defaultItems);
      setUndoSnapshot(null);
      onItemsChange?.(defaultItems, { reason: "reset" });
    }
  };

  return (
    <div
      {...props}
      className={classes("mrg-sortable-list", className)}
      data-slot="sortable-list"
      data-grabbed={grabbedId !== null || undefined}
      role="region"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onReset={handleReset}
    >
      <div className="mrg-sortable-list__heading">
        <strong>{label}</strong>
        {undoable && undoSnapshot ? (
          <button
            type="button"
            onClick={() => {
              const snapshot = undoSnapshot;
              const current = items;
              if (controlledItems === undefined) setInternalItems(snapshot);
              setUndoSnapshot(null);
              onItemsChange?.(snapshot, { id: "", from: -1, to: -1, reason: "undo" });
              announce(messages.restored(current.length));
            }}
          >
            {messages.undo}
          </button>
        ) : null}
      </div>
      <p id={instructionsId} className="mrg-sortable-list__instructions">
        {messages.instructions}
      </p>
      <ol aria-label={label} aria-describedby={instructionsId}>
        {virtualWindow !== false && windowStart > 0 ? (
          <li
            aria-hidden="true"
            className="mrg-sortable-list__spacer"
            style={{ blockSize: windowStart * virtualWindow.itemSize }}
          />
        ) : null}
        {visibleItems.map((item, visibleIndex) => {
          const index = windowStart + visibleIndex;
          const id = getItemId(item);
          const itemLabel = getItemLabel(item);
          return (
            <li
              key={id}
              data-slot="sortable-list-item"
              data-grabbed={grabbedId === id || undefined}
              aria-posinset={index + 1}
              aria-setsize={items.length}
              onDragOver={(event) => {
                if (!disabled) event.preventDefault();
              }}
              onDrop={(event) => onDrop(event, index)}
            >
              <button
                ref={(element) => {
                  if (element) handles.current.set(id, element);
                  else handles.current.delete(id);
                }}
                type="button"
                className="mrg-sortable-list__handle"
                disabled={disabled}
                draggable={!disabled}
                aria-pressed={grabbedId === id}
                aria-label={messages.handleLabel(itemLabel, index + 1, items.length)}
                onKeyDown={(event) => onHandleKeyDown(event, id)}
                onDragStart={(event) => onDragStart(event, id)}
                onDragEnd={() => {
                  draggedId.current = null;
                }}
              >
                <span aria-hidden="true">↕</span>
              </button>
              <div className="mrg-sortable-list__content">{renderItem(item)}</div>
              <span className="mrg-sortable-list__position">
                {messages.position(index + 1, items.length)}
              </span>
              <div
                className="mrg-sortable-list__actions"
                role="group"
                aria-label={messages.actionsLabel(itemLabel)}
              >
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => move(id, index - 1, "move-button")}
                >
                  {messages.moveUp}
                </button>
                <button
                  type="button"
                  disabled={disabled || index === items.length - 1}
                  onClick={() => move(id, index + 1, "move-button")}
                >
                  {messages.moveDown}
                </button>
                {showDestinationControls ? (
                  <label>
                    <span>{messages.moveTo}</span>
                    <select
                      value={index}
                      disabled={disabled}
                      onChange={(event) =>
                        move(id, Number(event.currentTarget.value), "destination")
                      }
                    >
                      {items.map((_, destination) => (
                        <option key={destination} value={destination}>
                          {destination + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              {name ? <input type="hidden" name={name} value={id} disabled={disabled} /> : null}
            </li>
          );
        })}
        {virtualWindow !== false && windowEnd < items.length ? (
          <li
            aria-hidden="true"
            className="mrg-sortable-list__spacer"
            style={{ blockSize: (items.length - windowEnd) * virtualWindow.itemSize }}
          />
        ) : null}
      </ol>
      {virtualWindow !== false ? (
        <button
          type="button"
          className="mrg-sortable-list__load-window"
          disabled={windowEnd >= items.length}
          onClick={() =>
            onVirtualWindowChange?.({
              ...virtualWindow,
              start: windowStart,
              end: Math.min(items.length, windowEnd + Math.max(1, windowEnd - windowStart)),
            })
          }
        >
          {messages.showMore}
        </button>
      ) : null}
      {announceMoves ? (
        <div
          className="mrg-sortable-list__visually-hidden"
          role="status"
          aria-live="polite"
          data-slot="sortable-list-announcer"
        >
          {announcement}
        </div>
      ) : null}
    </div>
  );
}
