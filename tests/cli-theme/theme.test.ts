import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyInit } from "../../packages/cli/src/configuration.ts";
import { sha256 } from "../../packages/cli/src/contracts.ts";
import type { CliError } from "../../packages/cli/src/contracts.ts";
import {
  applyTheme,
  exportTheme,
  importTheme,
  listThemes,
  listProjectThemes,
  loadThemePreset,
  planThemeApply,
  planThemeImport,
  previewTheme,
  validateTheme,
  type ThemePreset,
} from "../../packages/cli/src/theme.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const temporaryDirectories: string[] = [];

function oklch(lightness: number, chroma = 0, hue = 0) {
  return { colorSpace: "oklch", components: [lightness, chroma, hue] };
}

function accessibleDocument(): Readonly<Record<string, unknown>> {
  return {
    $schema: "https://www.designtokens.org/schemas/2025.10/format.json",
    semantic: {
      color: {
        background: {
          $type: "color",
          canvas: { $value: oklch(1) },
          surface: { $value: oklch(0.98) },
        },
        foreground: { $type: "color", primary: { $value: oklch(0) } },
        action: {
          $type: "color",
          background: { $value: oklch(0) },
          foreground: { $value: oklch(1) },
        },
        focus: { $type: "color", ring: { $value: oklch(0) } },
      },
      focus: { width: { $type: "dimension", $value: { value: 2, unit: "px" } } },
      motion: {
        duration: {
          $type: "duration",
          feedback: { $value: { value: 80, unit: "ms" } },
          transition: { $value: { value: 160, unit: "ms" } },
          overlay: { $value: { value: 240, unit: "ms" } },
          deliberate: { $value: { value: 400, unit: "ms" } },
        },
      },
    },
  };
}

function officialPreset(): ThemePreset {
  return {
    id: "light",
    label: "Light",
    origin: "official",
    document: accessibleDocument(),
    source: { kind: "bundled", label: "light" },
  };
}

function customFailingPreset(): ThemePreset {
  const document = structuredClone(accessibleDocument()) as Record<string, unknown> & {
    semantic: {
      color: { foreground: { primary: { $value: unknown } } };
    };
  };
  document.semantic.color.foreground.primary.$value = oklch(1);
  return {
    id: "washed-out",
    label: "Washed out",
    origin: "custom",
    document,
    source: { kind: "local-file", label: "washed-out.tokens.json" },
  };
}

