import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  listSourceItemIds,
  loadCatalog,
  loadSourceItem,
  registryAliases,
  resolveDocumentation,
  resolveSourceDependencyClosure,
  searchRegistry,
  viewRegistryItems,
} from "../../packages/cli/src/index.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("bundled registry discovery", () => {
  it("discovers every generated source payload without a fixed item table", () => {
    const expected = readdirSync(resolve(registryDirectory, "native-source-items"))
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -5))
      .sort((left, right) => left.localeCompare(right, "en-US"));
    const actual = listSourceItemIds({ registryDirectory });

    expect(actual).toEqual(expected);
    expect(actual.length).toBeGreaterThanOrEqual(26);
    expect(actual).toContain("button");
    expect(actual).toContain("provider");
    expect(actual).toContain("split-pane");
  });

  it("resolves complete deterministic dependency closure in topological order", () => {
    expect(
      resolveSourceDependencyClosure(["presence", "provider", "focus-ring"], {
        registryDirectory,
      }).map(({ itemId }) => itemId),
    ).toEqual(["slot", "focus-ring", "direction", "provider", "presence"]);
    expect(
      resolveSourceDependencyClosure(["split-pane"], { registryDirectory }).map(
        ({ itemId }) => itemId,
      ),
    ).toEqual(["direction", "slot", "provider", "resizable", "split-pane"]);
  });

  it("resolves reviewed aliases without letting aliases shadow canonical IDs", () => {
    expect(registryAliases()).toEqual({
      divider: "separator",
      "screen-reader-only": "visually-hidden",
      "sr-only": "visually-hidden",
    });
    const view = viewRegistryItems(["divider"], { files: true, registryDirectory });
    expect(view[0]?.id).toBe("separator");
    expect(view[0]?.requestedAs).toBe("divider");
    expect(view[0]?.files.length).toBeGreaterThan(0);
  });

  it("searches locally with deterministic ranking, filters, and bounded results", () => {
    const first = searchRegistry("button", { registryDirectory, limit: 3 });
    const second = searchRegistry("button", { registryDirectory, limit: 3 });
    expect(first).toEqual(second);
    expect(first.items[0]?.id).toBe("button");
    expect(first.items).toHaveLength(3);
    expect(first.items.every(({ docsUrl }) => docsUrl.startsWith("https://"))).toBe(true);

    const layout = searchRegistry("", {
      registryDirectory,
      category: "layout-structure",
      limit: 100,
    });
    expect(layout.items.length).toBeGreaterThanOrEqual(8);
    expect(layout.items.every(({ category }) => category === "layout-structure")).toBe(true);
    expect(searchRegistry("", { registryDirectory, maturity: "stable" }).items).toEqual([]);
    expect(first.items[0]).toMatchObject({
      latestStableVersion: null,
      installModes: { source: false, package: false },
      qualityTier: null,
    });
  });

  it("returns source only after an exact explicit logical path", () => {
    const metadata = viewRegistryItems(["button"], { registryDirectory });
    expect(metadata[0]?.files).toEqual([]);
    expect(metadata[0]?.requestedSource).toBeNull();

    const source = viewRegistryItems(["button"], {
      registryDirectory,
      source: "button.tsx",
    });
    expect(source[0]?.requestedSource?.logicalPath).toBe(
      "registry/source/components/button/button.tsx",
    );
    expect(source[0]?.requestedSource?.content).toContain("export const Button");
    expect(() =>
      viewRegistryItems(["button"], { registryDirectory, source: "../package.json" }),
    ).toThrow(/unsafe path segment/u);
  });

  it("keeps release truth explicit instead of inventing immutable evidence", () => {
    const item = viewRegistryItems(["dialog"], { files: true, registryDirectory })[0]!;
    expect(item.maturity).toBe("unreleased");
    expect(item.immutableDigest).toBeNull();
    expect(item.packageAvailable).toBe(false);
    expect(item.passport).toBe("unreleased-not-attested");
    expect(item.blockers).toContain("release-identity-missing");
    expect(item.runtimeDependencies["react-aria-components"]).toBe("1.19.0");
    expect(item.compatibility.react).toBe("18.3.x || 19.x");
  });

  it("resolves canonical documentation without browser or telemetry", () => {
    const docs = resolveDocumentation("sr-only", {
      registryDirectory,
      open: true,
      nonInteractive: true,
    });
    expect(docs.canonical).toBe("visually-hidden");
    expect(docs.opened).toBe(false);
    expect(docs.url).toBe("https://akhiltrivedix.github.io/mergora/components/visually-hidden/");
  });
});

