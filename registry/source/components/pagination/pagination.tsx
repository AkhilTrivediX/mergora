"use client";

import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";

import { useMergoraContext, useMergoraMessage } from "../provider/index.js";
import "./pagination.css";

export type PaginationRangeItem = number | "start-ellipsis" | "end-ellipsis";

interface PaginationCommonProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  readonly label?: string;
  readonly nextLabel?: string;
  readonly previousLabel?: string;
}

export interface PaginationPageProps extends PaginationCommonProps {
  readonly boundaryCount?: number;
  readonly getHref: (page: number) => string;
  readonly mode?: "pages";
  readonly onNavigate?: (page: number, event: MouseEvent<HTMLAnchorElement>) => void;
  readonly page: number;
  readonly pageCount: number;
  readonly siblingCount?: number;
}

export interface PaginationCursorProps extends PaginationCommonProps {
  readonly currentLabel: ReactNode;
  readonly mode: "cursor";
  readonly nextHref?: string;
  readonly onNavigate?: (
    direction: "previous" | "next",
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
  readonly previousHref?: string;
}

export type PaginationProps = PaginationPageProps | PaginationCursorProps;

function assertNonnegativeInteger(value: number, name: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new RangeError(`Mergora Pagination ${name} must be a non-negative finite integer.`);
  }
}

export function isSafePaginationHref(href: string): boolean {
  const normalized = href.trim().toLowerCase();
  return normalized.length > 0 && !/^(?:data|javascript|vbscript):/u.test(normalized);
}

export function buildPaginationRange(input: {
  readonly boundaryCount?: number;
  readonly page: number;
  readonly pageCount: number;
  readonly siblingCount?: number;
}): readonly PaginationRangeItem[] {
  const { page, pageCount } = input;
  const boundaryCount = input.boundaryCount ?? 1;
  const siblingCount = input.siblingCount ?? 1;
  if (!Number.isFinite(boundaryCount) || !Number.isInteger(boundaryCount) || boundaryCount < 1) {
    throw new RangeError("Mergora Pagination boundaryCount must be a positive finite integer.");
  }
  assertNonnegativeInteger(siblingCount, "siblingCount");
  if (!Number.isFinite(pageCount) || !Number.isInteger(pageCount) || pageCount < 1) {
    throw new RangeError("Mergora Pagination pageCount must be a positive finite integer.");
  }
  if (!Number.isFinite(page) || !Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new RangeError("Mergora Pagination page must be an integer within pageCount.");
  }
  const visibleSlots = boundaryCount * 2 + siblingCount * 2 + 3;
  if (pageCount <= visibleSlots) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const startPages = Array.from({ length: boundaryCount }, (_, index) => index + 1);
  const endStart = pageCount - boundaryCount + 1;
  const endPages = Array.from({ length: boundaryCount }, (_, index) => endStart + index);
  const siblingStart = Math.max(
    Math.min(page - siblingCount, pageCount - boundaryCount - siblingCount * 2 - 1),
    boundaryCount + 2,
  );
  const siblingEnd = Math.min(
    Math.max(page + siblingCount, boundaryCount + siblingCount * 2 + 2),
    endStart - 2,
  );
  const middle = Array.from(
    { length: Math.max(0, siblingEnd - siblingStart + 1) },
    (_, index) => siblingStart + index,
  );
  return [
    ...startPages,
    ...(siblingStart > boundaryCount + 2
      ? (["start-ellipsis"] as const)
      : siblingStart === boundaryCount + 2
        ? [boundaryCount + 1]
        : []),
    ...middle,
    ...(siblingEnd < endStart - 2
      ? (["end-ellipsis"] as const)
      : siblingEnd === endStart - 2
        ? [endStart - 1]
        : []),
    ...endPages,
  ];
}