function project() {
  const fixture = createProjectFixture();
  temporaryDirectories.push(fixture.root);
  applyInit({ projectRoot: fixture.root });
  return fixture;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("theme read-only operations", () => {
  it("loads bundled official and project-relative custom presets without writes", () => {
    const fixture = project();
    const official = loadThemePreset(fixture.root, "light");
    expect(official).toMatchObject({
      id: "light",
      origin: "official",
      source: { kind: "bundled" },
    });
    expect(validateTheme(official).tokenCount).toBeGreaterThan(50);

    writeFileSync(
      resolve(fixture.root, "brand.tokens.json"),
      `${JSON.stringify(accessibleDocument(), null, 2)}\n`,
    );
    const custom = loadThemePreset(fixture.root, "brand.tokens.json");
    expect(custom).toMatchObject({
      id: "brand",
      origin: "custom",
      source: { kind: "local-file", label: "brand.tokens.json" },
    });
    expect(listProjectThemes(fixture.root).themes.map(({ id }) => id)).toEqual([
      "dark",
      "enhanced-contrast",
      "forced-colors",
      "light",
    ]);
    expect(existsSync(resolve(fixture.root, ".mergora/themes"))).toBe(false);
  });

  it("lists, previews, and exports deterministically without project writes", () => {
    const preset = officialPreset();
    expect(listThemes([{ id: "brand", label: "Brand", origin: "custom" }])).toMatchObject({
      writePerformed: false,
      themes: [
        { id: "brand" },
        { id: "dark" },
        { id: "enhanced-contrast" },
        { id: "forced-colors" },
        { id: "light" },
      ],
    });

    const preview = previewTheme(preset);
    expect(preview).toEqual(previewTheme(preset));
    expect(preview).toMatchObject({ id: "light", issues: [], writePerformed: false });
    expect(new URL(preview.studioUrl).search).toBe("");
    expect(new URL(preview.studioUrl).hash).toContain("theme=");

    const dtcg = exportTheme(preset, "dtcg");
    const css = exportTheme(preset, "css");
    const tailwind = exportTheme(preset, "tailwind");
    expect(dtgDigest(dtcg.content)).toBe(dtcg.digest);
    expect(css.content).toContain("--mrg-semantic-color-background-canvas: oklch(100% 0 0);");
    expect(tailwind.content).toContain("@theme inline");
    expect([dtcg, css, tailwind].every(({ writePerformed }) => writePerformed === false)).toBe(
      true,
    );
  });
});

function dtgDigest(content: string) {
  return sha256(content);
}

describe("theme apply and import", () => {
  it("fails official accessibility issues closed and never exposes a bypass", () => {
    const fixture = project();
    const failing = customFailingPreset();
    const official: ThemePreset = {
      ...failing,
      origin: "official",
      source: { kind: "bundled", label: "invalid-official" },
    };
    expect(() => planThemeApply({ projectRoot: fixture.root, preset: official })).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "THEME_OFFICIAL_ACCESSIBILITY_BLOCKED" }),
    );
  });

  it("requires exact per-issue custom acknowledgements and commits a digest-bound transaction", () => {
    const fixture = project();
    const preset = customFailingPreset();
    const options = { projectRoot: fixture.root, preset };
    const plan = planThemeApply(options);
    expect(plan).toEqual(planThemeApply(options));
    expect(plan.theme.requiredAcknowledgementIds.length).toBeGreaterThan(0);
    expect(plan.consentRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ flag: expect.stringMatching(/^--acknowledge=/u) }),
      ]),
    );
    expect(() => applyTheme(options, plan.planDigest)).toThrowError(
      expect.objectContaining<Partial<CliError>>({
        code: "THEME_ACCESSIBILITY_ACKNOWLEDGEMENT_REQUIRED",
      }),
    );
    expect(existsSync(resolve(fixture.root, plan.theme.target))).toBe(false);

    const result = applyTheme(
      { ...options, acknowledgedIssueIds: plan.theme.requiredAcknowledgementIds },
      plan.planDigest,
    );
    expect(result.transaction.state).toBe("committed");
    const receipt = JSON.parse(
      readFileSync(resolve(fixture.root, ".mergora/themes/active.json"), "utf8"),
    ) as { acknowledgedAccessibilityIssueIds: readonly string[] };
    expect(receipt.acknowledgedAccessibilityIssueIds).toEqual(
      plan.theme.requiredAcknowledgementIds,
    );
  });

  it("accepts remote bytes only with matching enrollment and artifact pins", () => {
    const fixture = project();
    const document = accessibleDocument();
    const base: ThemePreset = {
      id: "partner",
      label: "Partner",
      origin: "custom",
      document,
      source: { kind: "local-file", label: "partner.tokens.json" },
    };
    const artifactDigest = validateTheme(base).digest;
    const remote: ThemePreset = {
      ...base,
      source: {
        kind: "enrolled-registry",
        registryId: "partner",
        identityDigest: `sha256:${"1".repeat(64)}`,
        release: "1.2.3",
        manifestDigest: `sha256:${"2".repeat(64)}`,
        artifactDigest,
      },
    };
    expect(() => planThemeImport({ projectRoot: fixture.root, preset: remote })).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "THEME_REGISTRY_ENROLLMENT_REQUIRED" }),
    );
    const enrollment = {
      id: "partner",
      identityDigest:
        remote.source.kind === "enrolled-registry" ? remote.source.identityDigest : artifactDigest,
      release: "1.2.3",
      manifestDigest: `sha256:${"2".repeat(64)}` as const,
      artifactDigests: [artifactDigest],
    };
    const options = { projectRoot: fixture.root, preset: remote, enrolledRegistries: [enrollment] };
    const plan = planThemeImport(options);
    expect(plan.registries).toEqual([
      expect.objectContaining({ id: "partner", trust: "enrolled" }),
    ]);
    const result = importTheme(options, plan.planDigest);
    expect(result.transaction.state).toBe("committed");
  });
});
