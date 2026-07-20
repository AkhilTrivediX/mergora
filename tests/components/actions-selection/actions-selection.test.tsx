import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import {
  ActionMenu,
  resolveMenuIndex,
} from "../../../registry/source/components/action-menu/action-menu.tsx";
import { Button } from "../../../registry/source/components/button/button.tsx";
import {
  ButtonGroup,
  markButtonGroupAction,
  resolveToolbarIndex,
} from "../../../registry/source/components/button-group/button-group.tsx";
import {
  CopyButton,
  writeClipboardText,
} from "../../../registry/source/components/copy-button/copy-button.tsx";
import { IconButton } from "../../../registry/source/components/icon-button/icon-button.tsx";
import { Link } from "../../../registry/source/components/link/link.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import {
  SegmentedControl,
  SegmentedControlItem,
  resolveSegmentedIndex,
} from "../../../registry/source/components/segmented-control/segmented-control.tsx";
import { Toggle } from "../../../registry/source/components/toggle/toggle.tsx";
import {
  ToggleGroup,
  ToggleGroupItem,
  resolveToggleGroupIndex,
} from "../../../registry/source/components/toggle-group/toggle-group.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = [
  "button",
  "icon-button",
  "button-group",
  "copy-button",
  "toggle",
  "toggle-group",
  "segmented-control",
  "link",
  "action-menu",
] as const;
const newItemIds = itemIds.filter((itemId) => itemId !== "button");
const recordSuffixes = [
  "anatomy.json",
  "api.json",
  "contract.json",
  "metadata.json",
  "source.json",
  "status.json",
  "stories.json",
] as const;

const expectedApiExports = {
  "action-menu": [
    { kind: "component", name: "ActionMenu" },
    { kind: "type", name: "ActionMenuProps" },
    { kind: "type", name: "ActionMenuItem" },
    { kind: "type", name: "ActionMenuDefaultItem" },
    { kind: "type", name: "ActionMenuDestructiveItem" },
    { kind: "type", name: "ActionMenuPlacement" },
    { kind: "function", name: "resolveMenuIndex" },
  ],
  button: [
    { kind: "component", name: "Button" },
    { kind: "type", name: "ButtonOwnProps" },
    { kind: "type", name: "ButtonProps" },
    { kind: "type", name: "ButtonSize" },
    { kind: "type", name: "ButtonVariant" },
  ],
  "button-group": [
    { kind: "component", name: "ButtonGroup" },
    { kind: "type", name: "ButtonGroupProps" },
    { kind: "type", name: "ButtonGroupMode" },
    { kind: "type", name: "ButtonGroupOrientation" },
    { kind: "function", name: "markButtonGroupAction" },
    { kind: "function", name: "resolveToolbarIndex" },
  ],
  "copy-button": [
    { kind: "component", name: "CopyButton" },
    { kind: "type", name: "CopyButtonProps" },
    { kind: "type", name: "CopyButtonStatus" },
    { kind: "type", name: "ClipboardEnvironment" },
    { kind: "function", name: "writeClipboardText" },
  ],
  "icon-button": [
    { kind: "component", name: "IconButton" },
    { kind: "type", name: "IconButtonProps" },
    { kind: "type", name: "IconButtonSize" },
  ],
  link: [
    { kind: "component", name: "Link" },
    { kind: "type", name: "LinkProps" },
    { kind: "type", name: "LinkCurrent" },
  ],
  "segmented-control": [
    { kind: "component", name: "SegmentedControl" },
    { kind: "component", name: "SegmentedControlItem" },
    { kind: "namespace", name: "SegmentedControlParts" },
    { kind: "type", name: "SegmentedControlProps" },
    { kind: "type", name: "SegmentedControlItemProps" },
    { kind: "function", name: "resolveSegmentedIndex" },
  ],
  toggle: [
    { kind: "component", name: "Toggle" },
    { kind: "type", name: "ToggleProps" },
  ],
  "toggle-group": [
    { kind: "component", name: "ToggleGroup" },
    { kind: "component", name: "ToggleGroupItem" },
    { kind: "namespace", name: "ToggleGroupParts" },
    { kind: "type", name: "ToggleGroupProps" },
    { kind: "type", name: "ToggleGroupSingleProps" },
    { kind: "type", name: "ToggleGroupMultipleProps" },
    { kind: "type", name: "ToggleGroupItemProps" },
    { kind: "type", name: "ToggleGroupOrientation" },
    { kind: "function", name: "resolveToggleGroupIndex" },
  ],
} satisfies Record<(typeof itemIds)[number], readonly { kind: string; name: string }[]>;

