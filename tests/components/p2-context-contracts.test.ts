import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateSchemaDocument } from "../../registry/schemas/index.ts";

const items = [
  "provider",
  "visually-hidden",
  "focus-ring",
  "portal",
  "presence",
  "client-only",
  "slot",
  "direction",
  "sr-announcer",
  "layer-manager",
] as const;

const directoryFor = (item: (typeof items)[number]): string =>
  resolve("registry/source/components", item);

function readJson(item: (typeof items)[number], suffix: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(directoryFor(item), `${item}.${suffix}.json`), "utf8"),
  ) as Record<string, unknown>;
}

describe("P2 context infrastructure machine contracts", () => {
  it.each(items)("validates %s metadata against the canonical schema", (item) => {
    const result = validateSchemaDocument("component-metadata", readJson(item, "metadata"));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it.each(items)("keeps %s maturity and evidence claims honest", (item) => {
    const status = readJson(item, "status") as {
      implementationStatus: string;
      distributionStatus: string;
      releaseStatus: string;
      evidenceStatus: string;
      recordedEvidence: unknown[];
      promotionDelta: string[];
    };
    const contract = readJson(item, "contract") as {
      contractStatus: string;
      claim: string;
      evidenceRequirements: { recordedEvidence: unknown[] };
    };

    expect(status.implementationStatus).toBe("source-present-unreleased");
    expect(status.distributionStatus).toBe("not-generated");
    expect(status.releaseStatus).toBe("unreleased");
    expect(status.evidenceStatus).toBe("incomplete");
    expect(status.recordedEvidence).toEqual([]);
    expect(status.promotionDelta.length).toBeGreaterThanOrEqual(4);
    expect(contract.contractStatus).toBe("source-present-unreleased");
    expect(contract.claim).toMatch(/^No Stable,/u);
    expect(contract.evidenceRequirements.recordedEvidence).toEqual([]);
  });

  it.each(items)("publishes a complete canonical companion set for %s", (item) => {
    const directory = directoryFor(item);
    for (const file of [
      `${item}.anatomy.json`,
      `${item}.api.json`,
      `${item}.contract.json`,
      `${item}.metadata.json`,
      `${item}.source.json`,
      `${item}.status.json`,
      `${item}.stories.json`,
      "README.md",
      "index.ts",
    ]) {
      expect(() => readFileSync(resolve(directory, file), "utf8")).not.toThrow();
    }
  });

  it.each(items)("declares the exact entry import graph for %s", (item) => {
    const manifest = readJson(item, "source") as {
      declaredImports: string[];
      entryPath: string;
      itemDependencies: string[];
    };
    const actualImports = new Set<string>();
    const source = readFileSync(resolve(manifest.entryPath), "utf8");
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/gu)) {
      actualImports.add(match[1]!);
    }

    expect(manifest.declaredImports).toEqual([...actualImports].sort());
    for (const specifier of manifest.declaredImports.filter((value) => value.startsWith("../"))) {
      const dependency = specifier.split("/")[1]!;
      expect(manifest.itemDependencies).toContain(dependency);
    }
    expect(Object.keys(manifest).sort()).toEqual([
      "declaredImports",
      "entryPath",
      "id",
      "itemDependencies",
      "outputRole",
    ]);
  });

  it("uses semantic focus tokens and explicit user-preference branches", () => {
    const focus = readFileSync(resolve(directoryFor("focus-ring"), "focus-ring.css"), "utf8");
    const hidden = readFileSync(
      resolve(directoryFor("visually-hidden"), "visually-hidden.css"),
      "utf8",
    );
    const presence = readFileSync(resolve(directoryFor("presence"), "presence.css"), "utf8");

    expect(focus).toContain("var(--mrg-component-focus-indicator-color)");
    expect(focus).toContain("@media (forced-colors: active)");
    expect(hidden).toContain("@media (forced-colors: active)");
    expect(presence).toContain("@media (prefers-reduced-motion: reduce)");
    for (const css of [focus, hidden, presence]) {
      expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    }
  });

  it("keeps ClientOnly structurally neutral and Slot precedence explicit", () => {
    const client = readFileSync(resolve(directoryFor("client-only"), "client-only.tsx"), "utf8");
    const slot = readFileSync(resolve(directoryFor("slot"), "slot.tsx"), "utf8");

    expect(client).toContain("return <>{mounted ? children : fallback}</>");
    expect(client).not.toMatch(/<(?:span|div)[\s>]/u);
    expect(slot).toContain('slotProps["data-slot"] ?? childProps["data-slot"] ?? "slot"');
  });
});
