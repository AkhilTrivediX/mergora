import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPublicApiDocs,
  type PublicApiDocs,
} from "../../tooling/registry-builder/src/public-api-docs.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");

interface OverlayFamilyCase {
  readonly id: string;
  readonly properties: Readonly<Record<string, readonly string[]>>;
  readonly zeroPropGroups: readonly string[];
}

const families: readonly OverlayFamilyCase[] = [
  {
    id: "alert-dialog",
    properties: {
      AlertDialogActionProps: ["children"],
      AlertDialogContentProps: [
        "acknowledged",
        "acknowledgementLabel",
        "defaultAcknowledged",
        "leastDestructiveRef",
        "onAcknowledgedChange",
      ],
      AlertDialogRootProps: ["children", "defaultOpen", "finalFocusRef", "onOpenChange", "open"],
    },
    zeroPropGroups: [
      "AlertDialogCancelProps",
      "AlertDialogDescriptionProps",
      "AlertDialogFooterProps",
      "AlertDialogHeaderProps",
      "AlertDialogOverlayProps",
      "AlertDialogTitleProps",
      "AlertDialogTriggerProps",
    ],
  },
  {
    id: "context-menu",
    properties: {
      ContextMenuProps: [
        "children",
        "confirmDestructiveActions",
        "defaultOpen",
        "defaultSelectedIds",
        "disabled",
        "invocationHint",
        "items",
        "menuLabel",
        "onAction",
        "onOpenChange",
        "onSelectionChange",
        "open",
        "selectedIds",
        "selectionMode",
        "selectionSummary",
        "showInvocationHint",
        "triggerProps",
      ],
    },
    zeroPropGroups: [],
  },
  {
    id: "dialog",
    properties: {
      DialogCloseProps: ["children"],
      DialogContentProps: [
        "children",
        "dismissHint",
        "dismissPolicy",
        "initialFocus",
        "initialFocusRef",
        "role",
      ],
      DialogOverlayProps: ["children", "placement"],
      DialogRootProps: [
        "children",
        "defaultOpen",
        "finalFocusRef",
        "modality",
        "onOpenChange",
        "open",
      ],
      DialogTitleProps: ["level"],
      DialogTriggerProps: ["children"],
    },
    zeroPropGroups: ["DialogDescriptionProps", "DialogFooterProps", "DialogHeaderProps"],
  },
  {
    id: "drawer",
    properties: {
      DrawerRootProps: [
        "children",
        "defaultOpen",
        "finalFocusRef",
        "onOpenChange",
        "open",
        "side",
        "size",
        "swipeHandleLabel",
        "swipeThreshold",
        "swipeToClose",
      ],
    },
    zeroPropGroups: [
      "DrawerCloseProps",
      "DrawerContentProps",
      "DrawerDescriptionProps",
      "DrawerFooterProps",
      "DrawerHeaderProps",
      "DrawerOverlayProps",
      "DrawerTitleProps",
      "DrawerTriggerProps",
    ],
  },
  {
    id: "dropdown-menu",
    properties: {
      DropdownMenuProps: [
        "confirmDestructiveActions",
        "defaultOpen",
        "defaultSelectedIds",
        "direction",
        "disabled",
        "emptyContent",
        "items",
        "label",
        "menuLabel",
        "onAction",
        "onOpenChange",
        "onSelectionChange",
        "open",
        "placement",
        "selectedIds",
        "selectionMode",
        "selectionSummary",
        "selectionSummaryLabel",
        "triggerProps",
        "triggerRole",
      ],
    },
    zeroPropGroups: [],
  },
  {
    id: "hover-card",
    properties: {
      HoverCardProps: [
        "children",
        "closeDelay",
        "closeLabel",
        "defaultOpen",
        "description",
        "disabled",
        "onOpenChange",
        "open",
        "openDelay",
        "pinnedLabel",
        "pinOnPress",
        "title",
        "trigger",
        "triggerProps",
      ],
    },
    zeroPropGroups: [],
  },
  {
    id: "menubar",
    properties: {
      MenubarProps: [
        "confirmDestructiveActions",
        "defaultOpenMenuId",
        "direction",
        "keyboardGuide",
        "keyboardGuideText",
        "label",
        "menus",
        "onOpenMenuChange",
        "openMenuId",
        "openMenuOnFocus",
        "selectionSummary",
      ],
    },
    zeroPropGroups: [],
  },
  {
    id: "popover",
    properties: {
      PopoverArrowProps: ["size"],
      PopoverCloseProps: ["children"],
      PopoverContentProps: [
        "align",
        "anchorContext",
        "children",
        "containerPadding",
        "crossOffset",
        "initialFocus",
        "initialFocusRef",
        "offset",
        "placement",
        "shouldFlip",
      ],
      PopoverRootProps: ["children", "defaultOpen", "finalFocusRef", "onOpenChange", "open"],
      PopoverTitleProps: ["level"],
      PopoverTriggerProps: ["children"],
    },
    zeroPropGroups: ["PopoverDescriptionProps"],
  },
  {
    id: "sheet",
    properties: {
      SheetContentProps: ["progress"],
      SheetRootProps: [
        "children",
        "defaultOpen",
        "finalFocusRef",
        "onOpenChange",
        "open",
        "side",
        "size",
      ],
    },
    zeroPropGroups: [
      "SheetCloseProps",
      "SheetDescriptionProps",
      "SheetFooterProps",
      "SheetHeaderProps",
      "SheetOverlayProps",
      "SheetTitleProps",
      "SheetTriggerProps",
    ],
  },
  {
    id: "toast",
    properties: {
      ToastRegionProps: [
        "closeLabel",
        "label",
        "pauseControls",
        "pauseLabel",
        "queue",
        "queueSummaryLabel",
        "resumeLabel",
        "showQueueSummary",
      ],
    },
    zeroPropGroups: [],
  },
  {
    id: "tooltip",
    properties: {
      TooltipArrowProps: ["size"],
      TooltipContentProps: [
        "children",
        "containerPadding",
        "crossOffset",
        "offset",
        "placement",
        "shortcut",
        "shouldFlip",
      ],
      TooltipDisabledTriggerProps: ["children"],
      TooltipRootProps: [
        "children",
        "closeDelay",
        "defaultOpen",
        "delay",
        "disabled",
        "onOpenChange",
        "open",
        "touchPolicy",
      ],
      TooltipTriggerProps: ["children"],
    },
    zeroPropGroups: [],
  },
  {
    id: "tour",
    properties: {
      TourProps: [
        "announceStepChanges",
        "backLabel",
        "completeLabel",
        "defaultOpen",
        "defaultStepId",
        "focusPolicy",
        "nextLabel",
        "onComplete",
        "onOpenChange",
        "onSkip",
        "onStepIdChange",
        "open",
        "returnFocusRef",
        "routeAdapter",
        "showProgress",
        "skipLabel",
        "stepId",
        "steps",
        "targetRecovery",
        "triggerLabel",
      ],
    },
    zeroPropGroups: [],
  },
];

