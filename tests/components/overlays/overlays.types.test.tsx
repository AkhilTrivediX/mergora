import type { RefObject } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  AlertDialogContentProps,
  AlertDialogRootProps,
} from "../../../registry/source/components/alert-dialog/index.js";
import type {
  DialogContentProps,
  DialogRootProps,
} from "../../../registry/source/components/dialog/index.js";
import type {
  PopoverContentProps,
  PopoverRootProps,
} from "../../../registry/source/components/popover/index.js";
import type { SheetRootProps } from "../../../registry/source/components/sheet/index.js";
import type {
  TooltipDisabledTriggerProps,
  TooltipRootProps,
} from "../../../registry/source/components/tooltip/index.js";

describe("P2 overlay public types", () => {
  it("uses exact controlled state and focus contracts", () => {
    expectTypeOf<DialogRootProps["open"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<DialogRootProps["modality"]>().toEqualTypeOf<"modal" | "non-modal" | undefined>();
    expectTypeOf<DialogContentProps["initialFocus"]>().toEqualTypeOf<
      "first-interactive" | "content" | "none" | undefined
    >();
    expectTypeOf<AlertDialogContentProps["leastDestructiveRef"]>().toEqualTypeOf<
      RefObject<HTMLElement | null>
    >();
    expectTypeOf<AlertDialogRootProps["open"]>().toEqualTypeOf<boolean | undefined>();
    type InternalDialogRootPropsArePrivate = Extract<
      keyof DialogRootProps,
      "__kind" | "__dismissPolicy" | "kind" | "dismissPolicy"
    >;
    expectTypeOf<InternalDialogRootPropsArePrivate>().toEqualTypeOf<never>();
    expect(true).toBe(true);
  });

  it("keeps logical placement, edge, delay, and disabled adapter APIs Mergora-owned", () => {
    expectTypeOf<PopoverContentProps["placement"]>().toEqualTypeOf<
      "top" | "bottom" | "start" | "end" | undefined
    >();
    expectTypeOf<PopoverContentProps["initialFocus"]>().toEqualTypeOf<
      "first-interactive" | "content" | "none" | undefined
    >();
    expectTypeOf<NonNullable<PopoverRootProps["onOpenChange"]>>().toBeFunction();
    expectTypeOf<SheetRootProps["side"]>().toEqualTypeOf<
      "start" | "end" | "top" | "bottom" | undefined
    >();
    expectTypeOf<TooltipRootProps["delay"]>().toEqualTypeOf<number | undefined>();
    type DisabledIsExcluded = "disabled" extends keyof TooltipDisabledTriggerProps ? false : true;
    expectTypeOf<DisabledIsExcluded>().toEqualTypeOf<true>();
    expect(true).toBe(true);
  });
});
