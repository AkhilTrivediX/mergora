import type { RefObject } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  DialogContentProps,
  DialogOpenChangeDetails,
  DialogRootProps,
  DialogTriggerProps,
} from "../../../registry/source/components/dialog/index.js";

describe("Dialog public types", () => {
  it("uses a Mergora-owned reason payload", () => {
    expectTypeOf<NonNullable<DialogRootProps["onOpenChange"]>>().toMatchTypeOf<
      (open: boolean, details: DialogOpenChangeDetails) => void
    >();
    expectTypeOf<DialogOpenChangeDetails["reason"]>().toEqualTypeOf<
      "trigger" | "close-button" | "escape-key" | "outside-interaction" | "dismiss"
    >();
    expect(true).toBe(true);
  });

  it("accepts native trigger attributes and a meaningful initial focus ref", () => {
    expectTypeOf<DialogTriggerProps["aria-label"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<DialogTriggerProps["className"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<DialogTriggerProps["disabled"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<DialogTriggerProps["type"]>().toEqualTypeOf<
      "button" | "reset" | "submit" | undefined
    >();
    expectTypeOf<DialogContentProps["initialFocusRef"]>().toEqualTypeOf<
      RefObject<HTMLElement | null> | undefined
    >();
    expect(true).toBe(true);
  });
});