function sourcePathFor(family: OverlayFamilyCase): string {
  return `registry/source/components/${family.id}/${family.id}.tsx`;
}

function sourceFor(family: OverlayFamilyCase): string {
  return readFileSync(resolve(workspaceRoot, sourcePathFor(family)), "utf8");
}

function publicGroups(family: OverlayFamilyCase): readonly string[] {
  return [...Object.keys(family.properties), ...family.zeroPropGroups].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
}

function expectedProps(family: OverlayFamilyCase): readonly string[] {
  return Object.entries(family.properties)
    .flatMap(([owner, names]) => names.map((name) => `${owner}.${name}`))
    .sort((left, right) => left.localeCompare(right, "en-US"));
}

function docsFor(family: OverlayFamilyCase): PublicApiDocs {
  const sourcePath = sourcePathFor(family);
  return buildPublicApiDocs(
    {
      id: family.id,
      normalizedFiles: [
        {
          content: sourceFor(family),
          mediaType: "text/typescript-jsx",
          sourcePath,
        },
      ],
      publicExports: publicGroups(family),
    },
    "client-island",
  );
}

describe("overlay public API descriptions", () => {
  it("describes the exact extractor-visible inventory for every overlay", () => {
    let describedCount = 0;
    let groupCount = 0;
    let propCount = 0;

    for (const family of families) {
      const docs = docsFor(family);
      expect(
        docs.groups.map((group) => group.name),
        `${family.id} groups`,
      ).toEqual(publicGroups(family));
      expect(
        docs.props.map((prop) => `${prop.owner}.${prop.name}`),
        `${family.id} props`,
      ).toEqual(expectedProps(family));
      expect(docs.summary.describedProps, family.id).toBe(docs.summary.props);
      describedCount += docs.summary.describedProps;
      groupCount += docs.summary.propGroups;
      propCount += docs.summary.props;
    }

    expect({ describedCount, groupCount, propCount }).toEqual({
      describedCount: 173,
      groupCount: 55,
      propCount: 173,
    });
  });

  it("leaves no locale or semantic inference in review-required state", () => {
    for (const family of families) {
      for (const prop of docsFor(family).props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description, key).not.toBeNull();
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.description, key).not.toMatch(/^(?:The|This) (?:prop|property)\b/iu);
        expect(prop.localizationBehavior, key).not.toBe("review-required");
        expect(prop.semanticContract, key).not.toBe("review-required");
      }
    }
  });

  it("keeps safety, focus, dismissal, and enhancement claims tied to contracts", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("alert-dialog:AlertDialogContentProps.leastDestructiveRef")).toContain(
      "cancel/return action",
    );
    expect(descriptions.get("context-menu:ContextMenuProps.showInvocationHint")).toContain(
      "pointer and keyboard invocation",
    );
    expect(descriptions.get("dialog:DialogContentProps.dismissPolicy")).toContain(
      "Escape and outside interaction",
    );
    expect(descriptions.get("drawer:DrawerRootProps.swipeThreshold")).toContain("CSS pixels");
    expect(descriptions.get("dropdown-menu:DropdownMenuProps.confirmDestructiveActions")).toContain(
      "second explicit activation",
    );
    expect(descriptions.get("hover-card:HoverCardProps.pinOnPress")).toContain("close action");
    expect(descriptions.get("menubar:MenubarProps.openMenuOnFocus")).toContain(
      "while one is active",
    );
    expect(descriptions.get("popover:PopoverContentProps.initialFocus")).toContain(
      "keeps focus on the trigger",
    );
    expect(descriptions.get("sheet:SheetContentProps.progress")).toContain("native progress rail");
    expect(descriptions.get("toast:ToastRegionProps.pauseControls")).toContain(
      "automatic hover/focus pause",
    );
    expect(descriptions.get("tooltip:TooltipRootProps.touchPolicy")).toContain("no long-press");
    expect(descriptions.get("tour:TourProps.targetRecovery")).toContain(
      "false removes status, retry UI, and callbacks",
    );
  });

  it("records alias-only groups and nested source members without inventing flattened props", () => {
    const zeroPropGroups = families.flatMap((family) => {
      const docs = docsFor(family);
      const owners = new Set(docs.props.map((prop) => prop.owner));
      return docs.groups
        .filter((group) => !owners.has(group.name))
        .map((group) => `${family.id}:${group.name}`);
    });

    expect(zeroPropGroups).toEqual([
      "alert-dialog:AlertDialogCancelProps",
      "alert-dialog:AlertDialogDescriptionProps",
      "alert-dialog:AlertDialogFooterProps",
      "alert-dialog:AlertDialogHeaderProps",
      "alert-dialog:AlertDialogOverlayProps",
      "alert-dialog:AlertDialogTitleProps",
      "alert-dialog:AlertDialogTriggerProps",
      "dialog:DialogDescriptionProps",
      "dialog:DialogFooterProps",
      "dialog:DialogHeaderProps",
      "drawer:DrawerCloseProps",
      "drawer:DrawerContentProps",
      "drawer:DrawerDescriptionProps",
      "drawer:DrawerFooterProps",
      "drawer:DrawerHeaderProps",
      "drawer:DrawerOverlayProps",
      "drawer:DrawerTitleProps",
      "drawer:DrawerTriggerProps",
      "popover:PopoverDescriptionProps",
      "sheet:SheetCloseProps",
      "sheet:SheetDescriptionProps",
      "sheet:SheetFooterProps",
      "sheet:SheetHeaderProps",
      "sheet:SheetOverlayProps",
      "sheet:SheetTitleProps",
      "sheet:SheetTriggerProps",
    ]);

    expect(sourceFor(families[2]!)).toMatch(
      /\/\*\* Internal family namespace[^]*?readonly kind\?: DialogPartKind;/u,
    );
    expect(sourceFor(families[4]!)).toMatch(
      /interface DropdownMenuItemBase[^]*?\/\*\* Stable non-empty identifier[^]*?readonly id: string;/u,
    );
    expect(sourceFor(families[8]!)).toMatch(
      /\/\*\* Visible and accessible label[^]*?readonly label: string;[^]*?\/\*\* Positive upper bound[^]*?readonly max\?: number;[^]*?\/\*\* Current controlled progress[^]*?readonly value: number;/u,
    );
  });
});
