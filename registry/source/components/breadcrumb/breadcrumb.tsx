"use client";

import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";

import { useMergoraContext, useMergoraMessage } from "../provider/index.js";
import "./breadcrumb.css";

export interface BreadcrumbItem {
  readonly current?: boolean;
  readonly href?: string;
  readonly id: string;
  readonly label: ReactNode;
}

export interface BreadcrumbProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  readonly items: readonly BreadcrumbItem[];
  readonly label?: string;
  readonly maxVisible?: number;
  readonly onNavigate?: (id: string, event: MouseEvent<HTMLAnchorElement>) => void;
}

export function isSafeBreadcrumbHref(href: string): boolean {
  const normalized = href.trim().toLowerCase();
  return normalized.length > 0 && !/^(?:data|javascript|vbscript):/u.test(normalized);
}

function validateBreadcrumbItems(items: readonly BreadcrumbItem[]): void {
  if (items.length === 0) throw new Error("Mergora Breadcrumb requires at least one item.");
  const ids = new Set<string>();
  const explicitCurrent = items.filter((item) => item.current === true);
  if (explicitCurrent.length > 1) {
    throw new Error("Mergora Breadcrumb accepts at most one current item.");
  }
  if (explicitCurrent.length === 1 && items.at(-1) !== explicitCurrent[0]) {
    throw new Error("Mergora Breadcrumb current item must be the final hierarchy item.");
  }
  items.forEach((item, index) => {
    if (item.id.trim().length === 0) {
      throw new Error("Mergora Breadcrumb item ids must be non-empty strings.");
    }
    if (ids.has(item.id)) throw new Error("Mergora Breadcrumb item ids must be unique.");
    ids.add(item.id);
    if (
      item.label === null ||
      item.label === undefined ||
      item.label === false ||
      (typeof item.label === "string" && item.label.trim().length === 0)
    ) {
      throw new Error("Mergora Breadcrumb item labels must expose non-empty content.");
    }
    const current =
      item.current === true || (explicitCurrent.length === 0 && index === items.length - 1);
    if (!current) {
      if (item.href === undefined || item.href.trim().length === 0) {
        throw new Error("Mergora Breadcrumb ancestor items require an href.");
      }
      if (!isSafeBreadcrumbHref(item.href)) {
        throw new Error("Mergora Breadcrumb item href uses a prohibited navigation protocol.");
      }
    }
  });
}

export const Breadcrumb = forwardRef<HTMLElement, BreadcrumbProps>(function Breadcrumb(
  { className, items, label: labelProp, maxVisible = 3, onNavigate, ...nativeProps },
  ref,
) {
  validateBreadcrumbItems(items);
  if (!Number.isFinite(maxVisible) || !Number.isInteger(maxVisible) || maxVisible < 2) {
    throw new RangeError("Mergora Breadcrumb maxVisible must be a finite integer of at least 2.");
  }
  const { getMessage } = useMergoraContext();
  const defaultLabel = useMergoraMessage("breadcrumb.label", "Breadcrumb");
  if (labelProp !== undefined && labelProp.trim().length === 0) {
    throw new Error("Mergora Breadcrumb label must be non-empty when provided.");
  }
  const label = labelProp ?? defaultLabel;
  const currentIndex = items.length - 1;
  const shouldCollapse = items.length > maxVisible;
  const tailCount = Math.max(1, maxVisible - 1);
  const hiddenItems = shouldCollapse ? items.slice(1, -tailCount) : [];
  const visibleTail = shouldCollapse ? items.slice(-tailCount) : [];
  const hiddenLabel = getMessage(
    "breadcrumb.showHidden",
    ({ locale: messageLocale, values }) => {
      const count = Number(values.count ?? 0);
      const formatted = new Intl.NumberFormat(messageLocale).format(count);
      return new Intl.PluralRules(messageLocale).select(count) === "one"
        ? `Show ${formatted} hidden breadcrumb`
        : `Show ${formatted} hidden breadcrumbs`;
    },
    { count: hiddenItems.length },
  );

  const renderItem = (
    item: BreadcrumbItem,
    index: number,
    keyPrefix: string,
    includeSeparator = index > 0,
  ) => {
    const current = index === currentIndex;
    return (
      <li
        data-current={current || undefined}
        data-slot="breadcrumb-item"
        key={`${keyPrefix}-${item.id}`}
      >
        {includeSeparator ? (
          <span aria-hidden="true" data-slot="breadcrumb-separator">
            /
          </span>
        ) : null}
        {current ? (
          <span aria-current="page" data-slot="breadcrumb-current">
            <bdi>{item.label}</bdi>
          </span>
        ) : (
          <a
            data-slot="breadcrumb-link"
            href={item.href}
            onClick={(event) => onNavigate?.(item.id, event)}
          >
            <bdi>{item.label}</bdi>
          </a>
        )}
      </li>
    );
  };

  return (
    <nav
      {...nativeProps}
      aria-label={label}
      className={className === undefined ? "mrg-breadcrumb" : `mrg-breadcrumb ${className}`}
      data-collapsible={shouldCollapse || undefined}
      data-slot="breadcrumb"
      ref={ref}
    >
      <ol data-slot="breadcrumb-list" data-view="full">
        {items.map((item, index) => renderItem(item, index, "full"))}
      </ol>
      {shouldCollapse ? (
        <ol data-slot="breadcrumb-list" data-view="compact">
          {renderItem(items[0]!, 0, "compact")}
          <li data-slot="breadcrumb-overflow">
            <span aria-hidden="true" data-slot="breadcrumb-separator">
              /
            </span>
            <details>
              <summary aria-label={hiddenLabel} data-slot="breadcrumb-overflow-trigger">
                <span aria-hidden="true">…</span>
              </summary>
              <ol aria-label={hiddenLabel} data-slot="breadcrumb-overflow-list">
                {hiddenItems.map((item, offset) =>
                  renderItem(item, offset + 1, "overflow", offset > 0),
                )}
              </ol>
            </details>
          </li>
          {visibleTail.map((item, offset) =>
            renderItem(item, items.length - tailCount + offset, "compact"),
          )}
        </ol>
      ) : null}
    </nav>
  );
});

Breadcrumb.displayName = "Breadcrumb";
