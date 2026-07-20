"use client";

import "./kanban.css";

import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

export interface KanbanCard<TData = unknown> {
  /** Stable board-wide identifier used for focus, moves, drag data, and rendering keys. */
  readonly id: string;
  /** Concise card name used by default rendering and movement announcements. */
  readonly title: string;
  /** Optional plain-text detail used by the default card renderer. */
  readonly description?: string;
  /** Consumer-owned domain payload passed unchanged to custom card rendering. */
  readonly data: TData;
  /** Prevents all move paths for this card while preserving readable content. */
  readonly disabled?: boolean;
}

export interface KanbanColumn<TData = unknown> {
  /** Stable board-unique identifier used for destinations and accessible relationships. */
  readonly id: string;
  /** Visible column heading and destination name used in movement feedback. */
  readonly title: string;
  /** Ordered immutable cards currently contained by the column. */
  readonly cards: readonly KanbanCard<TData>[];
  /** Optional non-negative work-in-progress limit enforced for cross-column moves. */
  readonly wipLimit?: number;
}

export interface KanbanMove {
  /** Identifier of the card being moved. */
  readonly cardId: string;
  /** Identifier of the column containing the card before the move. */
  readonly fromColumnId: string;
  /** Zero-based card position before the move. */
  readonly fromIndex: number;
  /** Identifier of the requested destination column. */
  readonly toColumnId: string;
  /** Zero-based requested position within the destination column. */
  readonly toIndex: number;
}

export interface KanbanMovePermission {
  /** Whether the requested move may be applied. */
  readonly allowed: boolean;
  /** Human-readable rejection reason announced and displayed when movement is denied. */
  readonly reason?: string;
}

export interface KanbanServerAdapter<TData> {
  /** Persistence timing: optimistic publishes before the promise, pessimistic after success. */
  readonly mode?: "optimistic" | "pessimistic";
  /** Persists a permitted move against the proposed immutable board state. */
  readonly move: (move: KanbanMove, columns: readonly KanbanColumn<TData>[]) => Promise<void>;
}

export interface KanbanVirtualWindow {
  /** Inclusive zero-based index of the first rendered card. */
  readonly start: number;
  /** Exclusive zero-based index after the final rendered card. */
  readonly end: number;
}

export interface KanbanVirtualization {
  /** Positive fixed row size used to preserve space for unrendered cards. */
  readonly rowSize: number;
  /** Returns the current validated render window for one column. */
  readonly getWindow: (columnId: string) => KanbanVirtualWindow;
  /** Requests a larger or different window after the user activates `showMore`. */
  readonly onWindowChange: (columnId: string, window: KanbanVirtualWindow) => void;
}

export type KanbanChangeReason =
  | "button"
  | "destination"
  | "keyboard-preview"
  | "keyboard-drop"
  | "keyboard-cancel"
  | "pointer-drop"
  | "undo";

export interface KanbanMessages {
  /** Visible maturity label displayed beside the board name. */
  readonly beta: string;
  /** Label for selecting the full board presentation. */
  readonly boardView: string;
  /** Label for selecting the narrow-screen list presentation. */
  readonly listView: string;
  /** Label for moving a card one position earlier in its column. */
  readonly moveUp: string;
  /** Label for moving a card one position later in its column. */
  readonly moveDown: string;
  /** Label for moving a card to the previous directional column. */
  readonly movePrevious: string;
  /** Label for moving a card to the next directional column. */
  readonly moveNext: string;
  /** Visible label for the destination-column selection control. */
  readonly moveTo: string;
  /** Label for restoring the last captured board snapshot. */
  readonly undo: string;
  /** Label for retrying a failed server-adapter move. */
  readonly retry: string;
  /** Builds the optional card-count and work-in-progress limit summary. */
  readonly wip: (count: number, limit?: number) => string;
  /** Builds keyboard pickup instructions for the active card. */
  readonly pickedUp: (title: string) => string;
  /** Builds successful movement feedback with destination and one-based position. */
  readonly moved: (title: string, column: string, position: number) => string;
  /** Builds feedback after keyboard movement is cancelled and restored. */
  readonly cancelled: (title: string) => string;
  /** Builds the rejection reason when a destination has reached its WIP limit. */
  readonly wipRejected: (column: string, limit: number) => string;
  /** Persistent keyboard and alternative movement instructions linked to the board. */
  readonly instructions: string;
  /** Accessible name for the optional board/list presentation control group. */
  readonly presentationLabel: string;
  /** Builds the accessible name shared by a card's handle and movement controls. */
  readonly moveCard: (title: string) => string;
  /** Fallback reason shown when a custom movement policy denies a move without detail. */
  readonly notAllowed: string;
  /** Fallback recovery message when server persistence rejects without an Error. */
  readonly persistenceError: string;
  /** Label requesting a larger virtual window for one column. */
  readonly showMore: string;
  /** Builds feedback after an undo restores the previous card order. */
  readonly restored: (count: number) => string;
}

