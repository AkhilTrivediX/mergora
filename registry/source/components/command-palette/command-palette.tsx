"use client";

import "./command-palette.css";

import {
  Fragment,
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

export interface CommandPaletteItem {
  /** Stable unique identity within its command page. */
  readonly id: string;
  /** Plain visible command label used by filtering and activation. */
  readonly label: string;
  /** Optional supporting command copy included in built-in filtering. */
  readonly description?: string;
  /** Optional plain group label used for visual sections and filtering. */
  readonly group?: string;
  /** Additional plain terms included in the built-in command filter. */
  readonly keywords?: readonly string[];
  /** Optional localized keyboard shortcut displayed with executable commands. */
  readonly shortcut?: string;
  /** Keeps the command visible while removing it from focus and execution. */
  readonly disabled?: boolean;
  /** Nested command page opened instead of executing this command. */
  readonly children?: readonly CommandPaletteItem[];
  /** Visible page heading for children; defaults to this command's label. */
  readonly pageLabel?: string;
}

export interface CommandPaletteNavigationAdapter {
  /** Performs optional consumer navigation after onCommand receives an executable command. */
  readonly navigate: (command: CommandPaletteItem) => void;
}

export interface CommandPaletteProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Persistent accessible name and top-level heading for the command surface. */
  readonly label: string;
  /** Ordered top-level command tree searched and navigated by the palette. */
  readonly commands: readonly CommandPaletteItem[];
  /** Optional visible guidance associated with the dialog or embedded region. */
  readonly description?: ReactNode;
  /** Controlled modal visibility; embedded presentation remains persistently open. */
  readonly open?: boolean;
  /** Initial modal visibility for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Reports modal open-state changes; embedded presentation does not close. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Controlled search query for the current command page. */
  readonly query?: string;
  /** Initial search query for uncontrolled use. */
  readonly defaultQuery?: string;
  /** Reports every search-query edit and page-reset clear. */
  readonly onQueryChange?: (query: string) => void;
  /** Required execution callback invoked for enabled commands without child pages. */
  readonly onCommand: (command: CommandPaletteItem) => void;
  /** Modal dialog or persistently open embedded-region presentation. */
  readonly presentation?: "embedded" | "modal";
  /** Optional navigation side effect; false removes adapter calls while onCommand still runs. */
  readonly navigationAdapter?: false | CommandPaletteNavigationAdapter;
  /** Marks the search input and command results busy. */
  readonly loading?: boolean;
  /** Recoverable asynchronous error text; omitting it removes the retry alert. */
  readonly loadError?: string;
  /** Retries command loading and is required whenever loadError is present. */
  readonly onRetry?: () => void;
  /** Localized search-input placeholder. */
  readonly placeholder?: string;
  /** Localized result shown when the current command page has no matches. */
  readonly emptyMessage?: string;
  /** Applies built-in search when true; false preserves consumer-ranked or remote-filtered commands. */
  readonly shouldFilter?: boolean;
  /** Adds a non-interactive active-command preview; false removes the preview region. */
  readonly showExecutionPreview?: boolean;
}

function assertVisible(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`Mergora CommandPalette ${name} must not be empty.`);
}

function commandText(command: CommandPaletteItem): string {
  return [command.label, command.description, command.group, ...(command.keywords ?? [])]
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .toLocaleLowerCase();
}

function assertCommands(commands: readonly CommandPaletteItem[], path = "root"): void {
  const ids = new Set<string>();
  for (const command of commands) {
    assertVisible(command.id, `${path} command id`);
    assertVisible(command.label, `${path} command label`);
    if (ids.has(command.id)) {
      throw new TypeError(
        `Mergora CommandPalette command id ${command.id} is duplicated in ${path}.`,
      );
    }
    ids.add(command.id);
    if (command.children !== undefined) {
      if (command.children.length === 0) {
        throw new TypeError("Mergora CommandPalette child pages must not be empty.");
      }
      assertCommands(command.children, command.pageLabel ?? command.label);
    }
  }
}

function enabledIndex(items: readonly CommandPaletteItem[], start: number, delta: 1 | -1): number {
  if (items.length === 0) return -1;
  const origin = start < 0 && delta === -1 ? 0 : start;
  for (let offset = 1; offset <= items.length; offset += 1) {
    const candidate = (origin + offset * delta + items.length) % items.length;
    if (items[candidate]?.disabled !== true) return candidate;
  }
  return -1;
}

