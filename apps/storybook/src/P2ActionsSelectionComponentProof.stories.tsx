import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { ActionMenu } from "../../../registry/source/components/action-menu/index.ts";
import { Button } from "../../../registry/source/components/button/index.ts";
import { ButtonGroup } from "../../../registry/source/components/button-group/index.ts";
import { CopyButton } from "../../../registry/source/components/copy-button/index.ts";
import { IconButton } from "../../../registry/source/components/icon-button/index.ts";
import { LayerManager } from "../../../registry/source/components/layer-manager/index.ts";
import { Link } from "../../../registry/source/components/link/index.ts";
import { MergoraProvider } from "../../../registry/source/components/provider/index.ts";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../../../registry/source/components/segmented-control/index.ts";
import { Toggle } from "../../../registry/source/components/toggle/index.ts";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../../registry/source/components/toggle-group/index.ts";
import "mergora-tokens/tokens.css";

interface ActionsSelectionProofArgs {
  readonly clipboardFallback: boolean;
  readonly destructiveConfirmation: boolean;
  readonly externalContext: boolean;
  readonly iconTooltip: boolean;
  readonly pendingFeedback: boolean;
  readonly selectionSummaries: boolean;
  readonly toolbarDiscovery: boolean;
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

const actionRowStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-density-control-gap)",
};

function SpecimenFrame({
  children,
  description,
  itemId,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly itemId: string;
  readonly title: string;
}): ReactElement {
  return (
    <MergoraProvider>
      <LayerManager.Provider>
        <section
          aria-labelledby={`${itemId}-proof-title`}
          data-story-item={itemId}
          style={frameStyle}
        >
          <header>
            <h2 id={`${itemId}-proof-title`} style={{ margin: 0 }}>
              {title}
            </h2>
            <p
              style={{
                color: "var(--mrg-semantic-color-foreground-muted)",
                marginBlock: "var(--mrg-semantic-space-stack-xs) 0",
                maxInlineSize: "65ch",
              }}
            >
              {description}
            </p>
          </header>
          {children}
        </section>
      </LayerManager.Provider>
    </MergoraProvider>
  );
}

function ActionMenuSpecimen({
  confirmDestructiveActions,
}: {
  readonly confirmDestructiveActions: boolean;
}): ReactElement {
  return (
    <SpecimenFrame
      description="Open the menu and choose Delete snapshot. Confirmation, when selected, stays inside the menu and preserves focus."
      itemId="action-menu"
      title="Snapshot actions"
    >
      <div style={actionRowStyle}>
        <ActionMenu
          confirmDestructiveActions={confirmDestructiveActions}
          defaultOpen
          items={[
            { id: "duplicate", label: "Duplicate snapshot" },
            {
              confirmLabel: "Confirm delete snapshot",
              description: "Removes the saved snapshot from this workspace.",
              id: "delete",
              intent: "destructive",
              label: "Delete snapshot",
            },
          ]}
          label="Snapshot actions"
          placement="start"
        />
      </div>
    </SpecimenFrame>
  );
}

function ButtonSpecimen({ pending }: { readonly pending: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The pending state keeps its native button focusable while blocking duplicate activation."
      itemId="button"
      title="Save changes"
    >
      <div style={actionRowStyle}>
        <Button pending={pending} pendingLabel="Saving changes">
          Save changes
        </Button>
        <Button variant="secondary">Cancel</Button>
      </div>
    </SpecimenFrame>
  );
}

function ButtonGroupSpecimen({ discovery }: { readonly discovery: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Toolbar mode provides one tab stop, spatial arrow navigation, and an optional discoverable keyboard hint."
      itemId="button-group"
      title="Editing actions"
    >
      <ButtonGroup
        {...(discovery
          ? { keyboardHint: "Use Left and Right Arrow to move between actions." }
          : {})}
        label="Editing actions"
        mode={discovery ? "toolbar" : "group"}
      >
        <Button variant="secondary">Undo</Button>
        <Button variant="secondary">Redo</Button>
        <Button variant="secondary">Compare</Button>
      </ButtonGroup>
    </SpecimenFrame>
  );
}

function CopyButtonSpecimen({ allowFallback }: { readonly allowFallback: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Copy the immutable reference. If Clipboard access is unavailable, the optional local fallback preserves the same status sequence."
      itemId="copy-button"
      title="Copy reference"
    >
      <div style={actionRowStyle}>
        <code>MRG-2026-0719</code>
        <CopyButton
          allowFallback={allowFallback}
          copiedLabel="Reference copied"
          copyingLabel="Copying reference"
          copyLabel="Copy reference"
          errorLabel="Reference could not be copied"
          text="MRG-2026-0719"
        />
      </div>
    </SpecimenFrame>
  );
}

