import { useState, type AnchorHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { ActionMenu } from "../../../registry/source/components/action-menu/action-menu";
import { Button } from "../../../registry/source/components/button/button";
import {
  ButtonGroup,
  markButtonGroupAction,
} from "../../../registry/source/components/button-group/button-group";
import { CopyButton } from "../../../registry/source/components/copy-button/copy-button";
import { IconButton } from "../../../registry/source/components/icon-button/icon-button";
import { LayerManager } from "../../../registry/source/components/layer-manager/layer-manager";
import { Link } from "../../../registry/source/components/link/link";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../../../registry/source/components/segmented-control/segmented-control";
import { Toggle } from "../../../registry/source/components/toggle/toggle";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../../registry/source/components/toggle-group/toggle-group";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  padding: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--mrg-semantic-space-stack-lg)",
  marginInline: "auto",
  maxInlineSize: "var(--mrg-semantic-size-content-default)",
  minInlineSize: 0,
} satisfies CSSProperties;

const railStyle = {
  alignItems: "center",
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-space-stack-sm)",
  minInlineSize: 0,
  paddingBlockStart: "var(--mrg-semantic-space-stack-sm)",
} satisfies CSSProperties;

const specimenStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--mrg-semantic-space-stack-sm)",
  minInlineSize: 0,
  padding: "var(--mrg-semantic-density-panel-padding)",
} satisfies CSSProperties;

interface WorkbenchControls {
  readonly clipboardFallback: boolean;
  readonly destructiveConfirmation: boolean;
  readonly externalContext: boolean;
  readonly iconTooltip: boolean;
  readonly pendingFeedback: boolean;
  readonly selectionSummaries: boolean;
  readonly toolbarDiscovery: boolean;
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

const RouterEvidenceAction = markButtonGroupAction(function RouterEvidenceAction(
  props: AnchorHTMLAttributes<HTMLAnchorElement>,
) {
  return <a {...props} />;
});

function Canvas({
  children,
  direction = "ltr",
  locale = direction === "rtl" ? "ar-EG" : "en-US",
}: {
  readonly children: ReactNode;
  readonly direction?: "ltr" | "rtl";
  readonly locale?: string;
}) {
  return (
    <MergoraProvider direction={direction} locale={locale}>
      <LayerManager.Provider>
        <main style={canvasStyle}>
          <div style={workbenchStyle}>{children}</div>
        </main>
      </LayerManager.Provider>
    </MergoraProvider>
  );
}

function BasicDefaultsWorkbench({
  clipboardFallback,
  destructiveConfirmation,
  externalContext,
  iconTooltip,
  pendingFeedback,
  selectionSummaries,
  toolbarDiscovery,
}: WorkbenchControls) {
  const [submission, setSubmission] = useState("No form submission yet");
  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Basic action defaults</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Native actions and selection remain concise when every optional enhancement is absent.
        </p>
      </header>
      <section aria-labelledby="basic-actions-heading" style={specimenStyle}>
        <h2 id="basic-actions-heading" style={{ margin: 0 }}>
          Actions
        </h2>
        <div style={railStyle}>
          <Button pending={pendingFeedback} pendingLabel="Saving document">
            Save document
          </Button>
          <IconButton
            label="Add section"
            pending={pendingFeedback}
            pendingLabel="Adding section"
            {...(iconTooltip ? { tooltip: "Add a section after the current one" } : {})}
          >
            <PlusIcon />
          </IconButton>
          <CopyButton allowFallback={clipboardFallback} text="document-42" />
          <Link
            external
            externalContext={externalContext ? "New tab" : false}
            href="https://example.com/document-details"
          >
            Document details
          </Link>
          <ActionMenu
            confirmDestructiveActions={destructiveConfirmation}
            items={[
              { id: "rename", label: "Rename document" },
              { id: "duplicate", label: "Duplicate document" },
              {
                confirmLabel: "Confirm delete document",
                id: "delete",
                intent: "destructive",
                label: "Delete document",
              },
            ]}
            label="Document actions"
          />
        </div>
      </section>
      <form
        onReset={() => setSubmission("Form reset to the saved view")}
        onSubmit={(event) => {
          event.preventDefault();
          const view = new FormData(event.currentTarget).get("view");
          setSubmission(`Submitted view: ${String(view)}`);
        }}
        style={specimenStyle}
      >
        <h2 style={{ margin: 0 }}>Native form and reset</h2>
        <Toggle pending={pendingFeedback} pendingLabel="Updating pin">
          Pin document
        </Toggle>
        <ToggleGroup
          defaultValue="preview"
          label="Display mode"
          {...(selectionSummaries
            ? {
                renderSelectionSummary: (values: readonly string[]) =>
                  `Selected display mode: ${values[0] ?? "none"}`,
              }
            : {})}
          type="single"
        >
          <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
          <ToggleGroupItem value="outline">Outline</ToggleGroupItem>
        </ToggleGroup>
        <SegmentedControl
          defaultValue="comfortable"
          label="View density"
          name="view"
          {...(selectionSummaries
            ? {
                renderSelectionSummary: (value: string | undefined) =>
                  `Selected density: ${value ?? "none"}`,
              }
            : {})}
          required
        >
          <SegmentedControlItem value="comfortable">Comfortable</SegmentedControlItem>
          <SegmentedControlItem value="compact">Compact</SegmentedControlItem>
        </SegmentedControl>
        <ButtonGroup
          {...(toolbarDiscovery ? { keyboardHint: "Arrow keys move focus; Enter activates." } : {})}
          label="Form actions"
          mode={toolbarDiscovery ? "toolbar" : "group"}
        >
          <Button type="submit">Apply view</Button>
          <Button type="reset" variant="secondary">
            Reset
          </Button>
        </ButtonGroup>
        <output aria-live="polite">{submission}</output>
      </form>
    </Canvas>
  );
}

