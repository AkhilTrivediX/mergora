"use client";

import "./command-center.css";

import { useEffect, useState, type HTMLAttributes } from "react";

import { Alert } from "../../components/alert/alert.js";
import { Button } from "../../components/button/button.js";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "../../components/command-palette/command-palette.js";
import type { CommandCenterAdapter } from "./command-center-adapter.js";
import { useCommandCenter } from "./command-center-state.js";

export interface CommandCenterProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "role"
> {
  /** Consumer adapter that owns command discovery, authorization, and execution. */
  readonly adapter: CommandCenterAdapter;
  /** Adds polite result-count announcements; false removes their live output. */
  readonly announceResultCount?: boolean;
  /** Initial open state for uncontrolled modal presentation. */
  readonly defaultOpen?: boolean;
  /** Initial query for uncontrolled search. */
  readonly defaultQuery?: string;
  /** Adds the guarded Mod+K global listener; false installs no document-level shortcut. */
  readonly globalShortcut?: false | "mod-k";
  /** Non-negative character threshold below which adapter search remains idle. */
  readonly minimumQueryLength?: number;
  /** Adds a mobile-friendly entry action; false removes that action entirely. */
  readonly mobileEntryLabel?: false | string;
  /** Reports the command identifier after enabled result activation. */
  readonly onCommand?: (commandId: string) => void;
  /** Reports controlled or uncontrolled modal open-state changes. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Reports controlled or uncontrolled search query changes. */
  readonly onQueryChange?: (query: string) => void;
  /** Controlled modal open state; embedded presentation is always visible. */
  readonly open?: boolean;
  /** Chooses an always-visible embedded surface or focus-managed modal presentation. */
  readonly presentation?: "embedded" | "modal";
  /** Controlled query value; use with `onQueryChange`. */
  readonly query?: string;
  /** Loads recent commands at an empty query; false removes that adapter request path. */
  readonly recentCommands?: boolean;
  /** Adds selected-command execution context; false removes the preview UI. */
  readonly showExecutionPreview?: boolean;
  /** Shows command shortcut hints; false strips them from result accessibility output. */
  readonly showShortcuts?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(?:INPUT|SELECT|TEXTAREA)$/u.test(target.tagName))
  );
}

export function CommandCenter({
  "aria-label": ariaLabel = "Command center",
  adapter,
  announceResultCount = false,
  className,
  defaultOpen = false,
  defaultQuery = "",
  globalShortcut = false,
  minimumQueryLength = 1,
  mobileEntryLabel = false,
  onCommand,
  onOpenChange,
  onQueryChange,
  open,
  presentation = "embedded",
  query,
  recentCommands = false,
  showExecutionPreview = false,
  showShortcuts = false,
  ...props
}: CommandCenterProps) {
  const center = useCommandCenter({
    adapter,
    defaultQuery,
    minimumQueryLength,
    recentCommands,
    ...(onQueryChange === undefined ? {} : { onQueryChange }),
    ...(query === undefined ? {} : { query }),
  });
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const resolvedOpen = presentation === "embedded" ? true : (open ?? uncontrolledOpen);
  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (globalShortcut === false) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.key.toLocaleLowerCase() !== "k" ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [globalShortcut, onOpenChange, open, presentation]);

  const commands: readonly CommandPaletteItem[] = center.commands.map((command) => {
    if (showShortcuts) return command;
    const { shortcut: _shortcut, ...withoutShortcut } = command;
    return withoutShortcut;
  });
  const palette = (
    <CommandPalette
      commands={commands}
      emptyMessage={
        center.query.trim().length < minimumQueryLength
          ? `Enter at least ${minimumQueryLength} character${minimumQueryLength === 1 ? "" : "s"}.`
          : "No matching commands. Try a broader term."
      }
      label="Workspace commands"
      {...(center.state === "error" ? { loadError: center.error } : {})}
      loading={center.state === "loading"}
      onCommand={(command) => {
        void center.execute(command.id);
        onCommand?.(command.id);
        if (presentation === "modal") setOpen(false);
      }}
      onOpenChange={setOpen}
      onQueryChange={center.setQuery}
      onRetry={center.retry}
      open={resolvedOpen}
      placeholder="Search navigation and actions"
      presentation={presentation}
      query={center.query}
      shouldFilter={false}
      showExecutionPreview={showExecutionPreview}
    />
  );

  return (
    <div
      {...props}
      aria-label={ariaLabel}
      className={className === undefined ? "mrg-command-center" : `mrg-command-center ${className}`}
      data-slot="command-center"
      role="region"
    >
      <div data-slot="command-center-heading">
        <div>
          <h1>Command center</h1>
          <p>Search and run consumer-owned workspace actions from one keyboard-friendly surface.</p>
        </div>
        {presentation === "modal" ? (
          <Button onClick={() => setOpen(true)} variant="secondary">
            Open command center
            {globalShortcut === false ? null : <kbd>Ctrl/⌘ K</kbd>}
          </Button>
        ) : null}
      </div>
      {mobileEntryLabel === false ? null : (
        <Button
          className="mrg-command-center__mobile-entry"
          onClick={() => setOpen(true)}
          variant="secondary"
        >
          {mobileEntryLabel}
        </Button>
      )}
      {announceResultCount ? (
        <output aria-live="polite" data-slot="command-center-result-count">
          {center.state === "loading"
            ? "Searching commands."
            : `${commands.length} command${commands.length === 1 ? "" : "s"} available.`}
        </output>
      ) : null}
      {center.state === "error" && !resolvedOpen ? (
        <Alert
          actions={<Button onClick={center.retry}>Retry search</Button>}
          description={center.error}
          title="Command search unavailable"
          variant="error"
        />
      ) : null}
      {palette}
    </div>
  );
}

export const CommandCenterPage = CommandCenter;
