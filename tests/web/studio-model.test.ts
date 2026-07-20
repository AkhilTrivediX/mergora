import { describe, expect, it } from "vitest";

import {
  canonicalStudioState,
  changedStudioTokens,
  clearStudioLocalData,
  DEFAULT_STUDIO_STATE,
  MAX_STUDIO_IMPORT_BYTES,
  migrateStudioState,
  parseStudioImport,
  parseStudioShareFragment,
  STUDIO_STORAGE_KEYS,
  studioChecksum,
  studioExportValue,
  studioGuardrails,
  studioShareFragment,
  validateStudioState,
  type StudioState,
} from "../../apps/web/src/app/studio/studio-model.ts";

interface MutableStudioEnvelope extends Record<string, unknown> {
  checksum: string;
  context: Record<string, unknown>;
  exportSchemaVersion: number;
}

interface MutableDtcgExport extends Record<string, unknown> {
  $extensions: { "org.mergora.studio": MutableStudioEnvelope };
  semantic: {
    border: { width: { $value: { unit: string; value: number } } };
    color: {
      action: {
        background: { $value: unknown };
        foreground: { $value: unknown };
      };
    };
    focus: { indicatorWidth: { $value: { unit: string; value: number } } };
  };
}

const everyDimensionState: StudioState = {
  acknowledgedWarnings: true,
  actionBackground: "#065f46",
  actionForeground: "#f0fdf4",
  borderWidth: 2,
  controlHeight: 52,
  density: "touch",
  direction: "rtl",
  focusColor: "#c4b5fd",
  fontScale: 125,
  forcedColorsSimulation: true,
  locale: "ar-EG",
  motion: "reduced",
  motionDuration: 40,
  previewState: "loading",
  radius: 12,
  spacingScale: 110,
  surface: "#111815",
  text: "#f5f7f5",
  theme: "dark",
  viewport: "narrow",
};

const exportKinds = ["css", "design-tool", "dtcg", "tailwind", "typescript"] as const;

function jsonExport(kind: "design-tool" | "dtcg", state = everyDimensionState) {
  return JSON.parse(studioExportValue(kind, state)) as MutableDtcgExport;
}