export const CommandPalette = forwardRef<HTMLDivElement, CommandPaletteProps>(
  function CommandPalette(
    {
      "aria-describedby": ariaDescribedBy,
      className,
      commands,
      defaultOpen = false,
      defaultQuery = "",
      description,
      emptyMessage = "No commands found.",
      label,
      loadError,
      loading = false,
      navigationAdapter = false,
      onCommand,
      onOpenChange,
      onQueryChange,
      onRetry,
      open,
      placeholder = "Search commands",
      presentation = "modal",
      query,
      shouldFilter = true,
      showExecutionPreview = false,
      ...props
    },
    ref,
  ): ReactElement | null {
    assertVisible(label, "label");
    assertVisible(emptyMessage, "empty message");
    assertVisible(placeholder, "placeholder");
    assertCommands(commands);
    if (loadError !== undefined && onRetry === undefined) {
      throw new TypeError("Mergora CommandPalette loadError requires onRetry.");
    }
    const generatedId = `mrg-command-palette-${useId().replaceAll(":", "")}`;
    const labelId = `${generatedId}-label`;
    const descriptionId = `${generatedId}-description`;
    const listboxId = `${generatedId}-listbox`;
    const describedBy = [description === undefined ? undefined : descriptionId, ariaDescribedBy]
      .filter((value): value is string => value !== undefined && value.trim().length > 0)
      .join(" ");
    const controlledOpen = open !== undefined;
    const controlledQuery = query !== undefined;
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const [internalQuery, setInternalQuery] = useState(defaultQuery);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [pageStack, setPageStack] = useState<
      readonly { readonly label: string; readonly commands: readonly CommandPaletteItem[] }[]
    >([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const composing = useRef(false);
    const restoreTarget = useRef<HTMLElement | null>(null);
    const wasOpen = useRef(false);
    const currentOpen = presentation === "embedded" ? true : controlledOpen ? open : internalOpen;
    const currentQuery = controlledQuery ? query : internalQuery;
    const currentPage = pageStack[pageStack.length - 1];
    const currentCommands = currentPage?.commands ?? commands;
    const currentLabel = currentPage?.label ?? label;
    const normalizedQuery = currentQuery.trim().toLocaleLowerCase();
    const matches = useMemo(
      () =>
        !shouldFilter || normalizedQuery.length === 0
          ? currentCommands
          : currentCommands.filter((command) => commandText(command).includes(normalizedQuery)),
      [currentCommands, normalizedQuery, shouldFilter],
    );
    const active = activeIndex < 0 ? undefined : matches[activeIndex];

    const setOpen = (next: boolean) => {
      if (!controlledOpen) setInternalOpen(next);
      onOpenChange?.(next);
    };
    const setQuery = (next: string) => {
      if (!controlledQuery) setInternalQuery(next);
      onQueryChange?.(next);
    };

    useEffect(() => {
      if (presentation === "modal" && currentOpen && !wasOpen.current) {
        restoreTarget.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (presentation === "modal" && !currentOpen && wasOpen.current)
        restoreTarget.current?.focus();
      wasOpen.current = currentOpen;
    }, [currentOpen, presentation]);

    useEffect(() => {
      if (activeIndex >= matches.length || matches[activeIndex]?.disabled === true)
        setActiveIndex(-1);
    }, [activeIndex, matches]);

    if (!currentOpen) return null;
    const execute = (command: CommandPaletteItem) => {
      if (command.disabled === true) return;
      if (command.children !== undefined) {
        setPageStack((pages) => [
          ...pages,
          { commands: command.children ?? [], label: command.pageLabel ?? command.label },
        ]);
        setQuery("");
        setActiveIndex(-1);
        return;
      }
      onCommand(command);
      if (navigationAdapter !== false) navigationAdapter.navigate(command);
      if (presentation === "modal") setOpen(false);
    };
    const previousPage = () => {
      setPageStack((pages) => pages.slice(0, -1));
      setQuery("");
      setActiveIndex(-1);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (composing.current || event.nativeEvent.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (pageStack.length > 0) previousPage();
        else if (presentation === "modal") setOpen(false);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          enabledIndex(matches, current, event.key === "ArrowDown" ? 1 : -1),
        );
      } else if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(enabledIndex(matches, -1, 1));
      } else if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(enabledIndex(matches, 0, -1));
      } else if (event.key === "Enter" && active !== undefined) {
        event.preventDefault();
        execute(active);
      } else if (event.key === "Tab" && presentation === "modal") {
        const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
          "input, button:not([disabled])",
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    return (
      <div
        className={
          presentation === "modal"
            ? "mrg-command-palette__backdrop"
            : "mrg-command-palette__embedded"
        }
        data-presentation={presentation}
        data-slot={
          presentation === "modal" ? "command-palette-backdrop" : "command-palette-embedded"
        }
      >
        <div
          {...props}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          aria-labelledby={labelId}
          aria-modal={presentation === "modal" || undefined}
          className={["mrg-command-palette", className].filter(Boolean).join(" ")}
          data-slot="command-palette"
          onKeyDown={handleKeyDown}
          ref={ref}
          role={presentation === "modal" ? "dialog" : "region"}
        >
          <div className="mrg-command-palette__heading">
            <h2 id={labelId}>{currentLabel}</h2>
            <span className="mrg-command-palette__heading-actions">
              {pageStack.length === 0 ? null : (
                <button
                  aria-label="Return to previous command page"
                  onClick={previousPage}
                  type="button"
                >
                  Back
                </button>
              )}
              {presentation === "modal" ? (
                <button aria-label={`Close ${label}`} onClick={() => setOpen(false)} type="button">
                  ×
                </button>
              ) : null}
            </span>
          </div>
          {description === undefined ? null : (
            <p className="mrg-command-palette__description" id={descriptionId}>
              {description}
            </p>
          )}
          <input
            aria-activedescendant={
              active === undefined ? undefined : `${generatedId}-command-${active.id}`
            }
            aria-controls={listboxId}
            aria-expanded="true"
            aria-label={placeholder}
            aria-busy={loading || undefined}
            autoComplete="off"
            onCompositionEnd={(event) => {
              composing.current = false;
              setQuery(event.currentTarget.value);
              setActiveIndex(-1);
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(-1);
            }}
            placeholder={placeholder}
            ref={inputRef}
            role="combobox"
            value={currentQuery}
          />
          <ul id={listboxId} role="listbox">
            {matches.length === 0 ? (
              <li
                aria-disabled="true"
                aria-selected="false"
                className="mrg-command-palette__empty"
                role="option"
              >
                {loading ? "Loading commands…" : emptyMessage}
              </li>
            ) : null}
            {matches.map((command, index) => {
              const previousGroup = index === 0 ? undefined : matches[index - 1]?.group;
              const showGroup = command.group !== undefined && command.group !== previousGroup;
              return (
                <Fragment key={command.id}>
                  {showGroup ? (
                    <li className="mrg-command-palette__group" role="presentation">
                      {command.group}
                    </li>
                  ) : null}
                  <li
                    aria-disabled={command.disabled || undefined}
                    aria-selected={index === activeIndex}
                    data-active={index === activeIndex || undefined}
                    data-disabled={command.disabled || undefined}
                    id={`${generatedId}-command-${command.id}`}
                    onClick={() => execute(command)}
                    onPointerMove={() => command.disabled !== true && setActiveIndex(index)}
                    role="option"
                  >
                    <span className="mrg-command-palette__command-copy">
                      <strong>{command.label}</strong>
                      {command.description === undefined ? null : (
                        <small>{command.description}</small>
                      )}
                    </span>
                    {command.children !== undefined ? (
                      <span aria-label="Opens command page" className="mrg-command-palette__page">
                        Next
                      </span>
                    ) : command.shortcut === undefined ? null : (
                      <kbd aria-label={`Shortcut ${command.shortcut}`}>{command.shortcut}</kbd>
                    )}
                  </li>
                </Fragment>
              );
            })}
          </ul>
          {loadError === undefined ? null : (
            <div className="mrg-command-palette__load-error" role="alert">
              <span>{loadError}</span>
              <button onClick={onRetry} type="button">
                Retry
              </button>
            </div>
          )}
          {showExecutionPreview ? (
            <aside
              aria-live="polite"
              className="mrg-command-palette__preview"
              data-slot="command-palette-execution-preview"
            >
              {active === undefined ? (
                "Move to a command to preview its effect."
              ) : (
                <>
                  <strong>{active.label}</strong>
                  <span>{active.description ?? "Runs this command immediately."}</span>
                </>
              )}
            </aside>
          ) : null}
        </div>
      </div>
    );
  },
);
