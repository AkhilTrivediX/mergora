import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactElement } from "react";

import {
  Listbox,
  type CollectionEntry,
} from "../../../registry/source/components/listbox/index.ts";
import { MergoraProvider } from "../../../registry/source/components/provider/index.ts";
import { Select } from "../../../registry/source/components/select/index.ts";
import "mergora-tokens/tokens.css";

interface CollectionProofArgs {
  readonly selectionSummary: boolean;
  readonly virtualization: boolean;
}

const frameStyle: CSSProperties = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  inlineSize: "min(42rem, calc(100vw - 2rem))",
  maxInlineSize: "100%",
  padding: "var(--mrg-semantic-density-panel-padding)",
};

const entries = Array.from({ length: 120 }, (_, index) => {
  const number = index + 1;
  return {
    description:
      number % 12 === 0 ? `Includes the archived context for record ${String(number)}.` : undefined,
    key: `record-${String(number)}`,
    textValue: `Reference record ${new Intl.NumberFormat("en-US").format(number)}`,
  } satisfies CollectionEntry;
});

function ListboxSpecimen({ selectionSummary, virtualization }: CollectionProofArgs): ReactElement {
  return (
    <MergoraProvider>
      <section aria-labelledby="listbox-proof-title" data-story-item="listbox" style={frameStyle}>
        <header>
          <h2 id="listbox-proof-title" style={{ margin: 0 }}>
            Reference records
          </h2>
          <p style={{ marginBlockEnd: 0 }}>
            Choose one or more records. Selected values remain canonical form keys when the visible
            collection window changes.
          </p>
        </header>
        <Listbox
          defaultValue={["record-2", "record-96"]}
          entries={entries}
          label="Records included in the comparison"
          name="comparison-record"
          selectionMode="multiple"
          {...(selectionSummary ? {} : { formatSelectionSummary: false as const })}
          {...(virtualization ? { virtualization: { estimatedItemSize: 52 } } : {})}
        />
      </section>
    </MergoraProvider>
  );
}

function SelectSpecimen({ selectionSummary, virtualization }: CollectionProofArgs): ReactElement {
  return (
    <MergoraProvider>
      <section aria-labelledby="select-proof-title" data-story-item="select" style={frameStyle}>
        <header>
          <h2 id="select-proof-title" style={{ margin: 0 }}>
            Default reference record
          </h2>
          <p style={{ marginBlockEnd: 0 }}>
            The enhanced picker and its native fallback share stable keys, form ownership, and reset
            behavior.
          </p>
        </header>
        <Select
          defaultValue="record-96"
          entries={entries}
          label="Default record"
          name="default-record"
          {...(selectionSummary ? {} : { formatSelectionSummary: false as const })}
          {...(virtualization ? { virtualization: { estimatedItemSize: 52 } } : {})}
        />
      </section>
    </MergoraProvider>
  );
}

const meta = {
  args: {
    selectionSummary: false,
    virtualization: false,
  },
  argTypes: {
    selectionSummary: {
      control: "boolean",
      description: "Adds bounded selected-value context for filtered or off-window selections.",
    },
    virtualization: {
      control: "boolean",
      description: "Uses measured windowed rendering for large collections.",
    },
  },
  parameters: { layout: "centered" },
  title: "P4/Collections/Component proof",
} satisfies Meta<CollectionProofArgs>;

export default meta;
type Story = StoryObj<CollectionProofArgs>;

const proofControls = ["selectionSummary", "virtualization"] as const;

export const BasicListbox: Story = {
  args: { selectionSummary: false, virtualization: false },
  parameters: { controls: { include: proofControls } },
  render: (args) => <ListboxSpecimen {...args} />,
};

export const RecommendedListbox: Story = {
  args: { selectionSummary: true, virtualization: true },
  parameters: { controls: { include: proofControls } },
  render: (args) => <ListboxSpecimen {...args} />,
};

export const BasicSelect: Story = {
  args: { selectionSummary: false, virtualization: false },
  parameters: { controls: { include: proofControls } },
  render: (args) => <SelectSpecimen {...args} />,
};

export const RecommendedSelect: Story = {
  args: { selectionSummary: true, virtualization: true },
  parameters: { controls: { include: proofControls } },
  render: (args) => <SelectSpecimen {...args} />,
};
