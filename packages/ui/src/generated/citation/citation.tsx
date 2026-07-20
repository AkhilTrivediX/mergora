// Generated from registry/source/components/citation/citation.tsx by @mergora-internal/source-transformer. Do not edit.
import "./citation.css";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface CitationProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Optional source excerpt rendered only when source detail is enabled. */
  readonly excerpt?: ReactNode;
  /** Consumer-supplied destination accepted only when it passes the safe URL policy. */
  readonly href: string;
  /** Positive one-based citation number used by visible and accessible labels. */
  readonly number: number;
  /** Adds source-name and excerpt note content; false removes the detail semantics. */
  readonly showSourceDetail?: boolean;
  /** Optional human-readable source name, falling back to the citation title. */
  readonly sourceName?: ReactNode;
  /** Required citation title included in the link's accessible name. */
  readonly title: string;
}

export function isSafeCitationUrl(value: string): boolean {
  const normalized = value.trim();
  if (
    normalized === "" ||
    [...normalized].some((character) => character === "\\" || character.codePointAt(0)! <= 31)
  ) {
    return false;
  }
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return true;
  try {
    const url = new URL(normalized);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

export const Citation = forwardRef<HTMLSpanElement, CitationProps>(function Citation(
  { className, excerpt, href, number, showSourceDetail = false, sourceName, title, ...props },
  ref,
) {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new RangeError("Mergora Citation number must be a positive safe integer.");
  }
  const safe = isSafeCitationUrl(href);
  const external = safe && /^https?:\/\//iu.test(href.trim());

  return (
    <span
      {...props}
      className={className === undefined ? "mrg-citation" : `mrg-citation ${className}`}
      data-safe-url={safe}
      data-slot="citation"
      ref={ref}
    >
      {safe ? (
        <a
          aria-label={`Citation ${number}: ${title}`}
          href={href}
          rel={external ? "noreferrer noopener" : undefined}
          target={external ? "_blank" : undefined}
        >
          [{number}]
        </a>
      ) : (
        <span aria-label={`Citation ${number} is unavailable`}>[{number}]</span>
      )}
      {showSourceDetail ? (
        <span data-slot="citation-source-detail" role="note">
          <strong>{sourceName ?? title}</strong>
          {excerpt === undefined ? null : <span>{excerpt}</span>}
        </span>
      ) : null}
    </span>
  );
});

Citation.displayName = "Citation";