describe("registry payload security", () => {
  function maliciousRegistry(mutator: (payload: Record<string, unknown>) => void): string {
    const directory = mkdtempSync(resolve(tmpdir(), "mergora-registry-fixture-"));
    temporaryDirectories.push(directory);
    const items = resolve(directory, "native-source-items");
    mkdirSync(items, { recursive: true });
    const payload = JSON.parse(
      readFileSync(resolve(registryDirectory, "native-source-items/button.json"), "utf8"),
    ) as Record<string, unknown>;
    mutator(payload);
    writeFileSync(resolve(items, "button.json"), JSON.stringify(payload), "utf8");
    return directory;
  }

  function maliciousCatalog(mutator: (catalog: Record<string, unknown>) => void): string {
    const directory = mkdtempSync(resolve(tmpdir(), "mergora-catalog-fixture-"));
    temporaryDirectories.push(directory);
    cpSync(
      resolve(registryDirectory, "native-source-items"),
      resolve(directory, "native-source-items"),
      { recursive: true },
    );
    const catalog = JSON.parse(
      readFileSync(resolve(registryDirectory, "catalog.json"), "utf8"),
    ) as Record<string, unknown>;
    mutator(catalog);
    writeFileSync(resolve(directory, "catalog.json"), JSON.stringify(catalog), "utf8");
    return directory;
  }

  it("rejects traversal before exposing source", () => {
    const directory = maliciousRegistry((payload) => {
      const files = payload.files as Record<string, unknown>[];
      files[0]!.targetPath = "../outside.ts";
    });
    expect(() => loadSourceItem("button", { registryDirectory: directory })).toThrow(
      /portable project-relative|failed identity|unsafe file declaration|unsafe path segment/u,
    );
  });

  it("rejects executable files and unpinned runtime dependencies", () => {
    const executable = maliciousRegistry((payload) => {
      const files = payload.files as Record<string, unknown>[];
      files[0]!.executable = true;
    });
    expect(() => loadSourceItem("button", { registryDirectory: executable })).toThrow(
      /unsafe file declaration/u,
    );

    const unpinned = maliciousRegistry((payload) => {
      payload.runtimeDependencies = ["unexpected-runtime"];
    });
    expect(() => loadSourceItem("button", { registryDirectory: unpinned })).toThrow(
      /unsupported runtime dependency/u,
    );
  });

  it("rejects portable case collisions independent of the host filesystem", () => {
    const directory = maliciousRegistry((payload) => {
      const files = payload.files as Record<string, unknown>[];
      files.push({
        ...files[0],
        targetPath: String(files[0]!.targetPath).toLocaleUpperCase("en-US"),
      });
    });
    expect(() => loadSourceItem("button", { registryDirectory: directory })).toThrow(
      /portable target/u,
    );
  });

  it("rejects cyclic or missing dependency graphs", () => {
    const missing = maliciousRegistry((payload) => {
      payload.registryDependencies = ["missing-item"];
    });
    expect(() =>
      resolveSourceDependencyClosure(["button"], { registryDirectory: missing }),
    ).toThrow(/depends on missing item/u);
  });

  it("fails closed when the item directory contains a non-regular entry", () => {
    const directory = maliciousRegistry(() => undefined);
    mkdirSync(resolve(directory, "native-source-items/unexpected-directory"));
    expect(() => listSourceItemIds({ registryDirectory: directory })).toThrow(
      /symlink or unsupported entry/u,
    );
  });

  it("rejects duplicate catalog identities and source-availability drift", () => {
    const mismatched = maliciousCatalog((catalog) => {
      const items = catalog.items as Record<string, unknown>[];
      const button = items.find(({ id }) => id === "button")!;
      button.sourceAvailable = false;
    });
    expect(() => loadCatalog({ registryDirectory: mismatched })).toThrow(
      /source availability.*inconsistent/u,
    );

    const duplicate = maliciousCatalog((catalog) => {
      const items = catalog.items as Record<string, unknown>[];
      items.push({ ...items[0] });
    });
    expect(() => loadCatalog({ registryDirectory: duplicate })).toThrow(/repeats item/u);
  });
});
