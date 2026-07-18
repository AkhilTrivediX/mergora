import { createRef } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ActionMenu,
  type ActionMenuProps,
} from "../../../registry/source/components/action-menu/action-menu.tsx";
import { Button, type ButtonProps } from "../../../registry/source/components/button/button.tsx";
import {
  ButtonGroup,
  type ButtonGroupProps,
} from "../../../registry/source/components/button-group/button-group.tsx";
import {
  CopyButton,
  type CopyButtonProps,
} from "../../../registry/source/components/copy-button/copy-button.tsx";
import {
  IconButton,
  type IconButtonProps,
} from "../../../registry/source/components/icon-button/icon-button.tsx";
import { Link, type LinkProps } from "../../../registry/source/components/link/link.tsx";
import {
  SegmentedControl,
  SegmentedControlItem,
  type SegmentedControlProps,
} from "../../../registry/source/components/segmented-control/segmented-control.tsx";
import { Toggle, type ToggleProps } from "../../../registry/source/components/toggle/toggle.tsx";
import {
  ToggleGroup,
  ToggleGroupItem,
  type ToggleGroupProps,
} from "../../../registry/source/components/toggle-group/toggle-group.tsx";

const buttonRef = createRef<HTMLButtonElement>();
const anchorRef = createRef<HTMLAnchorElement>();
const groupRef = createRef<HTMLDivElement>();
const fieldsetRef = createRef<HTMLFieldSetElement>();

const validFixtures = [
  <Button key="button" pending ref={buttonRef}>
    Save
  </Button>,
  <IconButton key="icon" label="Add" ref={buttonRef}>
    <span aria-hidden="true">+</span>
  </IconButton>,
  <ButtonGroup key="button-group" label="Actions" mode="toolbar" ref={groupRef}>
    <Button>Save</Button>
  </ButtonGroup>,
  <CopyButton key="copy" ref={buttonRef} text="source" />,
  <Toggle key="toggle" onPressedChange={() => undefined} pressed ref={buttonRef}>
    Pin
  </Toggle>,
  <ToggleGroup key="toggle-group" label="View" type="multiple" value={["preview"]}>
    <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
  </ToggleGroup>,
  <SegmentedControl key="segment" label="Mode" ref={fieldsetRef} value="source">
    <SegmentedControlItem value="source">Source</SegmentedControlItem>
  </SegmentedControl>,
  <Link href="/docs" key="link" ref={anchorRef}>
    Docs
  </Link>,
  <ActionMenu
    items={[
      { id: "delete", intent: "destructive", label: "Delete", confirmLabel: "Confirm delete" },
    ]}
    key="menu"
    label="Actions"
    ref={buttonRef}
  />,
];

const invalidIcon = (
  // @ts-expect-error IconButton requires an explicit accessible label.
  <IconButton>
    <span>+</span>
  </IconButton>
);
// @ts-expect-error Link requires a real href and has no disabled-link mode.
const invalidLink = <Link>Docs</Link>;
const invalidDestructive = (
  // @ts-expect-error Destructive menu items require explicit confirmation text.
  <ActionMenu items={[{ id: "delete", intent: "destructive", label: "Delete" }]} label="Actions" />
);
// @ts-expect-error Toggle pressed state is boolean.
const invalidToggle = <Toggle pressed="yes">Pin</Toggle>;
// @ts-expect-error Single ToggleGroup values are scalar, not arrays.
const invalidToggleGroup = <ToggleGroup label="View" type="single" value={["preview"]} />;
// @ts-expect-error Segmented item values are stable strings.
const invalidSegment = <SegmentedControlItem value={2}>Two</SegmentedControlItem>;

describe("P2 actions and selection type surface", () => {
  it("keeps every public props and ref surface strict", () => {
    expectTypeOf<ButtonProps>().toBeObject();
    expectTypeOf<IconButtonProps>().toBeObject();
    expectTypeOf<ButtonGroupProps>().toBeObject();
    expectTypeOf<CopyButtonProps>().toBeObject();
    expectTypeOf<ToggleProps>().toBeObject();
    expectTypeOf<ToggleGroupProps>().toBeObject();
    expectTypeOf<SegmentedControlProps>().toBeObject();
    expectTypeOf<LinkProps>().toBeObject();
    expectTypeOf<ActionMenuProps>().toBeObject();
    expect(validFixtures).toHaveLength(9);
    expect([
      invalidIcon,
      invalidLink,
      invalidDestructive,
      invalidToggle,
      invalidToggleGroup,
      invalidSegment,
    ]).toHaveLength(6);
  });
});