export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination(props, ref) {
  const {
    className,
    label: labelProp,
    nextLabel: nextLabelProp,
    previousLabel: previousLabelProp,
  } = props;
  const { getMessage, locale } = useMergoraContext();
  const defaultLabel = useMergoraMessage("pagination.label", "Pagination");
  const defaultPrevious = useMergoraMessage("pagination.previous", "Previous");
  const defaultNext = useMergoraMessage("pagination.next", "Next");
  const ellipsisLabel = useMergoraMessage("pagination.ellipsis", "More pages");
  for (const [name, value] of [
    ["label", labelProp],
    ["previousLabel", previousLabelProp],
    ["nextLabel", nextLabelProp],
  ] as const) {
    if (value !== undefined && value.trim().length === 0) {
      throw new Error(`Mergora Pagination ${name} must be non-empty when provided.`);
    }
  }
  const label = labelProp ?? defaultLabel;
  const previousLabel = previousLabelProp ?? defaultPrevious;
  const nextLabel = nextLabelProp ?? defaultNext;

  if (props.mode === "cursor") {
    if (props.previousHref !== undefined && !isSafePaginationHref(props.previousHref)) {
      throw new Error("Mergora Pagination previousHref uses a prohibited navigation protocol.");
    }
    if (props.nextHref !== undefined && !isSafePaginationHref(props.nextHref)) {
      throw new Error("Mergora Pagination nextHref uses a prohibited navigation protocol.");
    }
    const {
      className: _className,
      currentLabel,
      label: _label,
      mode: _mode,
      nextHref,
      nextLabel: _nextLabel,
      onNavigate,
      previousHref,
      previousLabel: _previousLabel,
      ...cursorNative
    } = props;
    void [_className, _label, _mode, _nextLabel, _previousLabel];
    if (
      currentLabel === null ||
      currentLabel === undefined ||
      currentLabel === false ||
      (typeof currentLabel === "string" && currentLabel.trim().length === 0)
    ) {
      throw new Error("Mergora Pagination cursor currentLabel must expose non-empty content.");
    }
    return (
      <nav
        {...cursorNative}
        aria-label={label}
        className={className === undefined ? "mrg-pagination" : `mrg-pagination ${className}`}
        data-mode="cursor"
        data-slot="pagination"
        ref={ref}
      >
        <ul data-slot="pagination-list">
          <li>
            {previousHref === undefined ? (
              <span aria-disabled="true" data-slot="pagination-disabled">
                {previousLabel}
              </span>
            ) : (
              <a
                data-direction="previous"
                data-slot="pagination-link"
                href={previousHref}
                onClick={(event) => onNavigate?.("previous", event)}
              >
                {previousLabel}
              </a>
            )}
          </li>
          <li>
            <span aria-current="page" data-slot="pagination-current">
              <bdi>{currentLabel}</bdi>
            </span>
          </li>
          <li>
            {nextHref === undefined ? (
              <span aria-disabled="true" data-slot="pagination-disabled">
                {nextLabel}
              </span>
            ) : (
              <a
                data-direction="next"
                data-slot="pagination-link"
                href={nextHref}
                onClick={(event) => onNavigate?.("next", event)}
              >
                {nextLabel}
              </a>
            )}
          </li>
        </ul>
      </nav>
    );
  }

  const {
    boundaryCount = 1,
    className: _className,
    getHref,
    label: _label,
    mode: _mode,
    nextLabel: _nextLabel,
    onNavigate,
    page,
    pageCount,
    previousLabel: _previousLabel,
    siblingCount = 1,
    ...pageNative
  } = props;
  void [_className, _label, _mode, _nextLabel, _previousLabel];
  const range = buildPaginationRange({ boundaryCount, page, pageCount, siblingCount });
  const hrefFor = (target: number): string => {
    const href = getHref(target);
    if (typeof href !== "string" || !isSafePaginationHref(href)) {
      throw new Error("Mergora Pagination getHref returned a prohibited navigation protocol.");
    }
    return href;
  };
  const formattedPage = (target: number) => new Intl.NumberFormat(locale).format(target);
  const pageName = (target: number, current: boolean) =>
    getMessage(
      current ? "pagination.currentPage" : "pagination.page",
      current ? "Page {page}, current page" : "Go to page {page}",
      { page: formattedPage(target) },
    );

  return (
    <nav
      {...pageNative}
      aria-label={label}
      className={className === undefined ? "mrg-pagination" : `mrg-pagination ${className}`}
      data-mode="pages"
      data-slot="pagination"
      ref={ref}
    >
      <ul data-slot="pagination-list">
        <li>
          {page === 1 ? (
            <span aria-disabled="true" data-slot="pagination-disabled">
              {previousLabel}
            </span>
          ) : (
            <a
              aria-label={previousLabel}
              data-direction="previous"
              data-slot="pagination-link"
              href={hrefFor(page - 1)}
              onClick={(event) => onNavigate?.(page - 1, event)}
              rel="prev"
            >
              {previousLabel}
            </a>
          )}
        </li>
        {range.map((item) =>
          typeof item === "number" ? (
            <li key={item}>
              {item === page ? (
                <span
                  aria-current="page"
                  aria-label={pageName(item, true)}
                  data-slot="pagination-current"
                >
                  <bdi>{formattedPage(item)}</bdi>
                </span>
              ) : (
                <a
                  aria-label={pageName(item, false)}
                  data-slot="pagination-link"
                  href={hrefFor(item)}
                  onClick={(event) => onNavigate?.(item, event)}
                >
                  <bdi>{formattedPage(item)}</bdi>
                </a>
              )}
            </li>
          ) : (
            <li key={item}>
              <span data-slot="pagination-ellipsis">
                <span aria-hidden="true">…</span>
                <span className="mrg-pagination__sr-only">{ellipsisLabel}</span>
              </span>
            </li>
          ),
        )}
        <li>
          {page === pageCount ? (
            <span aria-disabled="true" data-slot="pagination-disabled">
              {nextLabel}
            </span>
          ) : (
            <a
              aria-label={nextLabel}
              data-direction="next"
              data-slot="pagination-link"
              href={hrefFor(page + 1)}
              onClick={(event) => onNavigate?.(page + 1, event)}
              rel="next"
            >
              {nextLabel}
            </a>
          )}
        </li>
      </ul>
    </nav>
  );
});

Pagination.displayName = "Pagination";
