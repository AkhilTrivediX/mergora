import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_STORY_STATES,
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/state-matrix.ts";
import { validateSchemaDocument } from "../../../registry/schemas/validators.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const canonicalRoot = resolve(workspaceRoot, "registry/source/components/button");

function readCanonical(name: string): string {
  return readFileSync(resolve(canonicalRoot, name), "utf8");
}

function readJson<T>(name: string): T {
  return JSON.parse(readCanonical(name)) as T;
}

describe("Button canonical inputs", () => {
  it("declares the transform entry without dependencies or release identity", () => {
    const source = readJson<{
      declaredImports: string[];
      entryPath: string;
      id: string;
      itemDependencies: string[];
      outputRole: string;
    }>("button.source.json");

    expect(source).toEqual({
      declaredImports: ["./button-state.js", "./button.css", "react"],
      entryPath: "registry/source/components/button/button.tsx",
      id: "button",
      itemDependencies: [],
      outputRole: "component",
    });
  });

  it("keeps maturity, release, and evidence status honest", () => {
    const metadata = readJson<Record<string, unknown>>("button.metadata.json");
    const status = readJson<Record<string, unknown>>("button.status.json");
    const combined = [
      readCanonical("button.metadata.json"),
      readCanonical("button.status.json"),
      readCanonical("button.contract.json"),
    ].join("\n");

    expect(validateSchemaDocument("component-metadata", metadata)).toMatchObject({
      errors: [],
      ok: true,
    });
    expect(status).toMatchObject({
      distributionStatus: "not-generated",
      evidenceStatus: "incomplete",
      recordedEvidence: [],
      releaseStatus: "unreleased",
      sourceStatus: "p1-canonical-input",
    });
    expect(combined).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/u);
    expect(combined).not.toMatch(/"(?:manualEvidence|recordedEvidence)"\s*:\s*\[[^\]]+\]/u);
  });

  it("records every policy story state or a concrete not-applicable reason", () => {
    const matrix = readJson<StoryStateMatrix>("button.stories.json");
    const validation = validateStoryStateMatrix(matrix);

    expect(validation.issues).toEqual([]);
    expect(validation.ok).toBe(true);
    expect(matrix.states.slice(0, REQUIRED_STORY_STATES.length).map((state) => state.id)).toEqual(
      REQUIRED_STORY_STATES,
    );
  });

  it("freezes the native ref, public variants, sizes, and pending event policy", () => {
    const api = readJson<{
      defaultNativeType: string;
      eventPolicy: { pending: string };
      props: { name: string; type: string }[];
      refTarget: string;
    }>("button.api.json");

    expect(api.refTarget).toBe("HTMLButtonElement");
    expect(api.defaultNativeType).toBe("button");
    expect(api.props.find((prop) => prop.name === "variant")?.type).toBe(
      "primary | secondary | quiet | destructive",
    );
    expect(api.props.find((prop) => prop.name === "size")?.type).toBe("small | medium | large");
    expect(api.eventPolicy.pending).toMatch(/remains focusable/u);
    expect(api.eventPolicy.pending).toMatch(/cancelled/u);
  });

  it("documents pending semantics and all stable selectors", () => {
    const contract = readJson<{
      claim: string;
      evidenceRequirements: { manual: string[]; recordedEvidence: unknown[] };
      stableSelectors: { attributes: string[]; root: string };
      states: { pending: { attributes: string[]; behavior: string } };
    }>("button.contract.json");

    expect(contract.claim).toMatch(/No Stable, release, conformance, or manual/u);
    expect(contract.states.pending.attributes).toEqual([
      "aria-busy",
      "aria-disabled",
      "data-pending",
    ]);
    expect(contract.states.pending.behavior).toMatch(/Remains focusable/u);
    expect(contract.stableSelectors).toEqual({
      attributes: ["data-variant", "data-size", "data-pending", "data-disabled"],
      root: "[data-slot=button]",
    });
    expect(contract.evidenceRequirements.manual).toEqual([
      "keyboard-forced-colors",
      "nvda-firefox",
      "voiceover-safari",
    ]);
    expect(contract.evidenceRequirements.recordedEvidence).toEqual([]);
  });

  it("uses semantic tokens, logical layout, and explicit preference fallbacks", () => {
    const css = readCanonical("button.css");

    expect(css).toContain("--mrg-semantic-color-action-background");
    expect(css).toContain("--mrg-semantic-size-target-preferred");
    expect(css).toContain("@media (any-pointer: coarse)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("padding-inline");
    expect(css).toContain("min-block-size");
    expect(css).not.toMatch(/(?:margin|padding|inset|border)-(?:left|right)/u);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}|(?:oklch|rgb|hsl)\(/iu);
  });

  it("keeps the root attributes in the canonical implementation", () => {
    const source = readCanonical("button.tsx");

    for (const attribute of [
      'data-slot="button"',
      "data-variant={variant}",
      "data-size={size}",
      'data-pending={pending ? "true" : undefined}',
      "aria-busy={pending ? true : ariaBusy}",
      "aria-disabled={pending ? true : ariaDisabled}",
      "aria-label={renderedAriaLabel}",
      "aria-labelledby={renderedAriaLabelledBy}",
    ]) {
      expect(source).toContain(attribute);
    }
  });
});
