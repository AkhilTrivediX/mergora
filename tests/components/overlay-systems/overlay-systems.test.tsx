import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { createToastQueue, ToastRegion } from "../../../registry/source/components/toast/toast.tsx";
import {
  assertImplementationProfileShard,
  loadMergoraSignaturePolicy,
} from "../../../tooling/registry-builder/src/implementation-matrix.ts";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(workspaceRoot, "registry/source/components");
const itemIds = [
  "context-menu",
  "drawer",
  "dropdown-menu",
  "hover-card",
  "lightbox",
  "menubar",
  "toast",
] as const;
const riskClasses = {
  "context-menu": 2,
  drawer: 3,
  "dropdown-menu": 2,
  "hover-card": 2,
  lightbox: 3,
  menubar: 3,
  toast: 2,
} as const;
const recordSuffixes = [
  "anatomy.json",
  "api.json",
  "contract.json",
  "metadata.json",
  "source.json",
  "status.json",
  "stories.json",
] as const;

function itemPath(itemId: string, filename: string): string {
  return resolve(componentsRoot, itemId, filename);
}

function readJson<T>(itemId: string, filename: string): T {
  return JSON.parse(readFileSync(itemPath(itemId, filename), "utf8")) as T;
}

describe("P5 overlay canonical records", () => {
  it("ships exactly twelve canonical files for every planned overlay", () => {
    for (const itemId of itemIds) {
      const files = readdirSync(resolve(componentsRoot, itemId)).sort();
      expect(files, itemId).toEqual(
        [
          "README.md",
          itemId + "-css.d.ts",
          itemId + ".anatomy.json",
          itemId + ".api.json",
          itemId + ".contract.json",
          itemId + ".css",
          itemId + ".metadata.json",
          itemId + ".source.json",
          itemId + ".status.json",
          itemId + ".stories.json",
          itemId + ".tsx",
          "index.ts",
        ].sort(),
      );
    }
  });

  it("validates metadata, story-state coverage, source imports, and public API exports", () => {
    for (const itemId of itemIds) {
      const metadata = readJson<Record<string, unknown>>(itemId, itemId + ".metadata.json");
      const contract = readJson<Record<string, unknown>>(itemId, itemId + ".contract.json");
      const stories = readJson<StoryStateMatrix>(itemId, itemId + ".stories.json");
      const source = readJson<{
        readonly declaredImports: readonly string[];
        readonly entryPath: string;
        readonly id: string;
        readonly itemDependencies: readonly string[];
        readonly outputRole: string;
      }>(itemId, itemId + ".source.json");
      const api = readJson<{
        readonly entryExport: string;
        readonly exports: readonly { readonly kind: string; readonly name: string }[];
        readonly itemId: string;
      }>(itemId, itemId + ".api.json");
      const runtime = readFileSync(itemPath(itemId, itemId + ".tsx"), "utf8");

      expect(validateSchemaDocument("component-metadata", metadata), itemId).toMatchObject({
        errors: [],
        ok: true,
      });
      expect(metadata).toMatchObject({ riskClass: riskClasses[itemId] });
      expect(contract).toMatchObject({ riskClass: riskClasses[itemId] });
      expect(validateStoryStateMatrix(stories), itemId).toMatchObject({ issues: [], ok: true });
      expect(stories.states).toHaveLength(22);

      const actualImports = new Set<string>();
      for (const match of runtime.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/gu)) {
        actualImports.add(match[1]!);
      }
      expect(source).toMatchObject({
        declaredImports: [...actualImports].sort((left, right) =>
          left.localeCompare(right, "en-US"),
        ),
        entryPath: "registry/source/components/" + itemId + "/" + itemId + ".tsx",
        id: itemId,
        outputRole: "component",
      });
      for (const specifier of source.declaredImports.filter((value) => value.startsWith("../"))) {
        expect(source.itemDependencies).toContain(specifier.split("/")[1]);
      }

      const runtimeExports = [
        ...runtime.matchAll(
          /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|const|enum|function|interface|let|namespace|type|var)\s+([A-Za-z_$][\w$]*)/gmu,
        ),
      ]
        .map((match) => match[1]!)
        .sort((left, right) => left.localeCompare(right, "en-US"));
      const apiExports = api.exports
        .map(({ name }) => name)
        .sort((left, right) => left.localeCompare(right, "en-US"));
      expect(api.itemId).toBe(itemId);
      expect(apiExports).toEqual(runtimeExports);
      expect(apiExports).toContain(api.entryExport);
    }
  });

  it("keeps release claims honest and validates the merged overlay profile shard", () => {
    for (const itemId of itemIds) {
      expect(readJson<Record<string, unknown>>(itemId, itemId + ".status.json")).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        recordedEvidence: [],
        releaseStatus: "unreleased",
      });
      const records = recordSuffixes
        .map((suffix) => readFileSync(itemPath(itemId, itemId + "." + suffix), "utf8"))
        .join("\n");
      expect(records).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/iu);
    }

    const shard = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/overlays.v1.json"),
        "utf8",
      ),
    ) as {
      readonly auditPendingIds: readonly string[];
      readonly profiles: readonly { readonly id: string }[];
    };
    expect(() =>
      assertImplementationProfileShard(
        shard,
        loadMergoraSignaturePolicy(workspaceRoot),
        workspaceRoot,
      ),
    ).not.toThrow();
    expect(shard.auditPendingIds).toEqual([]);
    expect(shard.profiles.map(({ id }) => id)).toEqual(expect.arrayContaining([...itemIds]));
  });

  it("uses declared tokens, logical geometry, restrained corners, and preference branches", () => {
    const tokenCss = readFileSync(
      resolve(workspaceRoot, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    const declarations = new Set(
      [...tokenCss.matchAll(/(--mrg-(?:semantic|component)-[a-z0-9-]+)\s*:/gu)].map(
        (match) => match[1],
      ),
    );
    for (const itemId of itemIds) {
      const css = readFileSync(itemPath(itemId, itemId + ".css"), "utf8");
      for (const token of [...css.matchAll(/var\((--mrg-(?:semantic|component)-[a-z0-9-]+)/gu)].map(
        (match) => match[1],
      )) {
        expect(declarations.has(token), itemId + ": " + token).toBe(true);
      }
      expect(css).not.toMatch(/#[0-9a-f]{3,8}|(?:oklch|rgb|hsl)\(|gradient\(/iu);
      expect(css).not.toMatch(/^\s*(?:margin|padding|inset|border)-(?:left|right)\s*:/mu);
      expect(css).not.toMatch(/border-radius\s*:\s*(?:1[7-9]|[2-9]\d)px/iu);
      expect(css).toContain("@media (forced-colors: active)");
      if (/\b(?:animation|transition)\s*:/u.test(css)) {
        expect(css).toContain("@media (prefers-reduced-motion: reduce)");
      }
    }

    const hoverCardCss = readFileSync(itemPath("hover-card", "hover-card.css"), "utf8");
    expect(hoverCardCss).toMatch(
      /\.mrg-hover-card__pin-rail\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;/u,
    );
    expect(hoverCardCss).toMatch(
      /\.mrg-hover-card__pin-rail output\s*\{[\s\S]*?pointer-events:\s*none;/u,
    );
  });
});

describe("Mergora toast queue", () => {
  afterEach(() => vi.useRealTimers());

  it("prioritizes urgent work, pauses visible timers, and resumes remaining time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const queue = createToastQueue({ defaultTimeout: 1_000, maxVisible: 1 });
    const normalKey = queue.add({ title: "Normal update" });
    const urgentKey = queue.add({ priority: "urgent", title: "Urgent update" });

    expect(queue.getSnapshot()).toMatchObject({
      queuedCount: 1,
      visible: [{ key: urgentKey }],
    });
    queue.pauseAll();
    vi.advanceTimersByTime(5_000);
    expect(queue.getSnapshot().records).toHaveLength(2);
    queue.resumeAll();
    vi.advanceTimersByTime(999);
    expect(queue.getSnapshot().visible[0]?.key).toBe(urgentKey);
    vi.advanceTimersByTime(1);
    expect(queue.getSnapshot().visible[0]?.key).toBe(normalKey);
  });

  it("deduplicates by key and can change between persistent and timed delivery", () => {
    vi.useFakeTimers();
    const queue = createToastQueue({ defaultTimeout: 1_000 });
    const original = queue.add(
      { persistent: true, title: "Stored locally" },
      { dedupeKey: "storage" },
    );
    const updated = queue.add(
      { title: "Storage synchronized" },
      { dedupeKey: "storage", timeout: 1_000 },
    );
    expect(updated).toBe(original);
    expect(queue.getSnapshot()).toMatchObject({
      records: [{ content: { title: "Storage synchronized" }, key: original }],
    });
    vi.advanceTimersByTime(1_000);
    expect(queue.getSnapshot().records).toEqual([]);
  });

  it("removes optional region UI and accessibility output independently", () => {
    const queue = createToastQueue({ maxVisible: 1 });
    queue.add({ persistent: true, title: "Visible update" });
    queue.add({ persistent: true, title: "Waiting update" });

    const plain = renderToStaticMarkup(<ToastRegion queue={queue} />);
    const summaryOnly = renderToStaticMarkup(<ToastRegion queue={queue} showQueueSummary />);
    const controlsOnly = renderToStaticMarkup(<ToastRegion pauseControls queue={queue} />);

    expect(plain).toContain('role="status"');
    expect(plain).not.toContain("toast-queue-summary");
    expect(plain).not.toContain("toast-pause-control");
    expect(summaryOnly).toContain("toast-queue-summary");
    expect(summaryOnly).not.toContain("toast-pause-control");
    expect(controlsOnly).not.toContain("toast-queue-summary");
    expect(controlsOnly).toContain("toast-pause-control");
  });
});
