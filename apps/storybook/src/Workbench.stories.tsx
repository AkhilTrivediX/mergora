import type { Meta, StoryObj } from "@storybook/react-vite";
import { Workbench } from "./Workbench";

const meta = {
  component: Workbench,
  parameters: { layout: "centered" },
  title: "Foundation/Workbench",
} satisfies Meta<typeof Workbench>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scaffold: Story = {};
