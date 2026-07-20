import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import "./blockquote.css";

export interface BlockquoteProps extends HTMLAttributes<HTMLElement> {
  /** Optional author or speaker rendered in the quote caption. */
  readonly attribution?: ReactNode;
  /** Quoted content rendered by the native blockquote element. */
  readonly children: ReactNode;
  /** Source URL applied to blockquote cite and to the optional source-title link. */
  readonly citeUrl?: string;
  /** Optional work or source name rendered with native cite semantics. */
  readonly sourceTitle?: ReactNode;
}

export const Blockquote = forwardRef<HTMLElement, BlockquoteProps>(function Blockquote(
  { attribution, children, citeUrl, className, sourceTitle, ...nativeProps },
  forwardedRef,
) {
  const hasCaption = attribution !== undefined || sourceTitle !== undefined;
  return (
    <figure
      {...nativeProps}
      ref={forwardedRef}
      className={
        className === undefined || className.trim().length === 0
          ? "mrg-blockquote"
          : `mrg-blockquote ${className}`
      }
      data-slot="blockquote"
    >
      <blockquote cite={citeUrl} data-slot="blockquote-quote">
        {children}
      </blockquote>
      {hasCaption ? (
        <figcaption data-slot="blockquote-caption">
          {attribution !== undefined ? (
            <span data-slot="blockquote-attribution">{attribution}</span>
          ) : null}
          {sourceTitle !== undefined ? (
            <cite data-slot="blockquote-source">
              {citeUrl === undefined ? sourceTitle : <a href={citeUrl}>{sourceTitle}</a>}
            </cite>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
});

Blockquote.displayName = "Blockquote";