export interface KanbanProps<TData> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onChange"
> {
  /** Required accessible board name used by the outer region. */
  readonly label: string;
  /** Controlled ordered columns; use with `onColumnsChange` and omit `defaultColumns`. */
  readonly columns?: readonly KanbanColumn<TData>[];
  /** Initial ordered columns for uncontrolled board state. */
  readonly defaultColumns?: readonly KanbanColumn<TData>[];
  /** Reports immutable board updates with full move coordinates and interaction reason. */
  readonly onColumnsChange?: (
    columns: readonly KanbanColumn<TData>[],
    detail: KanbanMove & { readonly reason: KanbanChangeReason },
  ) => void;
  /** Renders consumer card content while preserving Mergora movement controls and semantics. */
  readonly renderCard?: (card: KanbanCard<TData>) => ReactNode;
  /** Applies a consumer movement policy after built-in WIP-limit checks. */
  readonly canMove?: (
    move: KanbanMove,
    columns: readonly KanbanColumn<TData>[],
  ) => boolean | KanbanMovePermission;
  /** Enables optimistic or pessimistic persistence; false removes async busy, retry, and rollback behavior. */
  readonly serverAdapter?: false | KanbanServerAdapter<TData>;
  /** Shows card counts and WIP limits in column headers; false removes those summaries. */
  readonly showWipStatus?: boolean;
  /** Adds a board/list presentation switch; false keeps the board view and removes its controls. */
  readonly mobileListAlternative?: boolean;
  /** Adds polite pickup, move, denial, and restoration feedback; false removes the live region. */
  readonly announceMoves?: boolean;
  /** Captures one pre-move snapshot and exposes undo; false removes snapshot state and action UI. */
  readonly undoable?: boolean;
  /** Enables consumer-windowed card rendering; false renders every card and removes `showMore`. */
  readonly virtualization?: false | KanbanVirtualization;
  /** Disables every card movement path while keeping board structure and content readable. */
  readonly disabled?: boolean;
  /** Localized board instructions, labels, status copy, and recovery messages. */
  readonly messages?: Partial<KanbanMessages>;
}

const defaultMessages: KanbanMessages = {
  beta: "Beta",
  boardView: "Board view",
  listView: "Mobile list view",
  moveUp: "Move up",
  moveDown: "Move down",
  movePrevious: "Move to previous column",
  moveNext: "Move to next column",
  moveTo: "Move to column",
  undo: "Undo last move",
  retry: "Retry move",
  wip: (count, limit) => (limit === undefined ? `${count} cards` : `${count} of ${limit} cards`),
  pickedUp: (title) =>
    `Picked up ${title}. Use arrow keys to move, Enter to drop, or Escape to cancel.`,
  moved: (title, column, position) => `${title} moved to ${column}, position ${position}.`,
  cancelled: (title) => `Movement cancelled. ${title} returned to its original position.`,
  wipRejected: (column, limit) => `${column} has reached its work-in-progress limit of ${limit}.`,
  instructions:
    "Every card includes move buttons. Focus its move handle and press Space for spatial keyboard movement; Enter drops and Escape cancels.",
  presentationLabel: "Kanban presentation",
  moveCard: (title) => `Move ${title}`,
  notAllowed: "This move is not allowed.",
  persistenceError: "The move could not be saved. Retry it or keep the restored board order.",
  showMore: "Show more cards",
  restored: (count) => `Restored the previous order of ${count} cards.`,
};

