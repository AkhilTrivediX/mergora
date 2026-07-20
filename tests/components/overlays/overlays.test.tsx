import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { AlertDialog } from "../../../registry/source/components/alert-dialog/index.js";
import {
  hasAccessibleContent as hasAlertDialogAccessibleContent,
  hasAcknowledgementStateConflict,
} from "../../../registry/source/components/alert-dialog/alert-dialog.js";
import { Dialog } from "../../../registry/source/components/dialog/index.js";
import { hasAccessibleContent as hasDialogAccessibleContent } from "../../../registry/source/components/dialog/dialog.js";
import {
  getDialogDismissBehavior,
  shouldDismissNonModalOutsideActivation,
} from "../../../registry/source/components/dialog/model.js";
import {
  Popover,
  resolvePopoverPlacement,
} from "../../../registry/source/components/popover/index.js";
import { hasAccessibleContent as hasPopoverAccessibleContent } from "../../../registry/source/components/popover/popover.js";
import { Sheet } from "../../../registry/source/components/sheet/index.js";
import { resolveSheetProgress } from "../../../registry/source/components/sheet/sheet.js";
import {
  Tooltip,
  resolveTooltipPlacement,
} from "../../../registry/source/components/tooltip/index.js";
import { hasAccessibleContent as hasTooltipAccessibleContent } from "../../../registry/source/components/tooltip/tooltip.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "../../..");
const componentRoot = resolve(repositoryRoot, "registry/source/components");

function readComponent(name: string, file: string): string {
  return readFileSync(resolve(componentRoot, name, file), "utf8");
}

function readJson<Value = Record<string, unknown>>(name: string, file: string): Value {
  return JSON.parse(readComponent(name, file)) as Value;
}

function expectCanonicalFocusSeam(css: string): void {
  expect(css).toMatch(
    /box-shadow:\s*0 0 0 var\(--mrg-component-focus-indicator-width\)\s+var\(--mrg-component-focus-indicator-contrast-background\);/u,
  );
  expect(css).toMatch(
    /outline:\s*var\(--mrg-component-focus-indicator-width\) solid\s+var\(--mrg-component-focus-indicator-color\);/u,
  );
  expect(css).toContain("outline-offset: var(--mrg-component-focus-indicator-offset)");
  expect(css).toMatch(
    /@media \(forced-colors: active\)[\s\S]*box-shadow:\s*none;[\s\S]*outline-color:\s*Highlight;/u,
  );
  expect(css).not.toMatch(
    /box-shadow:\s*0 0 0 var\(--mrg-semantic-border-width-default\)\s+var\(--mrg-component-focus-indicator-contrast-background\)/u,
  );
}

describe("P2 overlay state and placement models", () => {
  it("suppresses null, false, blank, Fragment-only, and empty host enhancement content", () => {
    for (const predicate of [
      hasDialogAccessibleContent,
      hasAlertDialogAccessibleContent,
      hasPopoverAccessibleContent,
      hasTooltipAccessibleContent,
    ]) {
      expect(predicate(null)).toBe(false);
      expect(predicate(false)).toBe(false);
      expect(predicate("   ")).toBe(false);
      expect(predicate(<></>)).toBe(false);
      expect(predicate(<span />)).toBe(false);
      expect(predicate(<span>Context</span>)).toBe(true);
    }
  });

  it("rejects invalid Sheet progress before native progress markup can contain NaN", () => {
    expect(resolveSheetProgress(undefined)).toBeUndefined();
    expect(resolveSheetProgress({ label: " Setup ", value: 2, max: 4 })).toEqual({
      label: "Setup",
      max: 4,
      value: 2,
    });
    expect(() => resolveSheetProgress({ label: " ", value: 1 })).toThrow(/non-empty/u);
    expect(() => resolveSheetProgress({ label: "Setup", value: 1, max: Number.NaN })).toThrow(
      /finite/u,
    );
    expect(() => resolveSheetProgress({ label: "Setup", value: Number.NaN })).toThrow(/finite/u);
    expect(() => resolveSheetProgress({ label: "Setup", value: 5, max: 4 })).toThrow(/between/u);
  });

  it("detects controlled/default acknowledgement conflicts without treating false as absent", () => {
    expect(hasAcknowledgementStateConflict(undefined, undefined)).toBe(false);
    expect(hasAcknowledgementStateConflict(false, undefined)).toBe(false);
    expect(hasAcknowledgementStateConflict(false, false)).toBe(true);
    expect(hasAcknowledgementStateConflict(true, true)).toBe(true);
  });

  it("maps every dialog dismissal policy without an implicit path", () => {
    expect(getDialogDismissBehavior("outside-and-escape")).toEqual({
      allowsEscape: true,
      allowsOutsideInteraction: true,
    });
    expect(getDialogDismissBehavior("escape-only")).toEqual({
      allowsEscape: true,
      allowsOutsideInteraction: false,
    });
    expect(getDialogDismissBehavior("explicit")).toEqual({
      allowsEscape: false,
      allowsOutsideInteraction: false,
    });
  });

  it("limits the non-modal fallback to one unprevented primary outside activation", () => {
    const valid = {
      clickEndedOutside: true,
      defaultPrevented: false,
      isPrimary: true,
      pointerStartedOutside: true,
      sameTargetLineage: true,
      topLayerOwned: false,
    } as const;
    expect(shouldDismissNonModalOutsideActivation(valid)).toBe(true);
    for (const rejected of [
      { ...valid, clickEndedOutside: false },
      { ...valid, defaultPrevented: true },
      { ...valid, isPrimary: false },
      { ...valid, pointerStartedOutside: false },
      { ...valid, sameTargetLineage: false },
      { ...valid, topLayerOwned: true },
    ]) {
      expect(shouldDismissNonModalOutsideActivation(rejected)).toBe(false);
    }
  });

  it("maps logical popover and tooltip placement independently from locale", () => {
    expect(resolvePopoverPlacement("start", "start", "ltr")).toBe("left top");
    expect(resolvePopoverPlacement("start", "start", "rtl")).toBe("right top");
    expect(resolvePopoverPlacement("bottom", "start", "ltr")).toBe("bottom left");
    expect(resolvePopoverPlacement("bottom", "start", "rtl")).toBe("bottom right");
    expect(resolveTooltipPlacement("end", "ltr")).toBe("right");
    expect(resolveTooltipPlacement("end", "rtl")).toBe("left");
  });
});

