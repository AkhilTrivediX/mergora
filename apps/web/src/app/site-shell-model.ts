export type NavigationItem = readonly [label: string, href: string];

export function navigationIsCurrent(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function routeAnnouncementMessage(label: string | null | undefined): string {
  const normalized = label?.replaceAll(/\s+/gu, " ").trim() ?? "";
  return normalized === "" ? "Page loaded." : `${normalized} page loaded.`;
}
