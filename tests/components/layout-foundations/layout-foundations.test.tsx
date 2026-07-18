import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import {
  AspectRatio,
  resolveAspectRatio,
} from "../../../registry/source/components/aspect-ratio/aspect-ratio.tsx";
import { Center } from "../../../registry/source/components/center/center.tsx";
import { Cluster } from "../../../registry/source/components/cluster/cluster.tsx";
import { Container } from "../../../registry/source/components/container/container.tsx";
import { Grid } from "../../../registry/source/components/grid/grid.tsx";
import { Inline } from "../../../registry/source/components/inline/inline.tsx";
import { Separator } from "../../../registry/source/components/separator/separator.tsx";
import { Stack } from "../../../registry/source/components/stack/stack.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = [
  "aspect-ratio",
  "center",
  "cluster",
  "container",
  "grid",
  "inline",
  "separator",
  "stack",
] as const;

const requiredRecordSuffixes = [
  "anatomy.json",
  "api.json",
  "contract.json",
  "metadata.json",
  "source.json",
  "status.json",
  "stories.json",
] as const;

function readItem(itemId: (typeof itemIds)[number], filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: (typeof itemIds)[number], filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

describe("P2 layout foundation records", () => {
  it("ships every canonical record without a release or evidence claim", () => {
    for (const itemId of itemIds) {
      const files = new Set(readdirSync(resolve(componentsRoot, itemId)));
      for (const suffix of requiredRecordSuffixes) {
        expect(files, `${itemId} is missing ${itemId}.${suffix}`).toContain(`${itemId}.${suffix}`);
      }
      expect(files).toContain("README.md");
      expect(files).toContain(`${itemId}.tsx`);
      expect(files).toContain(`${itemId}.css`);
      expect(files).toContain("index.ts");

      const status = readJson<{
        distributionStatus: string;
        evidenceStatus: string;
        implementationStatus: string;
        promotionDelta: string[];
        recordedEvidence: unknown[];
        releaseStatus: string;
      }>(itemId, `${itemId}.status.json`);
      expect(status).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        recordedEvidence: [],
        releaseStatus: "unreleased",
      });
      expect(status.promotionDelta.length).toBeGreaterThanOrEqual(7);

      const claims = [
        readItem(itemId, `${itemId}.metadata.json`),
        readItem(itemId, `${itemId}.status.json`),
        readItem(itemId, `${itemId}.contract.json`),
      ].join("\n");
      expect(claims).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/iu);
      expect(claims).not.toMatch(/"recordedEvidence"\s*:\s*\[[^\]]+\]/u);
    }
  });

  it("validates every component metadata document and complete story-state policy", () => {
    for (const itemId of itemIds) {
      const metadata = readJson<Record<string, unknown>>(itemId, `${itemId}.metadata.json`);
      const stories = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      expect(validateSchemaDocument("component-metadata", metadata), itemId).toMatchObject({
        errors: [],
        ok: true,
      });
      expect(validateStoryStateMatrix(stories), itemId).toMatchObject({ issues: [], ok: true });
    }
  });

  it("uses only declared semantic or component-local variables and logical edge properties", () => {
    const tokenCss = readFileSync(
      resolve(root, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    const tokenDeclarations = new Set(
      [...tokenCss.matchAll(/(--mrg-[a-z0-9-]+)\s*:/gu)].map((match) => match[1]),
    );

    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      const source = readItem(itemId, `${itemId}.tsx`);
      const localDeclarations = new Set(
        [...`${css}\n${source}`.matchAll(/["']?(--mrg-[a-z0-9-]+)["']?\s*:/gu)].map(
          (match) => match[1],
        ),
      );
      const references = [...css.matchAll(/var\((--mrg-[a-z0-9-]+)/gu)].map((match) => match[1]);

      for (const reference of references) {
        expect(
          tokenDeclarations.has(reference) || localDeclarations.has(reference),
          `${itemId} references undeclared token ${reference}`,
        ).toBe(true);
      }
      expect(css).not.toMatch(/^\s*(?:margin|padding|inset|border)-(?:left|right)\s*:/mu);
      expect(css).not.toMatch(/#[0-9a-f]{3,8}|(?:oklch|rgb|hsl)\(/iu);
      expect(css).not.toMatch(/overflow\s*:\s*(?:hidden|clip)/u);
    }

    const aspectRatioCss = readItem("aspect-ratio", "aspect-ratio.css");
    expect(aspectRatioCss).toContain("@supports not (aspect-ratio: 1)");
    expect(aspectRatioCss).toContain("grid-area: 1 / 1");
    expect(aspectRatioCss).not.toContain("position: absolute");
  });
});

describe("P2 layout foundation server semantics", () => {
  it("renders closed native roots, forwarded attributes, and stable layout slots", () => {
    const markup = renderToStaticMarkup(
      <Container className="consumer-container" queryContainer safeArea width="wide">
        <Stack element="section" gap="lg">
          <Inline align="baseline" justify="between">
            <span>Source</span>
            <span>Package</span>
          </Inline>
          <Grid columns="auto" element="ul" listStyle="none" minimum="compact">
            <li>One</li>
            <li>Two</li>
          </Grid>
          <Center axis="inline" maximum="prose" text="center">
            <p>Centered evidence</p>
          </Center>
          <Cluster orphan="fill">
            <button type="button">Run</button>
            <button type="button">Inspect</button>
          </Cluster>
        </Stack>
      </Container>,
    );

    expect(markup).toContain('class="mrg-container consumer-container"');
    expect(markup).toContain('data-slot="container"');
    expect(markup).toContain('data-query-container="true"');
    expect(markup).toContain("<section");
    expect(markup).toContain('data-slot="stack"');
    expect(markup).toContain('data-slot="inline"');
    expect(markup).toContain("<ul");
    expect(markup).toContain('data-slot="grid"');
    expect(markup).toContain('data-minimum="compact"');
    expect(markup).toContain('data-slot="center"');
    expect(markup).toContain('data-maximum="prose"');
    expect(markup).toContain('data-slot="cluster"');
    expect(markup).toContain('data-orphan="fill"');
    expect(markup).not.toContain('role="grid"');
  });

  it("keeps aspect ratio semantic-neutral and validates custom tuples deterministically", () => {
    expect(resolveAspectRatio("square")).toEqual({ fallback: "100%", native: 1 });
    expect(resolveAspectRatio("video")).toEqual({ fallback: "56.25%", native: 16 / 9 });
    expect(resolveAspectRatio([5, 4])).toEqual({ fallback: "80%", native: 1.25 });
    expect(() => resolveAspectRatio([0, 4])).toThrow(RangeError);
    expect(() => resolveAspectRatio([Number.NaN, 4])).toThrow(RangeError);

    const markup = renderToStaticMarkup(
      <AspectRatio aria-label="Preview geometry" className="consumer-ratio" ratio={[5, 4]}>
        <img alt="Evidence preview" src="/preview.png" />
      </AspectRatio>,
    );
    expect(markup).toContain('class="mrg-aspect-ratio consumer-ratio"');
    expect(markup).toContain('data-ratio="custom"');
    expect(markup).toContain("--mrg-aspect-ratio:1.25");
    expect(markup).toContain("--mrg-aspect-ratio-fallback:80%");
    expect(markup).toContain('alt="Evidence preview"');
    expect(markup).not.toContain('role="img"');
  });

  it("renders native and ARIA separator modes without interactive splitter behavior", () => {
    const semanticHorizontal = renderToStaticMarkup(<Separator decorative={false} />);
    const semanticVertical = renderToStaticMarkup(
      <Separator aria-label="Source and package" decorative={false} orientation="vertical" />,
    );
    const decorative = renderToStaticMarkup(<Separator />);

    expect(semanticHorizontal).toMatch(/^<hr/u);
    expect(semanticHorizontal).toContain('data-orientation="horizontal"');
    expect(semanticHorizontal).not.toContain("aria-hidden");
    expect(semanticVertical).toMatch(/^<div/u);
    expect(semanticVertical).toContain('role="separator"');
    expect(semanticVertical).toContain('aria-orientation="vertical"');
    expect(semanticVertical).toContain('aria-label="Source and package"');
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).toContain('role="presentation"');
    expect(decorative).not.toContain("tabindex");
  });

  it("renders empty roots as valid inert markup", () => {
    const components = [Container, Stack, Inline, Grid, Center, Cluster, AspectRatio] as const;
    for (const Component of components) {
      const markup = renderToStaticMarkup(createElement(Component));
      expect(markup).not.toContain("role=");
      expect(markup).not.toContain("tabindex=");
      expect(markup).not.toContain("aria-live=");
    }
  });
});