function RecommendedWorkbench({
  clipboardFallback,
  destructiveConfirmation,
  externalContext,
  iconTooltip,
  pendingFeedback,
  selectionSummaries,
  toolbarDiscovery,
}: WorkbenchControls) {
  const [layout, setLayout] = useState<string | null>("balanced");
  const [density, setDensity] = useState("comfortable");
  const [menuResult, setMenuResult] = useState("No action selected");
  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Recommended Mergora actions</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Workbench rails expose progress, navigation context, keyboard discovery, selection
          summaries, and safer destructive actions only when requested.
        </p>
      </header>
      <section aria-labelledby="recommended-actions-heading" style={specimenStyle}>
        <h2 id="recommended-actions-heading" style={{ margin: 0 }}>
          Context-aware actions
        </h2>
        <div style={railStyle}>
          <Button pending={pendingFeedback} pendingLabel="Saving document" variant="primary">
            Save document
          </Button>
          <IconButton
            {...(iconTooltip ? { tooltip: "Add a section after the current one" } : {})}
            label="Add section"
            pending={pendingFeedback}
            pendingLabel="Adding section"
          >
            <PlusIcon />
          </IconButton>
          <CopyButton
            allowFallback={clipboardFallback}
            copyLabel="Copy document id"
            text="document-42"
          />
          <Link
            external
            externalContext={externalContext ? "New tab" : false}
            href="https://example.com/reference"
          >
            Open reference
          </Link>
        </div>
      </section>
      <section aria-labelledby="recommended-selection-heading" style={specimenStyle}>
        <h2 id="recommended-selection-heading" style={{ margin: 0 }}>
          Discoverable selection
        </h2>
        <ButtonGroup
          {...(toolbarDiscovery ? { keyboardHint: "Arrow keys move focus; Enter activates." } : {})}
          label="Document editing actions"
          mode={toolbarDiscovery ? "toolbar" : "group"}
        >
          <Button variant="secondary">Undo</Button>
          <Button variant="secondary">Redo</Button>
          <Button variant="secondary">Compare</Button>
        </ButtonGroup>
        <ToggleGroup
          {...(selectionSummaries
            ? {
                renderSelectionSummary: (values: readonly string[]) =>
                  values.length === 0 ? "No layout selected" : `Selected layout: ${values[0]}`,
              }
            : {})}
          allowEmpty
          label="Page layout"
          onValueChange={setLayout}
          type="single"
          value={layout}
        >
          <ToggleGroupItem value="balanced">Balanced</ToggleGroupItem>
          <ToggleGroupItem value="focused">Focused</ToggleGroupItem>
          <ToggleGroupItem value="wide">Wide</ToggleGroupItem>
        </ToggleGroup>
        <SegmentedControl
          {...(selectionSummaries
            ? {
                renderSelectionSummary: (value: string | undefined) =>
                  `Current density: ${value ?? "none"}`,
              }
            : {})}
          label="View density"
          onValueChange={setDensity}
          value={density}
        >
          <SegmentedControlItem value="comfortable">Comfortable</SegmentedControlItem>
          <SegmentedControlItem value="compact">Compact</SegmentedControlItem>
          <SegmentedControlItem value="spacious">Spacious</SegmentedControlItem>
        </SegmentedControl>
      </section>
      <section aria-labelledby="recommended-menu-heading" style={specimenStyle}>
        <h2 id="recommended-menu-heading" style={{ margin: 0 }}>
          Consequential actions
        </h2>
        <div style={railStyle}>
          <ActionMenu
            confirmDestructiveActions={destructiveConfirmation}
            items={[
              { id: "duplicate", label: "Duplicate document" },
              {
                confirmLabel: "Confirm delete document",
                id: "delete",
                intent: "destructive",
                label: "Delete document",
                onSelect: () => setMenuResult("Document deleted"),
              },
            ]}
            label="Document actions"
          />
          <output aria-live="polite">{menuResult}</output>
        </div>
      </section>
    </Canvas>
  );
}