describe("P2 overlay SSR boundaries", () => {
  it("renders native named triggers but no server portal or document side effect", () => {
    const dialog = renderToStaticMarkup(
      <Dialog.Root defaultOpen>
        <Dialog.Trigger>Open review</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content>
            <Dialog.Title>Review</Dialog.Title>
            <Dialog.Close>Close</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>,
    );
    expect(dialog).toContain("<button");
    expect(dialog).toContain('aria-haspopup="dialog"');
    expect(dialog).toContain('data-slot="dialog-trigger"');
    expect(dialog).not.toContain('role="dialog"');
    expect(dialog).not.toContain("document");

    const alert = renderToStaticMarkup(
      <AlertDialog.Root>
        <AlertDialog.Trigger>Delete snapshot</AlertDialog.Trigger>
        <AlertDialog.Overlay>
          <AlertDialog.Content leastDestructiveRef={{ current: null }}>
            <AlertDialog.Title>Delete?</AlertDialog.Title>
            <AlertDialog.Description>Permanent.</AlertDialog.Description>
            <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action>Delete</AlertDialog.Action>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Root>,
    );
    expect(alert).toContain('data-slot="alert-dialog-trigger"');
    expect(alert).not.toContain('role="alertdialog"');

    const sheet = renderToStaticMarkup(
      <Sheet.Root side="start">
        <Sheet.Trigger>Open panel</Sheet.Trigger>
        <Sheet.Overlay>
          <Sheet.Content>
            <Sheet.Title>Panel</Sheet.Title>
            <Sheet.Close>Close</Sheet.Close>
          </Sheet.Content>
        </Sheet.Overlay>
      </Sheet.Root>,
    );
    expect(sheet).toContain('data-slot="sheet-trigger"');
  });

  it("keeps popover and tooltip portals absent during SSR", () => {
    const popover = renderToStaticMarkup(
      <Popover.Root defaultOpen>
        <Popover.Trigger>Open details</Popover.Trigger>
        <Popover.Content>
          <Popover.Title>Details</Popover.Title>
          <Popover.Close>Close</Popover.Close>
        </Popover.Content>
      </Popover.Root>,
    );
    expect(popover).toContain('data-slot="popover-trigger"');
    expect(popover).not.toContain('data-slot="popover"');

    const tooltip = renderToStaticMarkup(
      <Tooltip.Root defaultOpen>
        <Tooltip.Trigger aria-label="Info">Info</Tooltip.Trigger>
        <Tooltip.Content>Supplemental detail</Tooltip.Content>
      </Tooltip.Root>,
    );
    expect(tooltip).toContain('data-slot="tooltip-trigger"');
    expect(tooltip).not.toContain('role="tooltip"');
  });
});

