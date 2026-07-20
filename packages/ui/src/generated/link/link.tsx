// Generated from registry/source/components/link/link.tsx by @mergora-internal/source-transformer. Do not edit.
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";

import "./link.css";

export type LinkCurrent = AnchorHTMLAttributes<HTMLAnchorElement>["aria-current"];

export interface LinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "aria-disabled" | "href"
> {
  /** Required anchor destination passed directly to the native href attribute. */
  readonly href: string;
  /** Visible link label content and the default accessible-name source. */
  readonly children: ReactNode;
  /** Uses target=_blank by default and adds noopener and noreferrer to the resolved rel. */
  readonly external?: boolean;
  /** Expands standalone actions to the 44 CSS-pixel comfort target. */
  readonly standalone?: boolean;
  /** Optional visible and announced context such as "New tab". Rendered only for external links. */
  readonly externalContext?: string | false;
}

function mergeRel(rel: string | undefined, opensNewContext: boolean): string | undefined {
  if (!opensNewContext) return rel;
  const tokens = new Set((rel ?? "").split(/\s+/u).filter(Boolean));
  tokens.add("noopener");
  tokens.add("noreferrer");
  return [...tokens].join(" ");
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  {
    children,
    className,
    download,
    external = false,
    externalContext = false,
    href,
    rel,
    standalone = false,
    target,
    ...nativeProps
  },
  ref,
) {
  const resolvedTarget = external ? (target ?? "_blank") : target;
  const usableExternalContext =
    external && typeof externalContext === "string" && externalContext.trim().length > 0
      ? externalContext
      : undefined;
  return (
    <a
      {...nativeProps}
      className={className === undefined ? "mrg-link" : `mrg-link ${className}`}
      data-current={nativeProps["aria-current"] === undefined ? undefined : "true"}
      data-download={download === undefined || download === false ? undefined : "true"}
      data-external={external || undefined}
      data-external-context={usableExternalContext === undefined ? undefined : "true"}
      data-slot="link"
      data-standalone={standalone || undefined}
      download={download}
      href={href}
      ref={ref}
      rel={mergeRel(rel, resolvedTarget === "_blank")}
      target={resolvedTarget}
    >
      <span data-slot="link-label">{children}</span>
      {usableExternalContext === undefined ? null : (
        <span data-slot="link-external-context">{usableExternalContext}</span>
      )}
      {external ? (
        <span aria-hidden="true" data-slot="link-external-indicator">
          ↗
        </span>
      ) : null}
      {download !== undefined && download !== false ? (
        <span aria-hidden="true" data-slot="link-download-indicator">
          ↓
        </span>
      ) : null}
    </a>
  );
});

Link.displayName = "Link";
Object.defineProperty(Link, Symbol.for("mergora-ui/toolbar-action"), { value: true });