function InteractiveWorkbench() {
  const [toggleValue, setToggleValue] = useState<string | null>("preview");
  const [segment, setSegment] = useState("source");
  const [menuResult, setMenuResult] = useState("No menu action selected");
  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Actions and selection workbench</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Native controls expose pending, naming, selection, focus, clipboard, link, and destructive
          behavior without hiding their semantic boundaries.
        </p>
      </header>
      <section aria-labelledby="action-heading" style={specimenStyle}>
        <h2 id="action-heading" style={{ margin: 0 }}>
          Action semantics
        </h2>
        <div style={railStyle}>
          <Button>Save changes</Button>
          <Button pending pendingLabel="Saving changes">
            Save changes
          </Button>
          <IconButton label="Add evidence" tooltip="Add evidence">
            <PlusIcon />
          </IconButton>
          <CopyButton text="pnpm add mergora-ui" />
          <Link href="#evidence" standalone>
            Open evidence
          </Link>
          <Link external href="https://example.com">
            External reference
          </Link>
        </div>
      </section>
      <section aria-labelledby="selection-heading" style={specimenStyle}>
        <h2 id="selection-heading" style={{ margin: 0 }}>
          Selection semantics
        </h2>
        <div style={railStyle}>
          <Toggle>Pin evidence</Toggle>
          <ToggleGroup
            allowEmpty
            label="Workbench view"
            onValueChange={setToggleValue}
            type="single"
            value={toggleValue}
          >
            <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
            <ToggleGroupItem value="code">Code</ToggleGroupItem>
            <ToggleGroupItem disabled value="release">
              Release locked
            </ToggleGroupItem>
          </ToggleGroup>
          <SegmentedControl label="Distribution mode" onValueChange={setSegment} value={segment}>
            <SegmentedControlItem value="source">Source</SegmentedControlItem>
            <SegmentedControlItem value="package">Package</SegmentedControlItem>
            <SegmentedControlItem disabled value="cdn">
              CDN unavailable
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
      </section>
      <section aria-labelledby="menu-heading" style={specimenStyle}>
        <h2 id="menu-heading" style={{ margin: 0 }}>
          Menu composition
        </h2>
        <div style={railStyle}>
          <ActionMenu
            items={[
              {
                id: "inspect",
                label: "Inspect evidence",
                onSelect: () => setMenuResult("Evidence inspected"),
              },
              {
                id: "archive",
                label: "Archive snapshot",
                onSelect: () => setMenuResult("Snapshot archived"),
              },
              { id: "locked", label: "Publish release", disabled: true },
              {
                id: "delete",
                intent: "destructive",
                label: "Delete snapshot",
                confirmLabel: "Confirm delete snapshot",
                onSelect: () => setMenuResult("Snapshot deleted"),
              },
            ]}
            label="Snapshot actions"
          />
          <output aria-live="polite">{menuResult}</output>
        </div>
      </section>
    </Canvas>
  );
}

