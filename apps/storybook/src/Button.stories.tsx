import type { CSSProperties, ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import {
  Button,
  type ButtonSize,
  type ButtonVariant,
} from "../../../registry/source/components/button/button";

const variants: readonly ButtonVariant[] = ["primary", "secondary", "quiet", "destructive"];
const sizes: readonly ButtonSize[] = ["small", "medium", "large"];

const railStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "1rem",
  maxWidth: "42rem",
} satisfies CSSProperties;

function StoryRail({
  children,
  direction,
}: {
  readonly children: ReactNode;
  readonly direction?: "rtl";
}) {
  return (
    <div dir={direction} style={railStyle}>
      {children}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="18"
      viewBox="0 0 18 18"
      width="18"
    >
      <path d="M9 3.25v11.5M3.25 9h11.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

const meta = {
  args: {
    children: "Save changes",
    pending: false,
    size: "medium",
    variant: "primary",
  },
  argTypes: {
    pendingLabel: { control: "text" },
    size: { control: "inline-radio", options: sizes },
    variant: { control: "select", options: variants },
  },
  component: Button,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  title: "Components/Button",
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const VariantRail: Story = {
  render: () => (
    <StoryRail>
      {variants.map((variant) => (
        <Button key={variant} variant={variant}>
          {variant === "destructive" ? "Delete record" : `${variant} action`}
        </Button>
      ))}
    </StoryRail>
  ),
};

export const SizeRail: Story = {
  render: () => (
    <StoryRail>
      {sizes.map((size) => (
        <Button key={size} size={size} variant="secondary">
          {size} action
        </Button>
      ))}
    </StoryRail>
  ),
};

export const Pending: Story = {
  args: {
    children: "Publish release",
    pending: true,
    pendingLabel: "Publishing release",
  },
};

export const Disabled: Story = {
  args: {
    children: "Unavailable action",
    disabled: true,
    variant: "secondary",
  },
};

export const IconOnlyNamed: Story = {
  args: {
    "aria-label": "Add row",
    children: <PlusIcon />,
    size: "large",
    variant: "secondary",
  },
};

export const NarrowLongLabel: Story = {
  render: () => (
    <div style={{ inlineSize: "15rem" }}>
      <Button>Änderungen an allen ausgewählten Arbeitsbereichen speichern</Button>
    </div>
  ),
};

export const RightToLeft: Story = {
  render: () => (
    <StoryRail direction="rtl">
      <Button>حفظ التغييرات</Button>
      <Button pending pendingLabel="جارٍ حفظ التغييرات" variant="secondary">
        حفظ التغييرات
      </Button>
    </StoryRail>
  ),
};
