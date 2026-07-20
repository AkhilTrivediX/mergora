"use client";

import type { CommandPaletteItem } from "mergora-ui/command-palette";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

import { rankSiteSearch, type SiteSearchEntry } from "./site-search-model";
import { staticSiteHref } from "./site-link";

const SITE_SEARCH_OPEN_EVENT = "mergora:site-search-open";
const SEARCH_INDEX_MAX_BYTES = 4 * 1024 * 1024;
const SEARCH_INDEX_MAX_ENTRIES = 4_096;
const SITE_BASE_PATH = process.env.NEXT_PUBLIC_MERGORA_BASE_PATH ?? "";
const CONTENT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const DeferredCommandPalette = lazy(async () => {
  const module = await import("mergora-ui/command-palette");
  return { default: module.CommandPalette };
});

interface ParsedSearchIndex {
  readonly body: Record<string, unknown>;
  readonly digest: string;
  readonly entries: readonly SiteSearchEntry[];
}

interface SiteSearchOpenDetail {
  readonly portalTarget: HTMLElement | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function safeRoute(value: unknown): value is string {
  return (
    boundedString(value, 512) &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.split(/[/?#]/u).includes("..")
  );
}

function editableShortcutTarget(event: KeyboardEvent): boolean {
  return event
    .composedPath()
    .some(
      (target) =>
        target instanceof HTMLElement &&
        target.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])'),
    );
}

function modalSearchPortalTarget(origin: EventTarget | null): HTMLElement | null {
  if (!(origin instanceof HTMLElement)) return null;
  return origin.closest<HTMLElement>("[data-modal='true'][data-slot$='-content']");
}

function searchEntry(value: unknown): value is SiteSearchEntry {
  if (!record(value)) return false;
  return (
    boundedString(value.availability, 128) &&
    boundedString(value.group, 128) &&
    boundedString(value.id, 256) &&
    safeRoute(value.route) &&
    boundedString(value.summary, 2_048) &&
    boundedString(value.title, 512) &&
    Array.isArray(value.terms) &&
    value.terms.length <= 128 &&
    value.terms.every((term) => boundedString(term, 256)) &&
    (value.visibleStatus === undefined || boundedString(value.visibleStatus, 128))
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (record(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function contentDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseSearchIndex(text: string): ParsedSearchIndex {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Search index is not valid JSON.");
  }
  if (
    !record(value) ||
    value.artifactKind !== "static-search-index" ||
    value.schemaVersion !== 1 ||
    typeof value.digest !== "string" ||
    !CONTENT_DIGEST_PATTERN.test(value.digest) ||
    !Array.isArray(value.entries) ||
    value.entries.length > SEARCH_INDEX_MAX_ENTRIES ||
    !value.entries.every(searchEntry)
  ) {
    throw new Error("Search index has an unsupported shape.");
  }
  const { digest, ...body } = value;
  const entries = value.entries as SiteSearchEntry[];
  const identities = new Set<string>();
  for (const entry of entries) {
    const identity = `${entry.group}\u0000${entry.id}\u0000${entry.route}`;
    if (identities.has(identity)) throw new Error("Search index contains a duplicate entry.");
    identities.add(identity);
  }
  return { body, digest, entries };
}

function groupLabel(group: string): string {
  return group
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toLocaleUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function SiteSearchTrigger({
  type: _type,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) {
          // Safari does not consistently focus buttons activated by a pointer. Establishing the
          // trigger as the active element gives the modal one deterministic restoration target.
          event.currentTarget.focus();
          window.dispatchEvent(
            new CustomEvent<SiteSearchOpenDetail>(SITE_SEARCH_OPEN_EVENT, {
              detail: { portalTarget: modalSearchPortalTarget(event.currentTarget) },
            }),
          );
        }
      }}
      type="button"
    />
  );
}

export function SiteSearch({ indexDigest }: { readonly indexDigest: string }) {
  if (!CONTENT_DIGEST_PATTERN.test(indexDigest)) {
    throw new TypeError("Mergora site search requires a valid build-time index digest.");
  }
  const [activated, setActivated] = useState(false);
  const [entries, setEntries] = useState<readonly SiteSearchEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const entriesRef = useRef<readonly SiteSearchEntry[] | null>(null);
  const requestRef = useRef<Promise<void> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ensureIndex = useCallback(
    (retry = false): Promise<void> => {
      if (!retry && entriesRef.current !== null) return Promise.resolve();
      if (!retry && requestRef.current !== null) return requestRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setLoadError(undefined);
      const request = (async () => {
        try {
          const response = await fetch(
            `${SITE_BASE_PATH}/search-index.json?v=${encodeURIComponent(indexDigest)}`,
            {
              cache: "force-cache",
              credentials: "same-origin",
              signal: controller.signal,
            },
          );
          if (!response.ok) throw new Error("Search index request failed.");
          const declaredLength = Number(response.headers.get("content-length") ?? "0");
          if (Number.isFinite(declaredLength) && declaredLength > SEARCH_INDEX_MAX_BYTES) {
            throw new Error("Search index exceeds its size limit.");
          }
          const text = await response.text();
          if (
            text.length === 0 ||
            new TextEncoder().encode(text).byteLength > SEARCH_INDEX_MAX_BYTES
          ) {
            throw new Error("Search index exceeds its size limit.");
          }
          const parsed = parseSearchIndex(text);
          if (
            parsed.digest !== indexDigest ||
            (await contentDigest(parsed.body)) !== parsed.digest
          ) {
            throw new Error("Search index integrity check failed.");
          }
          entriesRef.current = parsed.entries;
          setEntries(parsed.entries);
        } catch (error) {
          if (controller.signal.aborted) return;
          setLoadError(
            error instanceof Error && error.message.includes("size limit")
              ? "The search index is larger than this client accepts."
              : error instanceof Error && error.message.includes("integrity")
                ? "The search index failed its integrity check. Retry after refreshing the page."
                : "Search could not be loaded. Check the connection and retry.",
          );
        } finally {
          if (abortRef.current === controller) {
            if (!controller.signal.aborted) setLoading(false);
            requestRef.current = null;
          }
        }
      })();
      requestRef.current = request;
      return request;
    },
    [indexDigest],
  );

  const requestOpen = useCallback(
    (nextPortalTarget: HTMLElement | null) => {
      setActivated(true);
      setPortalTarget(nextPortalTarget);
      setOpen(true);
      void ensureIndex();
    },
    [ensureIndex],
  );

  useEffect(() => {
    const openFromEvent = (event: Event) => {
      const requestedTarget = (event as CustomEvent<Partial<SiteSearchOpenDetail>>).detail
        ?.portalTarget;
      requestOpen(
        requestedTarget instanceof HTMLElement &&
          requestedTarget.isConnected &&
          requestedTarget.matches("[data-modal='true'][data-slot$='-content']")
          ? requestedTarget
          : null,
      );
    };
    const openFromKeyboard = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        event.shiftKey ||
        editableShortcutTarget(event) ||
        (!event.metaKey && !event.ctrlKey) ||
        event.key.toLocaleLowerCase() !== "k"
      ) {
        return;
      }
      event.preventDefault();
      requestOpen(modalSearchPortalTarget(document.activeElement));
    };
    window.addEventListener(SITE_SEARCH_OPEN_EVENT, openFromEvent);
    window.addEventListener("keydown", openFromKeyboard);
    return () => {
      abortRef.current?.abort();
      window.removeEventListener(SITE_SEARCH_OPEN_EVENT, openFromEvent);
      window.removeEventListener("keydown", openFromKeyboard);
    };
  }, [requestOpen]);

