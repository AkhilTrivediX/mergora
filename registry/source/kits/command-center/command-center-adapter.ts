export interface CommandCenterItem {
  /** Optional supporting command copy included in search and result presentation. */
  readonly description?: string;
  /** Prevents command activation while preserving result context. */
  readonly disabled?: boolean;
  /** Human-readable group name used to organize search results. */
  readonly group: string;
  /** Stable unique command identifier passed to execution and consumer callbacks. */
  readonly id: string;
  /** Optional hidden search aliases evaluated by the consumer adapter. */
  readonly keywords?: readonly string[];
  /** Required human-readable command name. */
  readonly label: string;
  /** Optional keyboard hint shown only when shortcut presentation is enabled. */
  readonly shortcut?: string;
}

export interface CommandCenterAdapter {
  /** Executes a selected command with lifecycle cancellation. */
  readonly execute: (commandId: string, signal: AbortSignal) => Promise<void> | void;
  /** Optionally loads recent commands for an empty query; omission yields a clean empty state. */
  readonly loadRecent?: (signal: AbortSignal) => Promise<readonly CommandCenterItem[]>;
  /** Searches consumer-owned commands for the normalized query with lifecycle cancellation. */
  readonly search: (query: string, signal: AbortSignal) => Promise<readonly CommandCenterItem[]>;
}

const COMMANDS: readonly CommandCenterItem[] = [
  {
    description: "Open the component inventory and maturity evidence.",
    group: "Navigate",
    id: "open-catalog",
    keywords: ["components", "inventory", "quality"],
    label: "Open component catalog",
    shortcut: "G C",
  },
  {
    description: "Review deterministic generation and parity records.",
    group: "Navigate",
    id: "open-generation-evidence",
    keywords: ["registry", "generation", "parity"],
    label: "Open generation evidence",
    shortcut: "G E",
  },
  {
    description: "Create a local review note without a network request.",
    group: "Actions",
    id: "create-review-note",
    keywords: ["note", "review", "local"],
    label: "Create review note",
    shortcut: "N",
  },
  {
    description: "Refresh the consumer-owned search index.",
    group: "Actions",
    id: "refresh-search-index",
    keywords: ["reload", "index"],
    label: "Refresh search index",
  },
];

export function createDeterministicCommandCenterAdapter(): CommandCenterAdapter {
  return {
    async execute(_commandId, signal) {
      if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    },
    async loadRecent(signal) {
      if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return COMMANDS.slice(0, 2).map((command) => ({ ...command, group: "Recent" }));
    },
    async search(query, signal) {
      if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
      return COMMANDS.filter((command) => {
        const text = [
          command.label,
          command.description,
          command.group,
          ...(command.keywords ?? []),
        ]
          .filter((value): value is string => value !== undefined)
          .join(" ")
          .toLocaleLowerCase();
        return terms.every((term) => text.includes(term));
      });
    },
  };
}
