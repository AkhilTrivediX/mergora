import { useState, type CSSProperties, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { Combobox } from "../../../registry/source/components/combobox/combobox";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  padding: "clamp(1rem, 4vw, 3rem)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xl)",
  marginInline: "auto",
  maxInlineSize: "48rem",
  minInlineSize: 0,
} satisfies CSSProperties;

const stateRailStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  paddingBlockStart: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

function Canvas({
  children,
  direction = "ltr",
}: {
  readonly children: ReactNode;
  readonly direction?: "ltr" | "rtl";
}) {
  return (
    <MergoraProvider direction={direction} locale={direction === "rtl" ? "ar-EG" : "en-US"}>
      <main style={canvasStyle}>
        <div style={workbenchStyle}>{children}</div>
      </main>
    </MergoraProvider>
  );
}

const OPTIONS = [
  { id: "alpine", label: "Alpine", description: "Compact and cool-weather tolerant." },
  { id: "coastal", label: "Coastal", description: "Suited to salt air and mild winters." },
  { id: "desert", label: "Desert", description: "Adapted to heat and low rainfall." },
  { id: "forest", label: "Forest", description: "Prefers shade and consistent moisture." },
] as const;

interface ComboboxStoryArgs {
  readonly clearAction: boolean;
}

function ComboboxSpecimen({
  clearAction,
  direction = "ltr",
  invalid = false,
  readOnly = false,
}: ComboboxStoryArgs & {
  readonly direction?: "ltr" | "rtl";
  readonly invalid?: boolean;
  readonly readOnly?: boolean;
}) {
  const [selection, setSelection] = useState<string | number | null>("coastal");
  const [input, setInput] = useState("Coastal");
  return (
    <Canvas direction={direction}>
      <header>
        <h1 style={{ marginBlock: 0 }}>Editable option finder</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Typeahead, native form value ownership, rich options, and an optional clear action share
          one labelled field.
        </p>
      </header>
      <Combobox.Root
        inputValue={input}
        isInvalid={invalid}
        isReadOnly={readOnly}
        name="habitat"
        onInputValueChange={setInput}
        onValueChange={(nextSelection) => {
          setSelection(nextSelection);
          if (nextSelection === null) {
            setInput("");
            return;
          }
          const selectedOption = OPTIONS.find((option) => option.id === nextSelection);
          setInput(selectedOption?.label ?? String(nextSelection));
        }}
        value={selection}
      >
        <Combobox.Label>Habitat profile</Combobox.Label>
        <Combobox.Input placeholder="Type to filter habitats" />
        {clearAction ? <Combobox.Clear label="Clear habitat" /> : null}
        <Combobox.Trigger label="Show habitat options" />
        <Combobox.Description>Choose a profile or continue typing.</Combobox.Description>
        <Combobox.Popover>
          <Combobox.ListBox emptyContent="No matching habitats">
            {OPTIONS.map((option) => (
              <Combobox.Item id={option.id} key={option.id} textValue={option.label}>
                <span>
                  <strong>{option.label}</strong>
                  <small style={{ display: "block" }}>{option.description}</small>
                </span>
              </Combobox.Item>
            ))}
          </Combobox.ListBox>
        </Combobox.Popover>
        {invalid ? (
          <Combobox.ErrorMessage>Select an available habitat profile.</Combobox.ErrorMessage>
        ) : null}
      </Combobox.Root>
      <output aria-live="polite" data-testid="combobox-value">
        Selection: {selection === null ? "none" : String(selection)}; input: {input || "empty"}
      </output>
    </Canvas>
  );
}

const meta = {
  argTypes: {
    clearAction: {
      control: "boolean",
      description:
        "Composes the clear part; false removes its UI, state mutation, and button name.",
    },
  },
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P4/Combobox",
} satisfies Meta<ComboboxStoryArgs>;

export default meta;
type Story = StoryObj<ComboboxStoryArgs>;

export const BasicDefaults: Story = {
  args: { clearAction: false },
  render: (args) => <ComboboxSpecimen {...args} />,
};

export const RecommendedMergora: Story = {
  args: { clearAction: true },
  render: (args) => <ComboboxSpecimen {...args} />,
};

export const InvalidAndReadOnly: Story = {
  args: { clearAction: true },
  render: (args) => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Invalid and read-only fields</h1>
      <div style={stateRailStyle}>
        <Combobox.Root isInvalid>
          <Combobox.Label>Invalid habitat</Combobox.Label>
          <Combobox.Input />
          {args.clearAction ? <Combobox.Clear /> : null}
          <Combobox.Trigger />
          <Combobox.ErrorMessage>Choose an available habitat.</Combobox.ErrorMessage>
          <Combobox.Popover>
            <Combobox.ListBox>
              <Combobox.Item id="forest">Forest</Combobox.Item>
            </Combobox.ListBox>
          </Combobox.Popover>
        </Combobox.Root>
        <Combobox.Root defaultInputValue="Coastal" isReadOnly>
          <Combobox.Label>Read-only habitat</Combobox.Label>
          <Combobox.Input />
          {args.clearAction ? <Combobox.Clear label="Clear read-only habitat" /> : null}
          <Combobox.Trigger />
          <Combobox.Popover>
            <Combobox.ListBox>
              <Combobox.Item id="coastal">Coastal</Combobox.Item>
            </Combobox.ListBox>
          </Combobox.Popover>
        </Combobox.Root>
      </div>
    </Canvas>
  ),
};

export const RightToLeftAndNarrow: Story = {
  args: { clearAction: true },
  render: (args) => <ComboboxSpecimen {...args} direction="rtl" />,
};
