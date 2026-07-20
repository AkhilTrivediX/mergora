import { readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const canonicalRoots = [
  "registry/source/components",
  "registry/source/systems",
  "registry/source/kits",
] as const;

function canonicalCssFiles(): readonly string[] {
  return canonicalRoots
    .flatMap((root) =>
      readdirSync(resolve(workspaceRoot, root), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && extname(entry.name) === ".css")
        .map((entry) => resolve(entry.parentPath, entry.name)),
    )
    .sort((left, right) => left.localeCompare(right, "en-US"));
}

function displayPath(path: string): string {
  return relative(workspaceRoot, path).replaceAll("\\", "/");
}

describe("canonical Mergora style policy", () => {
  it("keeps color and visual effects behind the shared semantic vocabulary", () => {
    const violations: string[] = [];
    const forbidden =
      /#[\da-f]{3,8}\b|\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch)a?\(|(?:linear|radial|conic|repeating-linear|repeating-radial)-gradient\(|backdrop-filter\s*:/giu;

    for (const path of canonicalCssFiles()) {
      const css = readFileSync(path, "utf8");
      const matches = css.match(forbidden) ?? [];
      for (const match of matches) violations.push(`${displayPath(path)}: ${match}`);
    }

    expect(violations).toEqual([]);
  });

  it("uses only capped semantic/component radius tokens or structural zero/inherit values", () => {
    const violations: string[] = [];
    const declaration = /border-radius\s*:\s*([^;]+);/giu;
    const literalLength = /(?:^|[\s(+-])\d*\.?\d+(?:px|r?em|ch|vh|vw|vmin|vmax|cqw|cqh)\b/iu;
    const allowedRadiusToken = /var\(--mrg-(?:semantic|component)-[^)]*radius[^)]*\)/iu;

    for (const path of canonicalCssFiles()) {
      const css = readFileSync(path, "utf8");
      for (const match of css.matchAll(declaration)) {
        const value = match[1]!.replace(/\s+/gu, " ").trim();
        const structuralOnly = /^(?:(?:0|inherit)\s*)+$/u.test(value);
        if (
          value.includes("%") ||
          literalLength.test(value) ||
          (!structuralOnly && !allowedRadiusToken.test(value))
        ) {
          violations.push(`${displayPath(path)}: border-radius: ${value}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