function DynamicRovingWorkbench() {
  const [disableUndo, setDisableUndo] = useState(false);
  const [showCompare, setShowCompare] = useState(true);
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Dynamic roving focus</h1>
      <div style={railStyle}>
        <button data-testid="disable-undo" onClick={() => setDisableUndo(true)} type="button">
          Disable Undo
        </button>
        <button data-testid="remove-compare" onClick={() => setShowCompare(false)} type="button">
          Remove Compare
        </button>
      </div>
      <ButtonGroup label="Dynamic editor actions" mode="toolbar">
        <Button disabled={disableUndo} variant="secondary">
          Undo
        </Button>
        <Button variant="secondary">Redo</Button>
        {showCompare ? <Button variant="secondary">Compare</Button> : null}
      </ButtonGroup>
      <ToggleGroup
        defaultValue={["source", "preview", "locked"]}
        label="Visible layers"
        type="multiple"
      >
        <ToggleGroupItem value="source">Source</ToggleGroupItem>
        <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
        <ToggleGroupItem disabled value="locked">
          Locked
        </ToggleGroupItem>
      </ToggleGroup>
    </Canvas>
  );
}

const meta: Meta<WorkbenchControls> = {
  argTypes: {
    clipboardFallback: { control: "boolean" },
    destructiveConfirmation: { control: "boolean" },
    externalContext: { control: "boolean" },
    iconTooltip: { control: "boolean" },
    pendingFeedback: { control: "boolean" },
    selectionSummaries: { control: "boolean" },
    toolbarDiscovery: { control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P2/Actions and Selection",
};

export default meta;
type Story = StoryObj<WorkbenchControls>;

export const BasicDefaults: Story = {
  args: {
    clipboardFallback: false,
    destructiveConfirmation: false,
    externalContext: false,
    iconTooltip: false,
    pendingFeedback: false,
    selectionSummaries: false,
    toolbarDiscovery: false,
  },
  render: (args) => <BasicDefaultsWorkbench {...args} />,
};

export const RecommendedMergora: Story = {
  args: {
    clipboardFallback: true,
    destructiveConfirmation: true,
    externalContext: true,
    iconTooltip: true,
    pendingFeedback: false,
    selectionSummaries: true,
    toolbarDiscovery: true,
  },
  render: (args) => <RecommendedWorkbench {...args} />,
};

export const EnhancementsDisabled: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Optional enhancements disabled</h1>
      <ButtonGroup keyboardHint="This must not render in group mode" label="Document actions">
        <Button variant="secondary">Rename</Button>
        <Button variant="secondary">Duplicate</Button>
      </ButtonGroup>
      <Link external externalContext={false} href="https://example.com/reference">
        Open reference
      </Link>
      <ToggleGroup defaultValue="preview" label="Display mode" type="single">
        <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
        <ToggleGroupItem value="outline">Outline</ToggleGroupItem>
      </ToggleGroup>
      <SegmentedControl defaultValue="comfortable" label="View density">
        <SegmentedControlItem value="comfortable">Comfortable</SegmentedControlItem>
        <SegmentedControlItem value="compact">Compact</SegmentedControlItem>
      </SegmentedControl>
      <ActionMenu
        confirmDestructiveActions={false}
        items={[
          {
            confirmLabel: "This confirmation must not render",
            id: "delete",
            intent: "destructive",
            label: "Delete document",
          },
        ]}
        label="Destructive document actions"
      />
    </Canvas>
  ),
};

