import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPublicApiDocs,
  type PublicApiDocs,
} from "../../tooling/registry-builder/src/public-api-docs.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");

const families = [
  {
    id: "action-menu",
    publicExports: ["ActionMenuProps"],
    props: [
      "ActionMenuProps.confirmDestructiveActions",
      "ActionMenuProps.defaultOpen",
      "ActionMenuProps.direction",
      "ActionMenuProps.items",
      "ActionMenuProps.label",
      "ActionMenuProps.onAction",
      "ActionMenuProps.onOpenChange",
      "ActionMenuProps.open",
      "ActionMenuProps.pending",
      "ActionMenuProps.pendingLabel",
      "ActionMenuProps.placement",
      "ActionMenuProps.triggerProps",
    ],
  },
  {
    id: "button",
    publicExports: ["ButtonOwnProps", "ButtonProps"],
    props: [
      "ButtonOwnProps.pending",
      "ButtonOwnProps.pendingLabel",
      "ButtonOwnProps.size",
      "ButtonOwnProps.variant",
      "ButtonProps.children",
    ],
  },
  {
    id: "button-group",
    publicExports: ["ButtonGroupProps"],
    props: [
      "ButtonGroupProps.children",
      "ButtonGroupProps.direction",
      "ButtonGroupProps.keyboardHint",
      "ButtonGroupProps.label",
      "ButtonGroupProps.mode",
      "ButtonGroupProps.orientation",
      "ButtonGroupProps.wrap",
    ],
  },
  {
    id: "copy-button",
    publicExports: ["CopyButtonProps"],
    props: [
      "CopyButtonProps.allowFallback",
      "CopyButtonProps.copiedLabel",
      "CopyButtonProps.copyingLabel",
      "CopyButtonProps.copyLabel",
      "CopyButtonProps.errorLabel",
      "CopyButtonProps.onCopy",
      "CopyButtonProps.onCopyError",
      "CopyButtonProps.text",
    ],
  },
  {
    id: "icon-button",
    publicExports: ["IconButtonProps"],
    props: [
      "IconButtonProps.children",
      "IconButtonProps.label",
      "IconButtonProps.pending",
      "IconButtonProps.pendingLabel",
      "IconButtonProps.size",
      "IconButtonProps.tooltip",
      "IconButtonProps.variant",
    ],
  },
  {
    id: "link",
    publicExports: ["LinkProps"],
    props: [
      "LinkProps.children",
      "LinkProps.external",
      "LinkProps.externalContext",
      "LinkProps.href",
      "LinkProps.standalone",
    ],
  },
  {
    id: "segmented-control",
    publicExports: ["SegmentedControlItemProps", "SegmentedControlProps"],
    props: [
      "SegmentedControlItemProps.disabled",
      "SegmentedControlItemProps.value",
      "SegmentedControlProps.children",
      "SegmentedControlProps.defaultValue",
      "SegmentedControlProps.direction",
      "SegmentedControlProps.label",
      "SegmentedControlProps.name",
      "SegmentedControlProps.onValueChange",
      "SegmentedControlProps.renderSelectionSummary",
      "SegmentedControlProps.required",
      "SegmentedControlProps.value",
    ],
  },
  {
    id: "toggle",
    publicExports: ["ToggleProps"],
    props: [
      "ToggleProps.children",
      "ToggleProps.defaultPressed",
      "ToggleProps.onPressedChange",
      "ToggleProps.pending",
      "ToggleProps.pendingLabel",
      "ToggleProps.pressed",
    ],
  },
  {
    id: "toggle-group",
    publicExports: [
      "ToggleGroupItemProps",
      "ToggleGroupMultipleProps",
      "ToggleGroupProps",
      "ToggleGroupSingleProps",
    ],
    props: [
      "ToggleGroupItemProps.value",
      "ToggleGroupMultipleProps.allowEmpty",
      "ToggleGroupMultipleProps.defaultValue",
      "ToggleGroupMultipleProps.onValueChange",
      "ToggleGroupMultipleProps.type",
      "ToggleGroupMultipleProps.value",
      "ToggleGroupSingleProps.allowEmpty",
      "ToggleGroupSingleProps.defaultValue",
      "ToggleGroupSingleProps.onValueChange",
      "ToggleGroupSingleProps.type",
      "ToggleGroupSingleProps.value",
    ],
  },
] as const;