function PlusIcon(): ReactElement {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function IconButtonSpecimen({ tooltip }: { readonly tooltip: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The accessible label is always present; the optional native tooltip adds concise pointer context without renaming the action."
      itemId="icon-button"
      title="Compact action"
    >
      <div style={actionRowStyle}>
        <IconButton
          label="Add comparison"
          {...(tooltip ? { tooltip: "Add a comparison after the selected result" } : {})}
        >
          <PlusIcon />
        </IconButton>
      </div>
    </SpecimenFrame>
  );
}

function LinkSpecimen({ context }: { readonly context: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="External navigation always receives safe target handling; optional visible context announces the new browsing context."
      itemId="link"
      title="External reference"
    >
      <div style={actionRowStyle}>
        <Link
          external
          externalContext={context ? "New tab" : false}
          href="https://www.w3.org/WAI/ARIA/apg/"
          standalone
        >
          Open ARIA patterns
        </Link>
      </div>
    </SpecimenFrame>
  );
}

function SegmentedControlSpecimen({ summary }: { readonly summary: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Native radios preserve serialization and reset while the optional live rail keeps the current density explicit."
      itemId="segmented-control"
      title="Preview density"
    >
      <form>
        <SegmentedControl
          defaultValue="comfortable"
          label="Preview density"
          name="preview-density"
          {...(summary
            ? {
                renderSelectionSummary: (value: string | undefined) =>
                  `Current density: ${value ?? "none"}`,
              }
            : {})}
        >
          <SegmentedControlItem value="compact">Compact</SegmentedControlItem>
          <SegmentedControlItem value="comfortable">Comfortable</SegmentedControlItem>
          <SegmentedControlItem value="spacious">Spacious</SegmentedControlItem>
        </SegmentedControl>
      </form>
    </SpecimenFrame>
  );
}

function ToggleSpecimen({ pending }: { readonly pending: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Pressed state remains controlled by native activation; pending protection freezes the value and exposes progress without removing focus."
      itemId="toggle"
      title="Preview preference"
    >
      <div style={actionRowStyle}>
        <Toggle defaultPressed pending={pending} pendingLabel="Updating line numbers">
          Show line numbers
        </Toggle>
      </div>
    </SpecimenFrame>
  );
}

function ToggleGroupSpecimen({ summary }: { readonly summary: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Roving focus and non-empty single selection remain concise; the optional live rail names the active layout."
      itemId="toggle-group"
      title="Workbench layout"
    >
      <ToggleGroup
        defaultValue="balanced"
        label="Workbench layout"
        {...(summary
          ? {
              renderSelectionSummary: (values: readonly string[]) =>
                `Current layout: ${values[0] ?? "none"}`,
            }
          : {})}
        type="single"
      >
        <ToggleGroupItem value="focused">Focused</ToggleGroupItem>
        <ToggleGroupItem value="balanced">Balanced</ToggleGroupItem>
        <ToggleGroupItem value="wide">Wide</ToggleGroupItem>
      </ToggleGroup>
    </SpecimenFrame>
  );
}

const onlyControl = (name: keyof ActionsSelectionProofArgs) => ({
  controls: { include: [name] },
});

const meta = {
  args: {
    clipboardFallback: false,
    destructiveConfirmation: false,
    externalContext: false,
    iconTooltip: false,
    pendingFeedback: false,
    selectionSummaries: false,
    toolbarDiscovery: false,
  },
  argTypes: {
    clipboardFallback: {
      control: "boolean",
      description: "Allow the local textarea fallback when Clipboard access is unavailable.",
    },
    destructiveConfirmation: {
      control: "boolean",
      description: "Require a second activation for destructive menu items.",
    },
    externalContext: {
      control: "boolean",
      description: "Add visible and announced new-context text to the external link.",
    },
    iconTooltip: {
      control: "boolean",
      description: "Add optional pointer tooltip text without replacing the accessible name.",
    },
    pendingFeedback: {
      control: "boolean",
      description: "Expose busy semantics, replacement copy, and duplicate-activation protection.",
    },
    selectionSummaries: {
      control: "boolean",
      description: "Add the component-owned polite selection summary rail.",
    },
    toolbarDiscovery: {
      control: "boolean",
      description: "Use roving toolbar navigation and render its keyboard discovery hint.",
    },
  },
  parameters: { a11y: { test: "error" }, layout: "centered" },
  title: "P2/Actions and Selection - component proof",
} satisfies Meta<ActionsSelectionProofArgs>;

export default meta;
type Story = StoryObj<ActionsSelectionProofArgs>;

export const BasicActionMenu: Story = {
  args: { destructiveConfirmation: false },
  name: "Action Menu - Basic",
  parameters: onlyControl("destructiveConfirmation"),
  render: (args) => <ActionMenuSpecimen confirmDestructiveActions={args.destructiveConfirmation} />,
};

export const RecommendedActionMenu: Story = {
  args: { destructiveConfirmation: true },
  name: "Action Menu - Recommended Mergora",
  parameters: onlyControl("destructiveConfirmation"),
  render: (args) => <ActionMenuSpecimen confirmDestructiveActions={args.destructiveConfirmation} />,
};

export const BasicButton: Story = {
  args: { pendingFeedback: false },
  name: "Button - Basic",
  parameters: onlyControl("pendingFeedback"),
  render: (args) => <ButtonSpecimen pending={args.pendingFeedback} />,
};

export const RecommendedButton: Story = {
  args: { pendingFeedback: true },
  name: "Button - Recommended Mergora",
  parameters: onlyControl("pendingFeedback"),
  render: (args) => <ButtonSpecimen pending={args.pendingFeedback} />,
};

export const BasicButtonGroup: Story = {
  args: { toolbarDiscovery: false },
  name: "Button Group - Basic",
  parameters: onlyControl("toolbarDiscovery"),
  render: (args) => <ButtonGroupSpecimen discovery={args.toolbarDiscovery} />,
};

export const RecommendedButtonGroup: Story = {
  args: { toolbarDiscovery: true },
  name: "Button Group - Recommended Mergora",
  parameters: onlyControl("toolbarDiscovery"),
  render: (args) => <ButtonGroupSpecimen discovery={args.toolbarDiscovery} />,
};

export const BasicCopyButton: Story = {
  args: { clipboardFallback: false },
  name: "Copy Button - Basic",
  parameters: onlyControl("clipboardFallback"),
  render: (args) => <CopyButtonSpecimen allowFallback={args.clipboardFallback} />,
};

export const RecommendedCopyButton: Story = {
  args: { clipboardFallback: true },
  name: "Copy Button - Recommended Mergora",
  parameters: onlyControl("clipboardFallback"),
  render: (args) => <CopyButtonSpecimen allowFallback={args.clipboardFallback} />,
};

export const BasicIconButton: Story = {
  args: { iconTooltip: false },
  name: "Icon Button - Basic",
  parameters: onlyControl("iconTooltip"),
  render: (args) => <IconButtonSpecimen tooltip={args.iconTooltip} />,
};

export const RecommendedIconButton: Story = {
  args: { iconTooltip: true },
  name: "Icon Button - Recommended Mergora",
  parameters: onlyControl("iconTooltip"),
  render: (args) => <IconButtonSpecimen tooltip={args.iconTooltip} />,
};

export const BasicLink: Story = {
  args: { externalContext: false },
  name: "Link - Basic",
  parameters: onlyControl("externalContext"),
  render: (args) => <LinkSpecimen context={args.externalContext} />,
};

export const RecommendedLink: Story = {
  args: { externalContext: true },
  name: "Link - Recommended Mergora",
  parameters: onlyControl("externalContext"),
  render: (args) => <LinkSpecimen context={args.externalContext} />,
};

export const BasicSegmentedControl: Story = {
  args: { selectionSummaries: false },
  name: "Segmented Control - Basic",
  parameters: onlyControl("selectionSummaries"),
  render: (args) => <SegmentedControlSpecimen summary={args.selectionSummaries} />,
};

export const RecommendedSegmentedControl: Story = {
  args: { selectionSummaries: true },
  name: "Segmented Control - Recommended Mergora",
  parameters: onlyControl("selectionSummaries"),
  render: (args) => <SegmentedControlSpecimen summary={args.selectionSummaries} />,
};

export const BasicToggle: Story = {
  args: { pendingFeedback: false },
  name: "Toggle - Basic",
  parameters: onlyControl("pendingFeedback"),
  render: (args) => <ToggleSpecimen pending={args.pendingFeedback} />,
};

export const RecommendedToggle: Story = {
  args: { pendingFeedback: true },
  name: "Toggle - Recommended Mergora",
  parameters: onlyControl("pendingFeedback"),
  render: (args) => <ToggleSpecimen pending={args.pendingFeedback} />,
};

export const BasicToggleGroup: Story = {
  args: { selectionSummaries: false },
  name: "Toggle Group - Basic",
  parameters: onlyControl("selectionSummaries"),
  render: (args) => <ToggleGroupSpecimen summary={args.selectionSummaries} />,
};

export const RecommendedToggleGroup: Story = {
  args: { selectionSummaries: true },
  name: "Toggle Group - Recommended Mergora",
  parameters: onlyControl("selectionSummaries"),
  render: (args) => <ToggleGroupSpecimen summary={args.selectionSummaries} />,
};
