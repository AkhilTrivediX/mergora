import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import "./blockquote.css";

export interface BlockquoteProps extends HTMLAttributes<HTMLElement> {
  readonly attribution?: ReactNode;
  readonly children: ReactNode;
  readonly citeUrl?: string;
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
