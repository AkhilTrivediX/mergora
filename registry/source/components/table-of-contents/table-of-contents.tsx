"use client";

import {
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";

import "./table-of-contents.css";

export interface TableOfContentsItem {
  /** Replaces the anchor with a non-interactive aria-disabled location row. */
  readonly disabled?: boolean;
  /** Optional safe destination; omission creates an encoded same-document hash from id. */
  readonly href?: string;
  /** Non-empty unique identity matching the observed document section when observation is used. */
  readonly id: string;
  /** Visible section title rendered in the ordered navigation list. */
  readonly label: ReactNode;
  /** Heading depth from one through six, normalized into logical indentation. */
  readonly level: number;
}

export interface TableOfContentsObserverOptions {
  /** Optional IntersectionObserver root; null observes relative to the viewport. */
  readonly root?: Element | null;
  /** Observer margin, defaulting to a viewport band that favors the upper section. */
  readonly rootMargin?: string;
  /** Intersection ratio or ratios, with a five-point default when omitted. */
  readonly threshold?: number | readonly number[];
}

export interface TableOfContentsSummaryContext {
  /** Zero-based position of the currently identified section. */
  readonly currentIndex: number;
  /** Complete current-section record supplied to the optional summary formatter. */
  readonly currentItem: TableOfContentsItem;
  /** Total number of validated document sections in the navigation model. */
  readonly total: number;
}

function hasAccessibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAccessibleContent);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) {
    if (value.type === Fragment) return hasAccessibleContent(value.props.children);
    return true;
  }
  return true;
}

export function isSafeTableOfContentsHref(href: string): boolean {
  const normalized = href.trim();
  const protocolProbe = normalized.replace(/[\p{Cc}\s]/gu, "").toLowerCase();
  return normalized.length > 0 && !/^(?:data|javascript|vbscript):/u.test(protocolProbe);
}

export function collectTableOfContentsItems(
  root: ParentNode,
  selector = "h2[id], h3[id]",
): readonly TableOfContentsItem[] {
  return [...root.querySelectorAll<HTMLElement>(selector)].flatMap((heading) => {
    const id = heading.id.trim();
    const label = heading.textContent?.trim() ?? "";
    const match = /^H([1-6])$/u.exec(heading.tagName);
    if (id.length === 0 || label.length === 0 || match?.[1] === undefined) return [];
    return [{ id, label, level: Number(match[1]) }];
  });
}

export interface TableOfContentsProps extends Omit<
  React.ComponentPropsWithoutRef<"nav">,
  "children" | "onChange"
> {
  /** Controlled current-section identity exposed through aria-current="location". */
  readonly currentId?: string;
  /** Initial section identity for uncontrolled use, defaulting to the first item. */
  readonly defaultCurrentId?: string;
  /** Non-empty ordered section model with unique ids and valid heading levels. */
  readonly items: readonly TableOfContentsItem[];
  /** Visible heading and accessible name for the native navigation landmark. */
  readonly label?: string;
  /** Enables consumer-configured section observation, or false to create no observer. */
  readonly observeCurrent?: false | TableOfContentsObserverOptions;
  /** Reports current-section changes with their link or observer source. */
  readonly onCurrentIdChange?: (id: string, source: "link" | "observer") => void;
  /** Receives enabled anchor activation before current state changes; preventDefault cancels it. */
  readonly onNavigate?: (event: MouseEvent<HTMLAnchorElement>, item: TableOfContentsItem) => void;
  /** Optional current-section context; omission emits no output and calls no formatter. */
  readonly renderCurrentSummary?: (context: TableOfContentsSummaryContext) => ReactNode;
}