describe("P2 overlay canonical records", () => {
  it("uses the exact suffixed companion pattern and one preserved Dialog model", () => {
    for (const name of ["alert-dialog", "sheet", "popover", "tooltip"]) {
      const files = readdirSync(resolve(componentRoot, name)).sort();
      expect(files).toEqual(
        [
          "README.md",
          "index.ts",
          `${name}-css.d.ts`,
          `${name}.anatomy.json`,
          `${name}.api.json`,
          `${name}.contract.json`,
          `${name}.css`,
          `${name}.metadata.json`,
          `${name}.source.json`,
          `${name}.status.json`,
          `${name}.stories.json`,
          `${name}.tsx`,
        ].sort(),
      );
    }
    expect(readdirSync(resolve(componentRoot, "dialog")).sort()).toEqual(
      [
        "README.md",
        "dialog-css.d.ts",
        "dialog.anatomy.json",
        "dialog.api.json",
        "dialog.contract.json",
        "dialog.css",
        "dialog.metadata.json",
        "dialog.source.json",
        "dialog.status.json",
        "dialog.stories.json",
        "dialog.tsx",
        "index.ts",
        "model.ts",
      ].sort(),
    );
  });

  it("keeps every record honest and declares direct cross-item dependencies", () => {
    const expectedDependencies = {
      "alert-dialog": ["dialog"],
      dialog: ["layer-manager", "provider"],
      popover: ["layer-manager", "provider"],
      sheet: ["dialog"],
      tooltip: ["layer-manager", "provider"],
    } as const;
    for (const [name, dependencies] of Object.entries(expectedDependencies)) {
      expect(readJson(name, `${name}.source.json`)).toMatchObject({
        id: name,
        itemDependencies: dependencies,
      });
      expect(readJson(name, `${name}.status.json`)).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        recordedEvidence: [],
        releaseStatus: "unreleased",
      });
      expect(readJson(name, `${name}.contract.json`)).toMatchObject({
        contractStatus: "source-present-evidence-incomplete",
        itemId: name,
        riskClass: 2,
      });
    }
  });

  it("validates metadata, exact namespace API kinds, and every required story state", () => {
    for (const name of ["dialog", "alert-dialog", "sheet", "popover", "tooltip", "layer-manager"]) {
      expect(
        validateSchemaDocument(
          "component-metadata",
          readJson<Record<string, unknown>>(name, `${name}.metadata.json`),
        ),
        name,
      ).toMatchObject({ errors: [], ok: true });
      expect(
        validateStoryStateMatrix(readJson<StoryStateMatrix>(name, `${name}.stories.json`)),
        name,
      ).toMatchObject({ issues: [], ok: true });
    }

    for (const name of ["dialog", "alert-dialog", "sheet", "popover", "tooltip"]) {
      const api = readJson<{ exports: readonly { kind: string; name: string }[] }>(
        name,
        `${name}.api.json`,
      );
      expect(
        api.exports.find(
          (entry) =>
            entry.name ===
            name
              .split("-")
              .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
              .join(""),
        ),
        name,
      ).toMatchObject({ kind: "namespace" });
    }
  });

  it("documents every built-in production string as a provider message key", () => {
    expect(readJson("dialog", "dialog.contract.json").messageKeys).toEqual([
      expect.objectContaining({ fallback: "Close dialog", key: "dialog.close" }),
    ]);
    expect(readJson("alert-dialog", "alert-dialog.contract.json").messageKeys).toEqual([
      expect.objectContaining({ fallback: "Cancel", key: "alertDialog.cancel" }),
    ]);
    expect(readJson("sheet", "sheet.contract.json").messageKeys).toEqual([
      expect.objectContaining({ fallback: "Close panel", key: "sheet.close" }),
    ]);
    expect(readJson("popover", "popover.contract.json").messageKeys).toEqual([
      expect.objectContaining({ fallback: "Close popover", key: "popover.close" }),
    ]);
    expect(readJson("tooltip", "tooltip.contract.json").messageKeys).toEqual([]);
  });

  it("uses only React Aria and native behavior with logical, preference-safe CSS", () => {
    const source = ["dialog", "alert-dialog", "sheet", "popover", "tooltip"]
      .map((name) => readComponent(name, `${name}.tsx`))
      .join("\n");
    expect(source).toMatch(/react-aria-components/u);
    expect(source).not.toMatch(/@radix-ui|@base-ui|headlessui|zag-js|@ark-ui/u);

    for (const name of ["dialog", "alert-dialog", "sheet", "popover", "tooltip"]) {
      const css = readComponent(name, `${name}.css`);
      expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/iu);
      expect(css).toContain("@media (forced-colors: active)");
      if (name !== "alert-dialog") expect(css).toContain("prefers-reduced-motion: reduce");
      expect(css).not.toMatch(/^\s*(?:(?:margin|padding|inset)-(?:left|right)|(?:left|right):)/mu);
    }
    expect(readComponent("sheet", "sheet.css")).toContain("env(safe-area-inset-top, 0px)");
    expect(readComponent("popover", "popover.css")).toContain("var(--available-height");
  });

  it("uses the canonical two-layer focus seam across every overlay family boundary", () => {
    for (const name of ["dialog", "alert-dialog", "popover", "tooltip"]) {
      expectCanonicalFocusSeam(readComponent(name, `${name}.css`));
    }
  });
});
