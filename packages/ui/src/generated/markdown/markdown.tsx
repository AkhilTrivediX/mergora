// Generated from registry/source/components/markdown/markdown.tsx by @mergora-internal/source-transformer. Do not edit.
import "./markdown.css";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface MarkdownRenderContext {
  /** Exact consumer-supplied Markdown source passed to the rendering adapter. */
  readonly source: string;
  /** Whether the source is currently receiving incremental updates. */
  readonly streaming: boolean;
}

export interface MarkdownProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Untrusted Markdown source rendered literally unless a consumer adapter is supplied. */
  readonly source: string;
  /** Consumer-owned rendering and sanitization adapter; omission preserves safe literal text. */
  readonly render?: (context: MarkdownRenderContext) => ReactNode;
  /** Marks content busy during incremental updates without forcing announcements. */
  readonly streaming?: boolean;
  /** Adds polite streaming announcements; false removes the live region and update output. */
  readonly announceStreamingUpdates?: boolean;
  /** Adds explicit renderer ownership context; false removes that boundary copy. */
  readonly showRendererBoundary?: boolean;
  /** Localized renderer-boundary copy shown only when the boundary is enabled. */
  readonly rendererBoundaryLabel?: string;
  /** Builds the enabled streaming announcement from the current character count. */
  readonly streamingLabel?: (characterCount: number) => string;
  /** Domain-neutral content rendered when the source is empty. */
  readonly emptyFallback?: ReactNode;
}

function classes(...values: readonly (false | string | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export const Markdown = forwardRef<HTMLElement, MarkdownProps>(function Markdown(
  {
    source,
    render,
    streaming = false,
    announceStreamingUpdates = false,
    showRendererBoundary = false,
    rendererBoundaryLabel = "Content rendered by the consumer-provided Markdown adapter",
    streamingLabel = (characterCount) => `Markdown update, ${characterCount} characters received`,
    emptyFallback = "No content",
    className,
    ...props
  },
  ref,
) {
  const content =
    source.length === 0
      ? emptyFallback
      : render === undefined
        ? source
        : render({ source, streaming });
  return (
    <article
      {...props}
      ref={ref}
      aria-busy={streaming || undefined}
      className={classes("mrg-markdown", className)}
      data-renderer={render === undefined ? "literal-text" : "consumer-adapter"}
      data-slot="markdown"
      data-streaming={streaming || undefined}
    >
      {showRendererBoundary ? (
        <p className="mrg-markdown__boundary" data-slot="markdown-renderer-boundary">
          {rendererBoundaryLabel}
        </p>
      ) : null}
      <div className="mrg-markdown__content" data-slot="markdown-content">
        {render === undefined && source.length > 0 ? <pre>{content}</pre> : content}
      </div>
      {announceStreamingUpdates ? (
        <output
          aria-live="polite"
          className="mrg-markdown__announcement"
          data-slot="markdown-announcement"
        >
          {streaming ? streamingLabel(source.length) : ""}
        </output>
      ) : null}
    </article>
  );
});