export const TableOfContents = forwardRef<HTMLElement, TableOfContentsProps>(
  function TableOfContents(
    {
      className,
      currentId,
      defaultCurrentId,
      items,
      label = "On this page",
      observeCurrent = false,
      onCurrentIdChange,
      onNavigate,
      renderCurrentSummary,
      ...props
    },
    ref,
  ) {
    if (items.length === 0) throw new Error("Mergora TableOfContents requires at least one item.");
    const ids = new Set<string>();
    for (const item of items) {
      if (item.id.trim().length === 0 || ids.has(item.id)) {
        throw new Error("Mergora TableOfContents item ids must be non-empty and unique.");
      }
      if (!Number.isSafeInteger(item.level) || item.level < 1 || item.level > 6) {
        throw new Error("Mergora TableOfContents item levels must be integers from one to six.");
      }
      ids.add(item.id);
      const href = item.href ?? `#${encodeURIComponent(item.id)}`;
      if (!isSafeTableOfContentsHref(href)) {
        throw new Error("Mergora TableOfContents item href uses a prohibited protocol.");
      }
    }
    const [uncontrolledCurrentId, setUncontrolledCurrentId] = useState(
      defaultCurrentId ?? items[0]?.id,
    );
    const resolvedCurrentId = currentId ?? uncontrolledCurrentId;
    const currentIndex = items.findIndex((item) => item.id === resolvedCurrentId);
    if (currentIndex < 0)
      throw new Error("Mergora TableOfContents currentId must identify an item.");
    const currentItem = items[currentIndex];
    if (currentItem === undefined) {
      throw new Error("Mergora TableOfContents current item is unavailable.");
    }
    const setCurrent = (id: string, source: "link" | "observer") => {
      if (currentId === undefined) setUncontrolledCurrentId(id);
      onCurrentIdChange?.(id, source);
    };

    useEffect(() => {
      if (observeCurrent === false || !globalThis.IntersectionObserver) {
        return;
      }
      const targets = items.flatMap((item) => {
        const target = document.getElementById(item.id);
        return target === null ? [] : [target];
      });
      if (targets.length === 0) return;
      const visibleTargets = new Map<Element, number>();
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) visibleTargets.set(entry.target, entry.intersectionRatio);
            else visibleTargets.delete(entry.target);
          }
          const active = [...visibleTargets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
          if (active instanceof HTMLElement && active.id.length > 0) {
            setCurrent(active.id, "observer");
          }
        },
        {
          root: observeCurrent.root ?? null,
          rootMargin: observeCurrent.rootMargin ?? "0px 0px -60%",
          threshold:
            observeCurrent.threshold === undefined
              ? [0, 0.25, 0.5, 0.75, 1]
              : [
                  ...(Array.isArray(observeCurrent.threshold)
                    ? observeCurrent.threshold
                    : [observeCurrent.threshold]),
                ],
        },
      );
      for (const target of targets) observer.observe(target);
      return () => observer.disconnect();
    }, [currentId, items, observeCurrent, onCurrentIdChange]);

    const summary = renderCurrentSummary?.({ currentIndex, currentItem, total: items.length });
    const minimumLevel = Math.min(...items.map((item) => item.level));
    return (
      <nav
        {...props}
        aria-label={label}
        className={["mrg-table-of-contents", className].filter(Boolean).join(" ")}
        data-enhanced-observer={observeCurrent === false ? undefined : ""}
        data-slot="table-of-contents"
        ref={ref}
      >
        <strong data-slot="table-of-contents-label">{label}</strong>
        {hasAccessibleContent(summary) ? (
          <output className="mrg-table-of-contents__summary" data-slot="table-of-contents-summary">
            {summary}
          </output>
        ) : null}
        <ol>
          {items.map((item) => {
            const href = item.href ?? `#${encodeURIComponent(item.id)}`;
            const style = {
              "--_mrg-toc-depth": item.level - minimumLevel,
            } as CSSProperties;
            return (
              <li data-level={item.level} key={item.id} style={style}>
                {item.disabled ? (
                  <span
                    aria-current={item.id === resolvedCurrentId ? "location" : undefined}
                    aria-disabled="true"
                    className="mrg-table-of-contents__link"
                    data-disabled=""
                  >
                    {item.label}
                  </span>
                ) : (
                  <a
                    aria-current={item.id === resolvedCurrentId ? "location" : undefined}
                    className="mrg-table-of-contents__link"
                    href={href}
                    onClick={(event) => {
                      onNavigate?.(event, item);
                      if (!event.defaultPrevented) setCurrent(item.id, "link");
                    }}
                  >
                    {item.label}
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  },
);

TableOfContents.displayName = "TableOfContents";