const expectedLocaleSensitive = new Set([
  "action-menu:ActionMenuProps.direction",
  "action-menu:ActionMenuProps.items",
  "action-menu:ActionMenuProps.label",
  "action-menu:ActionMenuProps.pendingLabel",
  "button:ButtonOwnProps.pendingLabel",
  "button:ButtonProps.children",
  "button:ButtonProps.pendingLabel",
  "button-group:ButtonGroupProps.children",
  "button-group:ButtonGroupProps.direction",
  "button-group:ButtonGroupProps.keyboardHint",
  "button-group:ButtonGroupProps.label",
  "copy-button:CopyButtonProps.copiedLabel",
  "copy-button:CopyButtonProps.copyingLabel",
  "copy-button:CopyButtonProps.copyLabel",
  "copy-button:CopyButtonProps.errorLabel",
  "copy-button:CopyButtonProps.text",
  "icon-button:IconButtonProps.label",
  "icon-button:IconButtonProps.pendingLabel",
  "icon-button:IconButtonProps.tooltip",
  "link:LinkProps.children",
  "link:LinkProps.externalContext",
  "segmented-control:SegmentedControlProps.children",
  "segmented-control:SegmentedControlProps.direction",
  "segmented-control:SegmentedControlProps.label",
  "segmented-control:SegmentedControlProps.renderSelectionSummary",
  "toggle:ToggleProps.children",
  "toggle:ToggleProps.pendingLabel",
  "toggle-group:ToggleGroupMultipleProps.label",
  "toggle-group:ToggleGroupProps.label",
  "toggle-group:ToggleGroupSingleProps.label",
]);

function docsFor(family: (typeof families)[number]): PublicApiDocs {
  const sourcePath = `registry/source/components/${family.id}/${family.id}.tsx`;
  return buildPublicApiDocs(
    {
      id: family.id,
      normalizedFiles: [
        {
          content: readFileSync(resolve(workspaceRoot, sourcePath), "utf8"),
          mediaType: "text/typescript-jsx",
          sourcePath,
        },
      ],
      publicExports: family.publicExports,
    },
    "client-island",
  );
}

describe("actions and selection public API descriptions", () => {
  it("describes a deterministic recursive inventory containing every curated property", () => {
    let propCount = 0;
    let describedCount = 0;

    for (const family of families) {
      const docs = docsFor(family);
      const propNames = docs.props.map((prop) => `${prop.owner}.${prop.name}`);
      expect(propNames, `${family.id} ordering`).toEqual(
        [...propNames].sort((left, right) => left.localeCompare(right, "en-US")),
      );
      expect(propNames, `${family.id} curated inventory`).toEqual(
        expect.arrayContaining([...family.props]),
      );
      expect(docs.summary.describedProps, family.id).toBe(docs.summary.props);
      propCount += docs.summary.props;
      describedCount += docs.summary.describedProps;
    }

    expect(describedCount).toBe(propCount);
    expect(propCount).toBeGreaterThanOrEqual(72);
  });

  it("resolves review-required inference only from component-specific descriptions", () => {
    const actualLocaleSensitive = new Set<string>();

    for (const family of families) {
      const docs = docsFor(family);
      for (const prop of docs.props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description, key).not.toBeNull();
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.description, key).not.toMatch(/^(?:The|This) (?:prop|property)\b/iu);
        expect(prop.localizationBehavior, key).not.toBe("review-required");
        expect(prop.semanticContract, key).not.toBe("review-required");
        if (prop.localizationBehavior === "locale-or-copy-sensitive") {
          actualLocaleSensitive.add(key);
        }
      }
    }

    expect(actualLocaleSensitive).toEqual(expectedLocaleSensitive);
  });

  it("keeps high-risk behavior claims tied to the canonical contracts", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("action-menu:ActionMenuProps.confirmDestructiveActions")).toContain(
      "second activation",
    );
    expect(descriptions.get("action-menu:ActionMenuProps.pending")).toContain("blocks opening");
    expect(descriptions.get("button:ButtonOwnProps.pending")).toContain("blocking activation");
    expect(descriptions.get("copy-button:CopyButtonProps.text")).toContain("clipboard");
    expect(descriptions.get("copy-button:CopyButtonProps.onCopy")).toContain("successful write");
    expect(descriptions.get("link:LinkProps.external")).toContain("noopener");
    expect(descriptions.get("segmented-control:SegmentedControlProps.required")).toContain(
      "native required validation",
    );
    expect(descriptions.get("toggle:ToggleProps.pressed")).toContain("aria-pressed");
    expect(descriptions.get("toggle-group:ToggleGroupMultipleProps.allowEmpty")).toContain(
      "multiple mode permits empty",
    );
  });
});
