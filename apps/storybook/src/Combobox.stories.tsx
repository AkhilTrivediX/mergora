import type { Meta, StoryObj } from "@storybook/react-vite";

import { Combobox } from "../../../registry/source/components/combobox/index.ts";
import "../../../registry/source/components/combobox/combobox.css";
import "mergora-tokens/tokens.css";

const meta = {
  title: "P1 tracer/Combobox",
  component: Combobox.Root,
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Combobox.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

function Countries(): React.ReactElement {
  return (
    <Combobox.Root name="country" defaultValue="in">
      <Combobox.Label>Country</Combobox.Label>
      <Combobox.Input placeholder="Choose a country" />
      <Combobox.Trigger label="Show countries" />
      <Combobox.Description>Type to filter the available countries.</Combobox.Description>
      <Combobox.Popover>
        <Combobox.ListBox>
          <Combobox.Item id="de">Germany</Combobox.Item>
          <Combobox.Item id="in">India</Combobox.Item>
          <Combobox.Item id="jp">Japan</Combobox.Item>
        </Combobox.ListBox>
      </Combobox.Popover>
    </Combobox.Root>
  );
}

export const Default: Story = {
  args: { children: null },
  render: () => <Countries />,
};

export const Invalid: Story = {
  args: { children: null },
  render: () => (
    <Combobox.Root name="country" isRequired isInvalid>
      <Combobox.Label>Country</Combobox.Label>
      <Combobox.Input placeholder="Choose a country" />
      <Combobox.Trigger label="Show countries" />
      <Combobox.ErrorMessage>Select a country to continue.</Combobox.ErrorMessage>
      <Combobox.Popover>
        <Combobox.ListBox>
          <Combobox.Item id="de">Germany</Combobox.Item>
          <Combobox.Item id="in">India</Combobox.Item>
        </Combobox.ListBox>
      </Combobox.Popover>
    </Combobox.Root>
  ),
};

export const Disabled: Story = {
  args: { children: null },
  render: () => (
    <Combobox.Root name="country" defaultValue="in" isDisabled>
      <Combobox.Label>Country</Combobox.Label>
      <Combobox.Input />
      <Combobox.Trigger label="Show countries" />
      <Combobox.Popover>
        <Combobox.ListBox>
          <Combobox.Item id="in">India</Combobox.Item>
        </Combobox.ListBox>
      </Combobox.Popover>
    </Combobox.Root>
  ),
};
