import type { ComponentPropsWithoutRef } from "react";

type SiteLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  readonly href: string;
};

const SITE_LINK_BASE_PATH = process.env.NEXT_PUBLIC_MERGORA_BASE_PATH ?? "";

export function staticSiteHref(href: string): string {
  if (
    SITE_LINK_BASE_PATH === "" ||
    !href.startsWith("/") ||
    href.startsWith("//") ||
    href === SITE_LINK_BASE_PATH ||
    href.startsWith(`${SITE_LINK_BASE_PATH}/`) ||
    href.startsWith(`${SITE_LINK_BASE_PATH}?`) ||
    href.startsWith(`${SITE_LINK_BASE_PATH}#`)
  ) {
    return href;
  }
  return `${SITE_LINK_BASE_PATH}${href}`;
}

/**
 * Static exports do not serve Next's route-tree documents reliably on every
 * file host. Plain anchors preserve resilient, base-path-aware navigation
 * without speculative or click-time RSC requests.
 */
export function SiteLink({ href, ...props }: SiteLinkProps) {
  return <a {...props} href={staticSiteHref(href)} />;
}