const expectedControlledState = {
  "action-menu": ["open"],
  button: [],
  "button-group": [],
  "copy-button": [],
  "icon-button": [],
  link: [],
  "segmented-control": ["value"],
  toggle: ["pressed"],
  "toggle-group": ["value"],
} satisfies Record<(typeof itemIds)[number], readonly string[]>;

function readItem(itemId: string, filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: string, filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

describe("P2 actions and selection records", () => {
  it("ships the complete nine-item source batch with every canonical companion", () => {
    for (const itemId of itemIds) {
      const files = new Set(readdirSync(resolve(componentsRoot, itemId)));
      for (const suffix of recordSuffixes) expect(files).toContain(`${itemId}.${suffix}`);
      expect(files).toContain(`${itemId}.tsx`);
      expect(files).toContain(`${itemId}.css`);
      expect(files).toContain(`${itemId}-css.d.ts`);
      expect(files).toContain("index.ts");
      expect(files).toContain("README.md");
    }
  });

  it("keeps every new source manifest at exactly five keys and declares cross-item imports", () => {
    const expectedDependencies = {
      "action-menu": ["direction", "layer-manager", "provider"],
      "button-group": ["direction"],
      "copy-button": ["button", "provider"],
      "icon-button": ["button"],
      link: [],
      "segmented-control": ["direction"],
      toggle: ["button"],
      "toggle-group": ["direction"],
    } satisfies Record<(typeof newItemIds)[number], readonly string[]>;

    for (const itemId of newItemIds) {
      const source = readJson<Record<string, unknown>>(itemId, `${itemId}.source.json`);
      expect(Object.keys(source).sort(), itemId).toEqual([
        "declaredImports",
        "entryPath",
        "id",
        "itemDependencies",
        "outputRole",
      ]);
      expect(source).toMatchObject({
        entryPath: `registry/source/components/${itemId}/${itemId}.tsx`,
        id: itemId,
        itemDependencies: expectedDependencies[itemId],
        outputRole: "component",
      });
    }
  });

  it("records exact runtime/type export kinds and exact controlled state names", () => {
    for (const itemId of itemIds) {
      const api = readJson<{
        controlledState: readonly string[];
        exports: readonly { kind: string; name: string }[];
      }>(itemId, `${itemId}.api.json`);
      expect(api.exports, itemId).toEqual(expectedApiExports[itemId]);
      expect(api.controlledState, itemId).toEqual(expectedControlledState[itemId]);
      expect(readItem(itemId, `${itemId}.api.json`), itemId).not.toContain("value-or-open");
    }
  });

  it("validates metadata and the complete required story-state policy", () => {
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

  it("makes no Stable, release, conformance, or recorded-evidence claim", () => {
    for (const itemId of itemIds) {
      const records = recordSuffixes
        .map((suffix) => readItem(itemId, `${itemId}.${suffix}`))
        .join("\n");
      expect(records).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/iu);
      expect(records).not.toMatch(/"recordedEvidence"\s*:\s*\[[^\]]+\]/u);
      const status = readJson<Record<string, unknown>>(itemId, `${itemId}.status.json`);
      expect(status).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        releaseStatus: "unreleased",
      });
      if (itemId !== "button") {
        expect(status).toMatchObject({ implementationStatus: "source-present-unreleased" });
        expect((status.promotionDelta as unknown[]).length).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("uses semantic tokens, logical edges, and no literal color values", () => {
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
      for (const reference of [...css.matchAll(/var\((--mrg-[a-z0-9-]+)/gu)].map(
        (match) => match[1],
      )) {
        expect(
          tokenDeclarations.has(reference) || localDeclarations.has(reference),
          `${itemId}: ${reference}`,
        ).toBe(true);
      }
      expect(css).not.toMatch(/^\s*(?:margin|padding|inset|border)-(?:left|right)\s*:/mu);
      expect(css).not.toMatch(/#[0-9a-f]{3,8}|(?:oklch|rgb|hsl)\(/iu);
      expect(css).not.toMatch(/repeating-linear-gradient|background-clip\s*:\s*text/iu);
    }
  });
});

describe("P2 actions and selection state engines", () => {
  it("resolves LTR, RTL, vertical, Home, and End toolbar movement", () => {
    expect(
      resolveToolbarIndex({
        current: 0,
        direction: "ltr",
        itemCount: 3,
        key: "ArrowRight",
        orientation: "horizontal",
      }),
    ).toBe(1);
    expect(
      resolveToolbarIndex({
        current: 0,
        direction: "rtl",
        itemCount: 3,
        key: "ArrowRight",
        orientation: "horizontal",
      }),
    ).toBe(2);
    expect(
      resolveToolbarIndex({
        current: 1,
        direction: "ltr",
        itemCount: 3,
        key: "ArrowUp",
        orientation: "vertical",
      }),
    ).toBe(0);
    expect(
      resolveToolbarIndex({
        current: 1,
        direction: "ltr",
        itemCount: 3,
        key: "Home",
        orientation: "horizontal",
      }),
    ).toBe(0);
    expect(
      resolveToolbarIndex({
        current: 1,
        direction: "ltr",
        itemCount: 3,
        key: "End",
        orientation: "horizontal",
      }),
    ).toBe(2);
  });

  it("uses the same spatial model for toggle-group focus without selecting", () => {
    expect(
      resolveToggleGroupIndex({
        current: 0,
        direction: "ltr",
        itemCount: 2,
        key: "ArrowLeft",
        orientation: "horizontal",
      }),
    ).toBe(1);
    expect(
      resolveToggleGroupIndex({
        current: 0,
        direction: "rtl",
        itemCount: 2,
        key: "ArrowLeft",
        orientation: "horizontal",
      }),
    ).toBe(1);
    expect(
      resolveToggleGroupIndex({
        current: 0,
        direction: "rtl",
        itemCount: 2,
        key: "ArrowRight",
        orientation: "horizontal",
      }),
    ).toBe(1);
    expect(
      resolveToggleGroupIndex({
        current: 0,
        direction: "ltr",
        itemCount: 2,
        key: "Space",
        orientation: "horizontal",
      }),
    ).toBeNull();
  });

  it("resolves exclusive segmented selection and menu navigation deterministically", () => {
    expect(
      resolveSegmentedIndex({ current: 0, direction: "ltr", itemCount: 3, key: "ArrowRight" }),
    ).toBe(1);
    expect(
      resolveSegmentedIndex({ current: 0, direction: "rtl", itemCount: 3, key: "ArrowRight" }),
    ).toBe(2);
    expect(resolveSegmentedIndex({ current: 1, direction: "ltr", itemCount: 3, key: "Home" })).toBe(
      0,
    );
    expect(resolveMenuIndex({ current: 0, itemCount: 3, key: "ArrowUp" })).toBe(2);
    expect(resolveMenuIndex({ current: 1, itemCount: 3, key: "End" })).toBe(2);
    expect(resolveMenuIndex({ current: 1, itemCount: 3, key: "ArrowLeft" })).toBeNull();
  });

  it("uses the Clipboard API when available and surfaces its rejection", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    await expect(writeClipboardText("source", { clipboard: { writeText } })).resolves.toBe(
      "clipboard",
    );
    expect(writeText).toHaveBeenCalledWith("source");
    await expect(
      writeClipboardText("source", {
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error("permission denied")) },
      }),
    ).rejects.toThrow("permission denied");
  });

  it("fails explicitly when neither clipboard path is available", async () => {
    await expect(writeClipboardText("source", {})).rejects.toThrow("unavailable");
  });

  it("removes the legacy clipboard path when fallback is disabled", async () => {
    await expect(writeClipboardText("source", {}, false)).rejects.toThrow("fallback is disabled");
  });

  it("always removes the fallback textarea when execCommand throws", async () => {
    const remove = vi.fn();
    const textarea = {
      remove,
      select: vi.fn(),
      setAttribute: vi.fn(),
      style: { opacity: "", position: "" },
      value: "",
    };
    const fallbackDocument = {
      body: { append: vi.fn() },
      createElement: vi.fn(() => textarea),
      execCommand: vi.fn(() => {
        throw new Error("fallback blocked");
      }),
    } as unknown as Document;
    await expect(writeClipboardText("source", { document: fallbackDocument })).rejects.toThrow(
      "fallback blocked",
    );
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe("P2 actions and selection server semantics", () => {
  it("preserves the P1 Button API and native pending distinction", () => {
    const markup = renderToStaticMarkup(
      <Button pending pendingLabel="Saving">
        Save
      </Button>,
    );
    expect(markup).toMatch(/^<button/u);
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toContain(" disabled");
    expect(markup).toContain("Saving");
  });

  it("renders named native icon, copy, toggle, group, and link controls", () => {
    const markup = renderToStaticMarkup(
      <div>
        <IconButton label="Add evidence">
          <span aria-hidden="true">+</span>
        </IconButton>
        <CopyButton text="source" />
        <Toggle defaultPressed>Pin evidence</Toggle>
        <ButtonGroup label="Actions">
          <Button>Save</Button>
        </ButtonGroup>
        <Link external href="https://example.com">
          Reference
        </Link>
      </div>,
    );
    expect(markup).toContain('data-slot="icon-button"');
    expect(markup).toContain('aria-label="Add evidence"');
    expect(markup).toContain('data-slot="copy-button"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('role="group"');
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).not.toContain('aria-disabled="true"');
  });

  it("resolves copy status text through stable provider message keys", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider messages={{ "copyButton.copy": "Quelltext kopieren" }}>
        <CopyButton text="source" />
      </MergoraProvider>,
    );
    expect(markup).toContain("Quelltext kopieren");
    expect(markup).not.toContain(">Copy<");
  });

  it("hardens every target-blank link while preserving caller rel tokens", () => {
    const markup = renderToStaticMarkup(
      <Link href="https://example.com" rel="author" target="_blank">
        Reference
      </Link>,
    );
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="author noopener noreferrer"');
  });

  it("keeps pending Toggle label-in-name parity for both explicit naming paths", () => {
    const directName = renderToStaticMarkup(
      <Toggle aria-label="Automatic updates" pending pendingLabel="Updating">
        Updates
      </Toggle>,
    );
    const referencedName = renderToStaticMarkup(
      <Toggle aria-labelledby="toggle-label" pending pendingLabel="Updating">
        Updates
      </Toggle>,
    );
    expect(directName).toContain('aria-label="Updating"');
    expect(directName).toContain(">Updating</span>");
    expect(referencedName).not.toContain("aria-labelledby");
    expect(referencedName).toContain(">Updating</span>");
  });

  it("renders exactly one initial toolbar tab stop and leaves separators unmanaged", () => {
    const initial = renderToStaticMarkup(
      <ButtonGroup label="Editor" mode="toolbar">
        <Button>Undo</Button>
        <span aria-orientation="vertical" role="separator" />
        <Button>Redo</Button>
        <Button disabled>Publish</Button>
      </ButtonGroup>,
    );
    const afterRemoval = renderToStaticMarkup(
      <ButtonGroup label="Editor" mode="toolbar">
        <Button disabled>Redo unavailable</Button>
        <Button>Compare</Button>
      </ButtonGroup>,
    );
    expect(initial.match(/tabindex="0"/gu)).toHaveLength(1);
    expect(initial.match(/tabindex="-1"/gu)).toHaveLength(2);
    const separator = initial.match(/<span[^>]*role="separator"[^>]*>/u)?.[0];
    expect(separator).toBeDefined();
    expect(separator).not.toContain("tabindex");
    expect(afterRemoval.match(/tabindex="0"/gu)).toHaveLength(1);
    expect(afterRemoval).toMatch(/disabled=""[^>]*tabindex="-1"|tabindex="-1"[^>]*disabled=""/u);
  });

  it("makes unsupported custom toolbar action subtrees inert with a development diagnostic", () => {
    function MultipleActions() {
      return (
        <span>
          <button type="button">First nested action</button>
          <button type="button">Second nested action</button>
        </span>
      );
    }
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const markup = renderToStaticMarkup(
      <ButtonGroup label="Editor" mode="toolbar">
        <Button>Managed action</Button>
        <MultipleActions />
      </ButtonGroup>,
    );
    expect(markup.match(/tabindex="0"/gu)).toHaveLength(1);
    expect(markup).toContain('data-slot="button-group-unmanaged" inert=""');
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("not one concrete"));
    warning.mockRestore();
  });

  it("opts a custom one-root router action into the toolbar contract", () => {
    const RouterAction = markButtonGroupAction(function RouterAction(
      props: React.AnchorHTMLAttributes<HTMLAnchorElement>,
    ) {
      return <a {...props} />;
    });
    const markup = renderToStaticMarkup(
      <ButtonGroup label="Editor" mode="toolbar">
        <RouterAction href="/evidence">Router evidence</RouterAction>
        <Button>Inspect</Button>
      </ButtonGroup>,
    );
    expect(markup).toContain('href="/evidence"');
    expect(markup).toContain('data-mrg-toolbar-action="true"');
    expect(markup.match(/tabindex="0"/gu)).toHaveLength(1);
    expect(markup.match(/tabindex="-1"/gu)).toHaveLength(1);
  });

  it("renders pressed-button and native-radio selection contracts", () => {
    const markup = renderToStaticMarkup(
      <div>
        <ToggleGroup defaultValue="preview" label="View" type="single">
          <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
          <ToggleGroupItem disabled value="release">
            Release
          </ToggleGroupItem>
        </ToggleGroup>
        <SegmentedControl defaultValue="source" label="Distribution">
          <SegmentedControlItem value="source">Source</SegmentedControlItem>
          <SegmentedControlItem value="package">Package</SegmentedControlItem>
        </SegmentedControl>
      </div>,
    );
    expect(markup).toContain('data-selection-mode="single"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("<fieldset");
    expect(markup).toContain("<legend");
    expect(markup).toContain('type="radio"');
    expect(markup).toContain('checked=""');
  });

  it("renders optional workbench context only when each enhancement is enabled", () => {
    const basic = renderToStaticMarkup(
      <div>
        <ButtonGroup keyboardHint="Arrow keys move focus" label="Actions">
          <Button>Save</Button>
        </ButtonGroup>
        <Link external externalContext={false} href="https://example.com">
          Reference
        </Link>
        <ToggleGroup defaultValue="preview" label="View" type="single">
          <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
        </ToggleGroup>
        <SegmentedControl defaultValue="source" label="Mode">
          <SegmentedControlItem value="source">Source</SegmentedControlItem>
        </SegmentedControl>
      </div>,
    );
    expect(basic).not.toContain("button-group-keyboard-hint");
    expect(basic).not.toContain("link-external-context");
    expect(basic).not.toContain("toggle-group-summary");
    expect(basic).not.toContain("segmented-control-summary");

    const enhanced = renderToStaticMarkup(
      <div>
        <ButtonGroup keyboardHint="Arrow keys move focus" label="Actions" mode="toolbar">
          <Button>Save</Button>
        </ButtonGroup>
        <Link external externalContext="New tab" href="https://example.com">
          Reference
        </Link>
        <ToggleGroup
          defaultValue="preview"
          label="View"
          renderSelectionSummary={(values) => `Selected: ${values.join(", ")}`}
          type="single"
        >
          <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
        </ToggleGroup>
        <SegmentedControl
          defaultValue="source"
          label="Mode"
          renderSelectionSummary={(value) => `Selected: ${value}`}
          required
        >
          <SegmentedControlItem value="source">Source</SegmentedControlItem>
        </SegmentedControl>
      </div>,
    );
    expect(enhanced).toContain('data-slot="button-group-keyboard-hint"');
    expect(enhanced).toContain('aria-describedby="mrg-button-group-');
    expect(enhanced).toContain('data-slot="link-external-context">New tab');
    expect(enhanced).toContain('data-slot="toggle-group-summary"');
    expect(enhanced).toContain('data-slot="segmented-control-summary"');
    expect(enhanced).toContain('required=""');
  });

  it("renders exactly one ToggleGroup tab stop in multi-select and skips selected disabled items", () => {
    const markup = renderToStaticMarkup(
      <ToggleGroup defaultValue={["alpha", "locked", "beta"]} label="Layers" type="multiple">
        <ToggleGroupItem value="alpha">Alpha</ToggleGroupItem>
        <ToggleGroupItem disabled value="locked">
          Locked
        </ToggleGroupItem>
        <ToggleGroupItem value="beta">Beta</ToggleGroupItem>
      </ToggleGroup>,
    );
    expect(markup.match(/tabindex="0"/gu)).toHaveLength(1);
    expect(markup.match(/tabindex="-1"/gu)).toHaveLength(2);
    expect(markup).toMatch(/data-value="locked"[^>]*disabled=""[^>]*tabindex="-1"/u);
  });

  it("keeps a closed action menu SSR-safe with a native named trigger", () => {
    const markup = renderToStaticMarkup(
      <ActionMenu
        items={[
          { id: "inspect", label: "Inspect" },
          { id: "delete", intent: "destructive", label: "Delete", confirmLabel: "Confirm delete" },
        ]}
        label="Snapshot actions"
      />,
    );
    expect(markup).toContain('data-slot="action-menu-trigger"');
    expect(markup).toContain('aria-haspopup="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('role="menu"');
  });

  it("rejects empty and duplicate action-menu collection keys", () => {
    expect(() =>
      renderToStaticMarkup(<ActionMenu items={[{ id: " ", label: "Invalid" }]} label="Actions" />),
    ).toThrow("non-empty");
    expect(() =>
      renderToStaticMarkup(
        <ActionMenu
          items={[
            { id: "duplicate", label: "First" },
            { id: "duplicate", label: "Second" },
          ]}
          label="Actions"
        />,
      ),
    ).toThrow("unique");
  });
});