describe("Studio v2 state and guardrails", () => {
  it("accepts only complete bounded semantic state", () => {
    expect(validateStudioState(DEFAULT_STUDIO_STATE)).toEqual(DEFAULT_STUDIO_STATE);
    expect(validateStudioState({ ...DEFAULT_STUDIO_STATE, radius: 17 })).toBeNull();
    expect(validateStudioState({ ...DEFAULT_STUDIO_STATE, surface: "transparent" })).toBeNull();
    expect(validateStudioState({ ...DEFAULT_STUDIO_STATE, unknown: true })).toBeNull();
  });

  it("round-trips checked v2 fragments and safely migrates exact v1 state", () => {
    const edited = { ...DEFAULT_STUDIO_STATE, density: "touch" as const, radius: 12 };
    const fragment = studioShareFragment(edited)!;
    expect(fragment).toMatch(/^#studio\.v2\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/u);
    expect(parseStudioShareFragment(fragment)).toEqual(edited);
    const tampered = `${fragment.slice(0, -1)}${fragment.endsWith("0") ? "1" : "0"}`;
    expect(parseStudioShareFragment(tampered)).toBeNull();

    const legacy = JSON.stringify({
      density: "compact",
      motion: "reduced",
      radius: 6,
      schemaVersion: 1,
      theme: "dark",
    });
    const payload = btoa(legacy).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    expect(parseStudioShareFragment(`#v1.${payload}.${studioChecksum(legacy)}`)).toEqual({
      ...DEFAULT_STUDIO_STATE,
      density: "compact",
      motion: "reduced",
      radius: 6,
      theme: "dark",
    });
    expect(migrateStudioState({ ...JSON.parse(legacy), injected: true })).toBeNull();
  });

  it("blocks invalid contrast and reports relevant geometry and motion recovery", () => {
    expect(studioGuardrails(DEFAULT_STUDIO_STATE)).toEqual([]);
    const findings = studioGuardrails({
      ...DEFAULT_STUDIO_STATE,
      actionBackground: "#ffffff",
      controlHeight: 24,
      density: "touch",
      fontScale: 150,
      motion: "reduced",
      radius: 16,
      spacingScale: 150,
    });
    expect(findings.map(({ id, severity }) => [id, severity])).toEqual([
      ["action-contrast", "error"],
      ["density-target", "warning"],
      ["control-content-fit", "warning"],
      ["control-radius-fit", "warning"],
      ["reduced-motion-duration", "warning"],
      ["prepared-matrix-clipping", "warning"],
    ]);
  });

  it("round-trips every editable state dimension through every advertised format", () => {
    expect(changedStudioTokens(everyDimensionState)).toHaveLength(20);
    expect(canonicalStudioState(everyDimensionState)).toBe(
      canonicalStudioState(everyDimensionState),
    );

    for (const kind of exportKinds) {
      const exported = studioExportValue(kind, everyDimensionState);
      expect(studioExportValue(kind, everyDimensionState)).toBe(exported);
      expect(parseStudioImport(exported)).toEqual({
        format: kind,
        ok: true,
        state: everyDimensionState,
      });
    }
  });

  it("accepts harmless JSON formatting and key-order changes", () => {
    const reordered = jsonExport("design-tool");
    const context = reordered.$extensions["org.mergora.studio"].context;
    reordered.$extensions["org.mergora.studio"].context = Object.fromEntries(
      Object.entries(context).reverse(),
    );
    expect(parseStudioImport(`\n${JSON.stringify(reordered)}\n`)).toEqual({
      format: "design-tool",
      ok: true,
      state: everyDimensionState,
    });
  });

  it("emits versioned checksummed context metadata and the complete token projection", () => {
    const dtcg = jsonExport("dtcg");
    expect(dtcg.$schema).toBe("https://www.designtokens.org/schemas/2025.10/format.json");
    expect(dtcg.$extensions["org.mergora.studio"]).toMatchObject({
      changedTokens: expect.arrayContaining([
        "borderWidth",
        "controlHeight",
        "density",
        "fontScale",
        "motionDuration",
        "spacingScale",
        "theme",
      ]),
      checksum: expect.stringMatching(/^[0-9a-f]{8}$/u),
      context: {
        density: "touch",
        direction: "rtl",
        forcedColorsSimulation: true,
        locale: "ar-EG",
        motion: "reduced",
        previewState: "loading",
        theme: "dark",
        viewport: "narrow",
      },
      exportSchemaVersion: 1,
      format: "dtcg",
      kind: "org.mergora.studio-preset",
      state: everyDimensionState,
      stateSchemaVersion: 2,
    });
    expect(dtcg.semantic).toMatchObject({
      border: { width: { $value: { unit: "px", value: 2 } } },
      control: { height: { $value: { unit: "px", value: 52 } } },
      focus: { indicatorWidth: { $value: { unit: "px", value: 3 } } },
      motion: { duration: { $value: { unit: "ms", value: 40 } } },
      radius: { surface: { $value: { unit: "px", value: 12 } } },
      scale: { font: { $value: 1.25 }, spacing: { $value: 1.1 } },
    });

    const css = studioExportValue("css", everyDimensionState);
    expect(css).toContain("--mrg-semantic-border-width: 2px");
    expect(css).toContain("--mrg-semantic-control-height: 52px");
    expect(css).toContain("--mrg-semantic-font-scale: 1.25");
    expect(css).toContain("--mrg-studio-context-density: touch");
    expect(css).toContain('--mrg-studio-context-locale: "ar-EG"');
  });
});

describe("Studio local import integrity", () => {
  it("rejects empty, oversized, unsupported, malformed, and unknown-schema input", () => {
    expect(parseStudioImport(" ")).toMatchObject({ code: "empty", ok: false });
    expect(parseStudioImport("x".repeat(MAX_STUDIO_IMPORT_BYTES + 1))).toMatchObject({
      code: "oversized",
      ok: false,
    });
    expect(parseStudioImport('{"tokens":{}}')).toMatchObject({
      code: "unsupported-format",
      ok: false,
    });
    expect(parseStudioImport('{"$extensions":')).toMatchObject({
      code: "malformed",
      ok: false,
    });

    const future = jsonExport("dtcg");
    future.$extensions["org.mergora.studio"].exportSchemaVersion = 99;
    expect(parseStudioImport(JSON.stringify(future))).toMatchObject({
      code: "unsupported-version",
      ok: false,
    });

    const unknown = jsonExport("dtcg");
    unknown.$extensions["org.mergora.studio"].unexpected = true;
    expect(parseStudioImport(JSON.stringify(unknown))).toMatchObject({
      code: "invalid-envelope",
      ok: false,
    });
  });

  it("rejects checksum, context, and projected-token disagreement", () => {
    const checksum = jsonExport("dtcg");
    checksum.$extensions["org.mergora.studio"].checksum = "00000000";
    expect(parseStudioImport(JSON.stringify(checksum))).toMatchObject({
      code: "checksum",
      ok: false,
    });

    const context = jsonExport("dtcg");
    context.$extensions["org.mergora.studio"].context.locale = "de-DE";
    expect(parseStudioImport(JSON.stringify(context))).toMatchObject({
      code: "invalid-envelope",
      ok: false,
    });

    const token = jsonExport("dtcg");
    token.semantic.color.action.background.$value = {
      alpha: 1,
      colorSpace: "srgb",
      components: [0, 0, 0],
    };
    expect(parseStudioImport(JSON.stringify(token))).toMatchObject({
      code: "artifact-mismatch",
      ok: false,
    });
  });

  it("detects unresolved and circular DTCG aliases before state application", () => {
    const unresolved = jsonExport("dtcg");
    unresolved.semantic.color.action.background.$value = "{semantic.color.missing}";
    expect(parseStudioImport(JSON.stringify(unresolved))).toMatchObject({
      code: "unresolved-alias",
      ok: false,
    });

    const circular = jsonExport("dtcg");
    circular.semantic.color.action.background.$value = "{semantic.color.action.foreground}";
    circular.semantic.color.action.foreground.$value = "{semantic.color.action.background}";
    expect(parseStudioImport(JSON.stringify(circular))).toMatchObject({
      code: "circular-alias",
      ok: false,
    });
  });

  it("rejects invalid non-color dimensions and insufficient focus area", () => {
    const dimension = jsonExport("design-tool");
    dimension.semantic.border.width.$value.unit = "rem";
    expect(parseStudioImport(JSON.stringify(dimension))).toMatchObject({
      code: "invalid-token",
      ok: false,
    });

    const focusArea = jsonExport("dtcg");
    focusArea.semantic.focus.indicatorWidth.$value.value = 1;
    expect(parseStudioImport(JSON.stringify(focusArea))).toMatchObject({
      code: "focus-area",
      ok: false,
    });
  });

  it("never evaluates pasted TypeScript and rejects appended content atomically", () => {
    const key = "__mergoraStudioImportExecuted";
    Reflect.deleteProperty(globalThis, key);
    const source = `${studioExportValue("typescript", everyDimensionState)}\n;globalThis.${key}=true;`;
    expect(parseStudioImport(source)).toMatchObject({ code: "artifact-mismatch", ok: false });
    expect(Reflect.get(globalThis, key)).toBeUndefined();
  });

  it("clears only the documented Studio storage keys", () => {
    const removed: string[] = [];
    clearStudioLocalData({ removeItem: (key) => removed.push(key) });
    expect(removed).toEqual(STUDIO_STORAGE_KEYS);
    expect(removed).not.toContain("mergora.site.theme.v1");
  });
});