export const ActionsWorkbench: Story = { render: () => <InteractiveWorkbench /> };

export const RovingFocus: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Roving focus maps</h1>
      <ButtonGroup label="Editor actions" mode="toolbar">
        <Button variant="secondary">Undo</Button>
        <span aria-orientation="vertical" role="separator" />
        <Button disabled variant="secondary">
          Redo unavailable
        </Button>
        <Button variant="secondary">Compare</Button>
        <RouterEvidenceAction href="#router-evidence">Router evidence</RouterEvidenceAction>
      </ButtonGroup>
      <ToggleGroup defaultValue="left" label="Alignment" type="single">
        <ToggleGroupItem value="left">Left</ToggleGroupItem>
        <ToggleGroupItem disabled value="center">
          Center unavailable
        </ToggleGroupItem>
        <ToggleGroupItem value="right">Right</ToggleGroupItem>
      </ToggleGroup>
      <SegmentedControl defaultValue="source" label="Artifact mode">
        <SegmentedControlItem value="source">Source</SegmentedControlItem>
        <SegmentedControlItem disabled value="registry">
          Registry unavailable
        </SegmentedControlItem>
        <SegmentedControlItem value="package">Package</SegmentedControlItem>
      </SegmentedControl>
    </Canvas>
  ),
};

export const DynamicRovingFocus: Story = { render: () => <DynamicRovingWorkbench /> };

export const RightToLeft: Story = {
  render: () => (
    <Canvas direction="rtl">
      <h1 style={{ margin: 0 }}>اختبار الإجراءات والاختيار</h1>
      <ToggleGroup defaultValue="preview" label="طريقة العرض" type="single">
        <ToggleGroupItem value="preview">معاينة</ToggleGroupItem>
        <ToggleGroupItem disabled value="locked">
          مقفل
        </ToggleGroupItem>
        <ToggleGroupItem value="code">الرمز</ToggleGroupItem>
      </ToggleGroup>
      <SegmentedControl defaultValue="source" label="طريقة التوزيع">
        <SegmentedControlItem value="source">المصدر</SegmentedControlItem>
        <SegmentedControlItem disabled value="locked">
          غير متاح
        </SegmentedControlItem>
        <SegmentedControlItem value="package">الحزمة</SegmentedControlItem>
      </SegmentedControl>
      <ActionMenu
        items={[
          { id: "inspect", label: "فحص الأدلة" },
          {
            description: "Permanently removes the current snapshot",
            id: "delete snapshot",
            intent: "destructive",
            label: "حذف اللقطة",
            confirmLabel: "تأكيد حذف اللقطة",
          },
        ]}
        label="إجراءات اللقطة"
        placement="end"
      />
    </Canvas>
  ),
};

export const LocalizedActionMenuTypeahead: Story = {
  render: () => (
    <Canvas direction="rtl" locale="he-IL">
      <h1 style={{ margin: 0 }}>
        {
          "\u05ea\u05e4\u05e8\u05d9\u05d8 \u05e4\u05e2\u05d5\u05dc\u05d5\u05ea \u05de\u05e7\u05d5\u05de\u05d9"
        }
      </h1>
      <ActionMenu
        items={[
          { id: "edit", label: "\u05e2\u05e8\u05d9\u05db\u05ea \u05e8\u05d0\u05d9\u05d4" },
          { id: "archive", label: "\u05d0\u05e8\u05db\u05d5\u05d1 \u05e8\u05d0\u05d9\u05d4" },
          { id: "delete", label: "\u05de\u05d7\u05d9\u05e7\u05ea \u05e8\u05d0\u05d9\u05d4" },
        ]}
        label={"\u05e4\u05e2\u05d5\u05dc\u05d5\u05ea \u05e8\u05d0\u05d9\u05d4"}
        placement="end"
      />
    </Canvas>
  ),
};

