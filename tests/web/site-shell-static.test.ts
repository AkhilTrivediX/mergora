import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const searchSource = readFileSync(
  resolve(repositoryRoot, "apps/web/src/app/site-search.tsx"),
  "utf8",
);
const siteStyles = readFileSync(resolve(repositoryRoot, "apps/web/src/app/styles.css"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, "u").exec(siteStyles);
  expect(match, `Missing site-shell rule ${selector}`).not.toBeNull();
  return match?.groups?.body ?? "";
}

describe("site shell static integration", () => {
  it("keeps nested search inside its invoking modal focus scope", () => {
    expect(searchSource).toContain("event.currentTarget.focus();");
    expect(searchSource).toContain("modalSearchPortalTarget(event.currentTarget)");
    expect(searchSource).toContain("modalSearchPortalTarget(document.activeElement)");
    expect(searchSource).toContain("createPortal(");
    expect(searchSource).toContain('if (event.key === "Escape") event.stopPropagation();');
  });

  it("uses matched semantic foreground and background pairs for every drawer trigger state", () => {
    expect(rule(".site-shell-drawer-host .site-shell-drawer-trigger")).toContain(
      "background: var(--mrg-semantic-color-background-surface)",
    );
    expect(rule(".site-shell-drawer-host .site-shell-drawer-trigger")).toContain(
      "color: var(--mrg-semantic-color-foreground-primary)",
    );
    expect(rule(".site-shell-drawer-host .site-shell-drawer-trigger[data-hovered]")).toContain(
      "background: var(--mrg-semantic-color-background-surface-sunken)",
    );
    expect(rule(".site-shell-drawer-host .site-shell-drawer-trigger[data-hovered]")).toContain(
      "color: var(--mrg-semantic-color-foreground-primary)",
    );
    expect(rule(".site-shell-drawer-host .site-shell-drawer-trigger[data-pressed]")).toContain(
      "background: var(--mrg-semantic-color-selection-background)",
    );
    expect(rule(".site-shell-drawer-host .site-shell-drawer-trigger[data-pressed]")).toContain(
      "color: var(--mrg-semantic-color-selection-foreground)",
    );
  });
});