function classes(...values: readonly (string | false | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

function locateCard<TData>(columns: readonly KanbanColumn<TData>[], cardId: string) {
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const cardIndex = columns[columnIndex]!.cards.findIndex((card) => card.id === cardId);
    if (cardIndex >= 0)
      return { columnIndex, cardIndex, card: columns[columnIndex]!.cards[cardIndex]! };
  }
  return null;
}

export function moveKanbanCard<TData>(
  columns: readonly KanbanColumn<TData>[],
  move: KanbanMove,
): readonly KanbanColumn<TData>[] {
  const sourceColumnIndex = columns.findIndex((column) => column.id === move.fromColumnId);
  const targetColumnIndex = columns.findIndex((column) => column.id === move.toColumnId);
  if (sourceColumnIndex < 0 || targetColumnIndex < 0) return columns;
  const sourceCards = [...columns[sourceColumnIndex]!.cards];
  const actualSourceIndex = sourceCards.findIndex((card) => card.id === move.cardId);
  if (actualSourceIndex < 0) return columns;
  const [card] = sourceCards.splice(actualSourceIndex, 1);
  if (sourceColumnIndex === targetColumnIndex) {
    sourceCards.splice(Math.max(0, Math.min(move.toIndex, sourceCards.length)), 0, card!);
    return columns.map((column, index) =>
      index === sourceColumnIndex ? { ...column, cards: sourceCards } : column,
    );
  }
  const targetCards = [...columns[targetColumnIndex]!.cards];
  targetCards.splice(Math.max(0, Math.min(move.toIndex, targetCards.length)), 0, card!);
  return columns.map((column, index) =>
    index === sourceColumnIndex
      ? { ...column, cards: sourceCards }
      : index === targetColumnIndex
        ? { ...column, cards: targetCards }
        : column,
  );
}

export function Kanban<TData>({
  label,
  columns: controlledColumns,
  defaultColumns: defaultColumnsProp,
  onColumnsChange,
  renderCard,
  canMove,
  serverAdapter = false,
  showWipStatus = false,
  mobileListAlternative = false,
  announceMoves = false,
  undoable = false,
  virtualization = false,
  disabled = false,
  messages: messageOverrides,
  className,
  ...props
}: KanbanProps<TData>): ReactElement {
  const defaultColumns = defaultColumnsProp ?? [];
  if (controlledColumns !== undefined && defaultColumnsProp !== undefined) {
    throw new Error("Mergora Kanban controlled columns cannot be combined with defaultColumns.");
  }
  const messages = { ...defaultMessages, ...messageOverrides };
  const instructionsId = `${useId().replaceAll(":", "")}-instructions`;
  const [internalColumns, setInternalColumns] =
    useState<readonly KanbanColumn<TData>[]>(defaultColumns);
  const [view, setView] = useState<"board" | "list">("board");
  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retryMove, setRetryMove] = useState<KanbanMove | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<readonly KanbanColumn<TData>[] | null>(null);
  const keyboardSnapshot = useRef<readonly KanbanColumn<TData>[] | null>(null);
  const draggedId = useRef<string | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const columns = controlledColumns ?? internalColumns;
  const effectiveView = mobileListAlternative ? view : "board";
  const allCardIds = columns.flatMap((column) => column.cards.map((card) => card.id));
  if (
    new Set(columns.map((column) => column.id)).size !== columns.length ||
    new Set(allCardIds).size !== allCardIds.length
  ) {
    throw new Error("Mergora Kanban column and card IDs must be unique.");
  }
  if (
    columns.some(
      (column) =>
        column.id.length === 0 ||
        (column.wipLimit !== undefined &&
          (!Number.isInteger(column.wipLimit) || column.wipLimit < 0)),
    ) ||
    columns.some((column) => column.cards.some((card) => card.id.length === 0))
  ) {
    throw new Error("Mergora Kanban requires non-empty IDs and non-negative integer WIP limits.");
  }
  if (
    virtualization !== false &&
    (!Number.isFinite(virtualization.rowSize) || virtualization.rowSize <= 0)
  ) {
    throw new Error("Mergora Kanban virtualization requires a positive rowSize.");
  }

  const announce = (message: string) => {
    if (announceMoves) setAnnouncement(message);
  };
  const publish = (
    next: readonly KanbanColumn<TData>[],
    move: KanbanMove,
    reason: KanbanChangeReason,
  ) => {
    if (controlledColumns === undefined) setInternalColumns(next);
    onColumnsChange?.(next, { ...move, reason });
  };
  const permissionFor = (move: KanbanMove) => {
    const target = columns.find((column) => column.id === move.toColumnId);
    const changingColumn = move.fromColumnId !== move.toColumnId;
    if (
      target?.wipLimit !== undefined &&
      changingColumn &&
      target.cards.length >= target.wipLimit
    ) {
      return { allowed: false, reason: messages.wipRejected(target.title, target.wipLimit) };
    }
    const result = canMove?.(move, columns) ?? true;
    return typeof result === "boolean" ? { allowed: result, reason: messages.notAllowed } : result;
  };
  const focusCard = (id: string) =>
    queueMicrotask(() => {
      const handle = handles.current.get(id);
      handle?.focus();
      handle?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    });
  const execute = async (
    move: KanbanMove,
    reason: KanbanChangeReason,
    snapshot = columns,
    alreadyPreviewed = false,
  ) => {
    if (!alreadyPreviewed) {
      const permission = permissionFor(move);
      if (!permission.allowed) {
        setError(permission.reason ?? messages.notAllowed);
        announce(permission.reason ?? messages.notAllowed);
        return;
      }
    }
    const next = alreadyPreviewed ? columns : moveKanbanCard(columns, move);
    const target = next.find((column) => column.id === move.toColumnId)!;
    const card = target.cards.find((item) => item.id === move.cardId)!;
    setError("");
    setRetryMove(null);
    if (undoable) setUndoSnapshot(snapshot);
    if (serverAdapter === false) {
      if (!alreadyPreviewed) publish(next, move, reason);
      else onColumnsChange?.(next, { ...move, reason });
      announce(
        messages.moved(
          card.title,
          target.title,
          target.cards.findIndex((item) => item.id === card.id) + 1,
        ),
      );
      focusCard(card.id);
      return;
    }
    const mode = serverAdapter.mode ?? "optimistic";
    if (mode === "optimistic" && !alreadyPreviewed) publish(next, move, reason);
    setPending(true);
    try {
      await serverAdapter.move(move, next);
      if (mode === "pessimistic" && !alreadyPreviewed) publish(next, move, reason);
      if (alreadyPreviewed) onColumnsChange?.(next, { ...move, reason });
      announce(
        messages.moved(
          card.title,
          target.title,
          target.cards.findIndex((item) => item.id === card.id) + 1,
        ),
      );
      focusCard(card.id);
    } catch (caught) {
      if ((mode === "optimistic" || alreadyPreviewed) && controlledColumns === undefined)
        setInternalColumns(snapshot);
      if (mode === "optimistic" || alreadyPreviewed)
        onColumnsChange?.(snapshot, { ...move, reason: "keyboard-cancel" });
      setError(caught instanceof Error ? caught.message : messages.persistenceError);
      setRetryMove(move);
      focusCard(card.id);
    } finally {
      setPending(false);
    }
  };
  const simpleMove = (
    cardId: string,
    columnOffset: number,
    cardOffset: number,
    reason: KanbanChangeReason,
  ) => {
    const location = locateCard(columns, cardId);
    if (!location) return;
    const targetColumnIndex = Math.max(
      0,
      Math.min(columns.length - 1, location.columnIndex + columnOffset),
    );
    const targetColumn = columns[targetColumnIndex]!;
    const targetIndex =
      columnOffset === 0
        ? Math.max(0, Math.min(targetColumn.cards.length - 1, location.cardIndex + cardOffset))
        : Math.min(location.cardIndex, targetColumn.cards.length);
    if (targetColumnIndex === location.columnIndex && targetIndex === location.cardIndex) return;
    void execute(
      {
        cardId,
        fromColumnId: columns[location.columnIndex]!.id,
        fromIndex: location.cardIndex,
        toColumnId: targetColumn.id,
        toIndex: targetIndex,
      },
      reason,
    );
  };
  const previewKeyboardMove = (cardId: string, columnOffset: number, cardOffset: number) => {
    const location = locateCard(columns, cardId);
    if (!location) return;
    const targetColumnIndex = Math.max(
      0,
      Math.min(columns.length - 1, location.columnIndex + columnOffset),
    );
    const targetColumn = columns[targetColumnIndex]!;
    const targetIndex =
      columnOffset === 0
        ? Math.max(0, Math.min(targetColumn.cards.length - 1, location.cardIndex + cardOffset))
        : Math.min(location.cardIndex, targetColumn.cards.length);
    const move: KanbanMove = {
      cardId,
      fromColumnId: columns[location.columnIndex]!.id,
      fromIndex: location.cardIndex,
      toColumnId: targetColumn.id,
      toIndex: targetIndex,
    };
    const permission = permissionFor(move);
    if (!permission.allowed) {
      announce(permission.reason ?? messages.notAllowed);
      return;
    }
    const next = moveKanbanCard(columns, move);
    publish(next, move, "keyboard-preview");
    announce(messages.moved(location.card.title, targetColumn.title, targetIndex + 1));
    focusCard(cardId);
  };
  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, cardId: string) => {
    const location = locateCard(columns, cardId);
    if (!location || disabled || pending || location.card.disabled) return;
    if ((event.key === " " || event.key === "Enter") && grabbedId === null) {
      event.preventDefault();
      keyboardSnapshot.current = columns;
      setGrabbedId(cardId);
      announce(messages.pickedUp(location.card.title));
      return;
    }
    if (grabbedId !== cardId) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const direction = getComputedStyle(event.currentTarget).direction;
      const previousKey = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
      const nextKey = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
      previewKeyboardMove(
        cardId,
        event.key === previousKey ? -1 : event.key === nextKey ? 1 : 0,
        event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0,
      );
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const original = keyboardSnapshot.current ?? columns;
      const before = locateCard(original, cardId)!;
      const after = locateCard(columns, cardId)!;
      const move = {
        cardId,
        fromColumnId: original[before.columnIndex]!.id,
        fromIndex: before.cardIndex,
        toColumnId: columns[after.columnIndex]!.id,
        toIndex: after.cardIndex,
      };
      setGrabbedId(null);
      keyboardSnapshot.current = null;
      void execute(move, "keyboard-drop", original, true);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      const snapshot = keyboardSnapshot.current;
      if (snapshot) {
        const before = locateCard(columns, cardId)!;
        const after = locateCard(snapshot, cardId)!;
        const move = {
          cardId,
          fromColumnId: columns[before.columnIndex]!.id,
          fromIndex: before.cardIndex,
          toColumnId: snapshot[after.columnIndex]!.id,
          toIndex: after.cardIndex,
        };
        if (controlledColumns === undefined) setInternalColumns(snapshot);
        onColumnsChange?.(snapshot, { ...move, reason: "keyboard-cancel" });
      }
      keyboardSnapshot.current = null;
      setGrabbedId(null);
      announce(messages.cancelled(location.card.title));
      focusCard(cardId);
    }
  };
  const onDrop = (event: DragEvent<HTMLElement>, columnIndex: number, cardIndex: number) => {
    event.preventDefault();
    const cardId = draggedId.current;
    const location = cardId ? locateCard(columns, cardId) : null;
    if (cardId && location) {
      void execute(
        {
          cardId,
          fromColumnId: columns[location.columnIndex]!.id,
          fromIndex: location.cardIndex,
          toColumnId: columns[columnIndex]!.id,
          toIndex: cardIndex,
        },
        "pointer-drop",
      );
    }
    draggedId.current = null;
  };

  return (
    <div
      {...props}
      className={classes("mrg-kanban", className)}
      data-slot="kanban"
      data-maturity="beta"
      data-view={effectiveView}
      role="region"
      aria-label={label}
      aria-busy={pending || undefined}
      aria-disabled={disabled || undefined}
    >
      <div className="mrg-kanban__heading">
        <span>
          <strong>{label}</strong>
          <span className="mrg-kanban__beta">{messages.beta}</span>
        </span>
        <div className="mrg-kanban__heading-actions">
          {mobileListAlternative ? (
            <div role="group" aria-label={messages.presentationLabel}>
              <button
                type="button"
                aria-pressed={effectiveView === "board"}
                onClick={() => setView("board")}
              >
                {messages.boardView}
              </button>
              <button
                type="button"
                aria-pressed={effectiveView === "list"}
                onClick={() => setView("list")}
              >
                {messages.listView}
              </button>
            </div>
          ) : null}
          {undoable && undoSnapshot ? (
            <button
              type="button"
              onClick={() => {
                const snapshot = undoSnapshot;
                if (controlledColumns === undefined) setInternalColumns(snapshot);
                setUndoSnapshot(null);
                onColumnsChange?.(snapshot, {
                  cardId: "",
                  fromColumnId: "",
                  fromIndex: -1,
                  toColumnId: "",
                  toIndex: -1,
                  reason: "undo",
                });
                announce(
                  messages.restored(
                    snapshot.reduce((count, column) => count + column.cards.length, 0),
                  ),
                );
              }}
            >
              {messages.undo}
            </button>
          ) : null}
        </div>
      </div>
      <p id={instructionsId} className="mrg-kanban__instructions">
        {messages.instructions}
      </p>
      {error ? (
        <div className="mrg-kanban__error" role="alert">
          <span>{error}</span>
          {retryMove ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void execute(retryMove, "destination")}
            >
              {messages.retry}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mrg-kanban__columns" aria-describedby={instructionsId}>
        {columns.map((column, columnIndex) => {
          const window =
            virtualization === false
              ? { start: 0, end: column.cards.length }
              : virtualization.getWindow(column.id);
          if (
            !Number.isInteger(window.start) ||
            !Number.isInteger(window.end) ||
            window.start < 0 ||
            window.end < window.start
          ) {
            throw new Error(
              `Mergora Kanban virtualization returned an invalid window for column ${column.id}.`,
            );
          }
          const start = Math.max(0, window.start);
          const end = Math.min(column.cards.length, window.end);
          const visibleCards = column.cards.slice(start, end);
          return (
            <section
              key={column.id}
              className="mrg-kanban__column"
              aria-labelledby={`${instructionsId}-${column.id}`}
            >
              <header>
                <h3 id={`${instructionsId}-${column.id}`}>{column.title}</h3>
                {showWipStatus ? (
                  <span
                    data-slot="kanban-wip-status"
                    data-at-limit={
                      (column.wipLimit !== undefined && column.cards.length >= column.wipLimit) ||
                      undefined
                    }
                  >
                    {messages.wip(column.cards.length, column.wipLimit)}
                  </span>
                ) : null}
              </header>
              <ol
                onDragOver={(event) => {
                  if (!disabled) event.preventDefault();
                }}
                onDrop={(event) => onDrop(event, columnIndex, column.cards.length)}
              >
                {virtualization !== false && start > 0 ? (
                  <li aria-hidden="true" style={{ blockSize: start * virtualization.rowSize }} />
                ) : null}
                {visibleCards.map((card, visibleIndex) => {
                  const cardIndex = start + visibleIndex;
                  return (
                    <li
                      key={card.id}
                      data-slot="kanban-card"
                      data-grabbed={grabbedId === card.id || undefined}
                      onDragOver={(event) => {
                        if (!disabled) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.stopPropagation();
                        onDrop(event, columnIndex, cardIndex);
                      }}
                    >
                      <button
                        ref={(element) => {
                          if (element) handles.current.set(card.id, element);
                          else handles.current.delete(card.id);
                        }}
                        type="button"
                        className="mrg-kanban__handle"
                        disabled={disabled || pending || card.disabled}
                        draggable={!disabled && !pending && !card.disabled}
                        aria-pressed={grabbedId === card.id}
                        aria-label={messages.moveCard(card.title)}
                        onKeyDown={(event) => onHandleKeyDown(event, card.id)}
                        onDragStart={(event) => {
                          draggedId.current = card.id;
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", card.id);
                        }}
                        onDragEnd={() => {
                          draggedId.current = null;
                        }}
                      >
                        <span aria-hidden="true">↕</span>
                      </button>
                      <div className="mrg-kanban__card-content">
                        {renderCard?.(card) ?? (
                          <>
                            <strong>{card.title}</strong>
                            {card.description ? <p>{card.description}</p> : null}
                          </>
                        )}
                      </div>
                      <div
                        className="mrg-kanban__card-actions"
                        role="group"
                        aria-label={messages.moveCard(card.title)}
                      >
                        <button
                          type="button"
                          disabled={disabled || pending || card.disabled || cardIndex === 0}
                          onClick={() => simpleMove(card.id, 0, -1, "button")}
                        >
                          {messages.moveUp}
                        </button>
                        <button
                          type="button"
                          disabled={
                            disabled ||
                            pending ||
                            card.disabled ||
                            cardIndex === column.cards.length - 1
                          }
                          onClick={() => simpleMove(card.id, 0, 1, "button")}
                        >
                          {messages.moveDown}
                        </button>
                        <button
                          type="button"
                          disabled={disabled || pending || card.disabled || columnIndex === 0}
                          onClick={() => simpleMove(card.id, -1, 0, "button")}
                        >
                          {messages.movePrevious}
                        </button>
                        <button
                          type="button"
                          disabled={
                            disabled ||
                            pending ||
                            card.disabled ||
                            columnIndex === columns.length - 1
                          }
                          onClick={() => simpleMove(card.id, 1, 0, "button")}
                        >
                          {messages.moveNext}
                        </button>
                        <label>
                          <span>{messages.moveTo}</span>
                          <select
                            value={column.id}
                            disabled={disabled || pending || card.disabled}
                            onChange={(event) => {
                              const target = columns.find(
                                (candidate) => candidate.id === event.currentTarget.value,
                              )!;
                              void execute(
                                {
                                  cardId: card.id,
                                  fromColumnId: column.id,
                                  fromIndex: cardIndex,
                                  toColumnId: target.id,
                                  toIndex: target.cards.length,
                                },
                                "destination",
                              );
                            }}
                          >
                            {columns.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </li>
                  );
                })}
                {virtualization !== false && end < column.cards.length ? (
                  <li
                    aria-hidden="true"
                    style={{ blockSize: (column.cards.length - end) * virtualization.rowSize }}
                  />
                ) : null}
              </ol>
              {virtualization !== false ? (
                <button
                  type="button"
                  disabled={end >= column.cards.length}
                  onClick={() =>
                    virtualization.onWindowChange(column.id, {
                      start,
                      end: Math.min(column.cards.length, end + Math.max(1, end - start)),
                    })
                  }
                >
                  {messages.showMore}
                </button>
              ) : null}
            </section>
          );
        })}
      </div>
      {announceMoves ? (
        <div
          role="status"
          aria-live="polite"
          className="mrg-kanban__visually-hidden"
          data-slot="kanban-announcer"
        >
          {announcement}
        </div>
      ) : null}
    </div>
  );
}