export const ClipboardStates: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Clipboard feedback</h1>
      <CopyButton copyLabel="Copy install command" text="pnpm add mergora-ui" />
      <p>Success or rejection remains visible and is announced without moving focus.</p>
    </Canvas>
  ),
};

export const ActionMenuFocus: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Action menu focus and confirmation</h1>
      <ActionMenu
        items={[
          { id: "edit", label: "Edit snapshot" },
          { id: "disabled", label: "Publish unavailable", disabled: true },
          {
            description: "Permanently removes the current snapshot",
            id: "delete snapshot",
            intent: "destructive",
            label: "Delete snapshot",
            confirmLabel: "Confirm delete snapshot",
          },
        ]}
        label="Snapshot actions"
      />
      <Button variant="secondary">After menu</Button>
    </Canvas>
  ),
};

export const ActionMenuCollision: Story = {
  render: () => (
    <Canvas>
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          justifyContent: "flex-end",
          minBlockSize: "calc(100vh - 3rem)",
        }}
      >
        <ActionMenu
          items={[
            { id: "alpha", label: "Alpha evidence" },
            { id: "beta", label: "Beta evidence" },
            { id: "gamma", label: "Gamma evidence" },
          ]}
          label="Edge actions"
          placement="end"
        />
      </div>
    </Canvas>
  ),
};

export const ActionMenuDirectionOverride: Story = {
  render: () => (
    <Canvas direction="rtl" locale="en-US">
      <h1 style={{ margin: 0 }}>Direction-independent menu placement</h1>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ActionMenu
          items={[
            { id: "inspect", label: "Inspect evidence" },
            { id: "archive", label: "Archive verification snapshot" },
          ]}
          label="Mismatch actions"
          placement="start"
        />
      </div>
    </Canvas>
  ),
};

export const PendingAndDestructive: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Pending and destructive intent</h1>
      <div style={railStyle}>
        <Button pending pendingLabel="Publishing">
          Publish
        </Button>
        <IconButton label="Delete snapshot" pending pendingLabel="Deleting" variant="destructive">
          <PlusIcon />
        </IconButton>
        <Toggle pending pendingLabel="Updating">
          Automatic updates
        </Toggle>
        <Button variant="destructive">Delete snapshot</Button>
      </div>
    </Canvas>
  ),
};

export const NarrowReflow: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>320 CSS pixel reflow</h1>
      <ButtonGroup label="Long localized actions">
        <Button variant="secondary">Arbeitsbereichsüberprüfung öffnen</Button>
        <CopyButton copyLabel="Installationsbefehl kopieren" text="pnpm add mergora-ui" />
      </ButtonGroup>
      <Toggle>Automatically synchronize independently verified provenance records</Toggle>
      <ToggleGroup defaultValue="source" label="Long localized selection actions" type="single">
        <ToggleGroupItem value="source">
          Editable independently verified source artifact
        </ToggleGroupItem>
        <ToggleGroupItem value="package">Versioned consumer package artifact</ToggleGroupItem>
      </ToggleGroup>
      <SegmentedControl defaultValue="source" label="Sehr lange Verteilungsbezeichnung">
        <SegmentedControlItem value="source">Bearbeitbarer Quellcode</SegmentedControlItem>
        <SegmentedControlItem value="package">Versioniertes Komponentenpaket</SegmentedControlItem>
        <SegmentedControlItem value="registry">
          Unveränderliche Registry-Nutzlast
        </SegmentedControlItem>
      </SegmentedControl>
      <ActionMenu
        items={[
          { id: "inspect", label: "Inspect independently verified provenance evidence" },
          { id: "archive", label: "Archive the current verification snapshot" },
        ]}
        label="Open independently verified provenance actions"
      />
      <Link href="#very-long-evidence-path" standalone>
        provenance.example/independent-consumer/actions-selection/verification
      </Link>
    </Canvas>
  ),
};