  const ranked = useMemo(
    () => (entries === null ? [] : rankSiteSearch(entries, query, 12)),
    [entries, query],
  );
  const commandModel = useMemo(() => {
    const routes = new Map<string, string>();
    const results = ranked.map(({ entry }, index) => {
      const id = `site-result-${String(index)}`;
      routes.set(id, entry.route);
      return {
        id,
        label: entry.title,
        description:
          `${groupLabel(entry.group)} · ${entry.visibleStatus ?? entry.availability} · ` +
          `${entry.route} · ${entry.summary}`,
        group: groupLabel(entry.group),
        keywords: entry.terms,
      } satisfies CommandPaletteItem;
    });
    if (query.trim() === "" || entries === null || results.length > 0) {
      return { commands: results, routes };
    }
    const recovery = [
      {
        id: "site-recovery-components",
        label: "Browse the full component catalog",
        description: "Open the filterable component directory without a search query.",
        group: "Recovery",
        route: "/components",
      },
      {
        id: "site-recovery-docs",
        label: "Open documentation",
        description: "Browse installation, migration, accessibility, and API guidance.",
        group: "Recovery",
        route: "/docs",
      },
    ] satisfies readonly (CommandPaletteItem & { readonly route: string })[];
    for (const command of recovery) routes.set(command.id, command.route);
    return {
      commands: recovery.map(({ route: _route, ...command }) => command),
      routes,
    };
  }, [entries, query, ranked]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!open || query.trim() === "") setAnnouncement("");
      else if (loading) setAnnouncement("Loading search results.");
      else if (loadError !== undefined) {
        setAnnouncement("Search is unavailable. Retry is available.");
      } else if (ranked.length === 0) {
        setAnnouncement("No matching result. Recovery options are available.");
      } else {
        setAnnouncement(
          `${String(ranked.length)} ${ranked.length === 1 ? "result" : "results"} available.`,
        );
      }
    }, 160);
    return () => window.clearTimeout(timer);
  }, [loadError, loading, open, query, ranked.length]);

  const searchSurface = (
    <>
      {activated ? (
        <Suspense
          fallback={
            <p aria-busy="true" className="site-search-loading" role="status">
              Loading local search…
            </p>
          }
        >
          <DeferredCommandPalette
            commands={commandModel.commands}
            description="Find a component, API, guide, or tool without sending your query off site."
            emptyMessage="No matching page or component."
            label="Search Mergora"
            {...(loadError === undefined ? {} : { loadError })}
            loading={loading}
            navigationAdapter={false}
            onCommand={(command: CommandPaletteItem) => {
              const route = commandModel.routes.get(command.id);
              if (route !== undefined) window.location.assign(staticSiteHref(route));
            }}
            onOpenChange={(next: boolean) => {
              setOpen(next);
              if (next) void ensureIndex();
              else setQuery("");
            }}
            onQueryChange={setQuery}
            onRetry={() => void ensureIndex(true)}
            open={open}
            placeholder="Search components, APIs, docs, and tools"
            query={query}
            shouldFilter={false}
            showExecutionPreview
          />
        </Suspense>
      ) : null}
      <span aria-atomic="true" aria-live="polite" className="site-visually-hidden">
        {announcement}
      </span>
    </>
  );

  return portalTarget?.isConnected === true
    ? createPortal(
        <div
          data-site-search-layer="nested-modal"
          onKeyDown={(event) => {
            // The command palette consumes Escape first. Keep that same keystroke from also
            // dismissing the invoking Sheet after the inner surface has begun closing.
            if (event.key === "Escape") event.stopPropagation();
          }}
        >
          {searchSurface}
        </div>,
        portalTarget,
      )
    : searchSurface;
}
