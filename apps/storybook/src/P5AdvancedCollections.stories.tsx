import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactElement } from "react";

import { Autocomplete } from "../../../registry/source/components/autocomplete/index.ts";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "../../../registry/source/components/command-palette/index.ts";
import { CreatableSelect } from "../../../registry/source/components/creatable-select/index.ts";
import { MentionField } from "../../../registry/source/components/mention-field/index.ts";
import { MultiSelect } from "../../../registry/source/components/multi-select/index.ts";
import { TagsInput } from "../../../registry/source/components/tags-input/index.ts";
import { TransferList } from "../../../registry/source/components/transfer-list/index.ts";
import "mergora-tokens/tokens.css";

type Kind =
  | "autocomplete"
  | "command-palette"
  | "creatable-select"
  | "mention-field"
  | "multi-select"
  | "tags-input"
  | "transfer-list";

interface StoryProps {
  readonly kind: Kind;
  readonly showMatchContext: boolean;
  readonly showExecutionPreview: boolean;
  readonly showCanonicalPreview: boolean;
  readonly showMentionSummary: boolean;
  readonly showSelectionSummary: boolean;
  readonly limitSelections: boolean;
  readonly collapseSelectedTokens: boolean;
  readonly recoverDuplicates: boolean;
  readonly reorderable: boolean;
  readonly showTransferSummary: boolean;
  readonly filterable: boolean;
  readonly embeddedPalette: boolean;
  readonly multiEntityTriggers: boolean;
}

const options = [
  {
    id: "tokens",
    value: "tokens",
    label: "Design tokens",
    description: "Semantic aliases and theme output",
  },
  {
    id: "components",
    value: "components",
    label: "Components",
    description: "Interactive source building blocks",
  },
  {
    id: "evidence",
    value: "evidence",
    label: "Quality evidence",
    description: "Browser and accessibility results",
  },
  {
    id: "documentation",
    value: "documentation",
    label: "Documentation",
    description: "Usage guidance and API reference",
  },
  {
    id: "archive",
    value: "archive",
    label: "Archived notes",
    description: "Read-only historical material",
    disabled: true,
  },
] as const;

const commands: readonly CommandPaletteItem[] = [
  {
    id: "open-tokens",
    label: "Open design tokens",
    description: "Inspect semantic aliases and output formats.",
    group: "Browse",
    shortcut: "G T",
  },
  {
    children: [
      {
        id: "open-components",
        label: "Open components",
        description: "Browse implementation and interaction evidence.",
      },
      {
        id: "open-systems",
        label: "Open systems",
        description: "Browse composed patterns and workflows.",
      },
    ],
    group: "Browse",
    id: "open-catalog",
    label: "Open catalog page",
    pageLabel: "Catalog pages",
  },
  {
    id: "run-checks",
    label: "Run focused checks",
    description: "Starts the current component verification task.",
    group: "Quality",
    shortcut: "R C",
  },
  {
    id: "review-evidence",
    label: "Review evidence",
    description: "Opens current browser and accessibility results.",
    group: "Quality",
  },
  {
    id: "publish",
    label: "Publish release",
    description: "Unavailable until release gates pass.",
    group: "Release",
    disabled: true,
  },
];

const mentionOptions = [
  {
    id: "tokens",
    label: "Design tokens",
    description: "Semantic aliases and theme output",
    entityType: "person",
    trigger: "@",
  },
  {
    id: "components",
    label: "Components",
    description: "Interactive source building blocks",
    entityType: "person",
    trigger: "@",
  },
  {
    id: "accessibility",
    label: "Accessibility",
    description: "Keyboard and assistive-technology evidence",
    entityType: "topic",
    trigger: "#",
  },
] as const;

const disabledEnhancements = {
  showMatchContext: false,
  showExecutionPreview: false,
  showCanonicalPreview: false,
  showMentionSummary: false,
  showSelectionSummary: false,
  limitSelections: false,
  collapseSelectedTokens: false,
  recoverDuplicates: false,
  reorderable: false,
  showTransferSummary: false,
  filterable: false,
  embeddedPalette: false,
  multiEntityTriggers: false,
} as const;

function ComponentExample(args: StoryProps): ReactElement {
  switch (args.kind) {
    case "autocomplete":
      return (
        <Autocomplete
          label="Find a catalog area"
          options={options}
          description="Type to narrow the available areas."
          showMatchContext={args.showMatchContext}
        />
      );
    case "command-palette":
      return (
        <CommandPalette
          commands={commands}
          defaultOpen
          description="Search actions, inspect their effect, and run one without leaving the keyboard."
          label="Workspace commands"
          onCommand={() => undefined}
          presentation={args.embeddedPalette ? "embedded" : "modal"}
          showExecutionPreview={args.showExecutionPreview}
        />
      );
    case "creatable-select":
      return (
        <CreatableSelect
          defaultValue="tokens"
          label="Catalog label"
          onCreate={() => undefined}
          options={options}
          showCanonicalPreview={args.showCanonicalPreview}
          formatCanonicalValue={(value) => value.trim().toLocaleLowerCase().replace(/\s+/gu, "-")}
        />
      );
    case "mention-field":
      return (
        <MentionField
          defaultValue="Please review @Design-tokens before the next check."
          label="Review note"
          options={
            args.multiEntityTriggers
              ? mentionOptions
              : mentionOptions.filter((option) => option.trigger === "@")
          }
          showMentionSummary={args.showMentionSummary}
          {...(args.multiEntityTriggers
            ? {
                triggers: [
                  { entityType: "person", label: "People", symbol: "@" },
                  { entityType: "topic", label: "Topics", symbol: "#" },
                ],
              }
            : {})}
        />
      );
    case "multi-select":
      return (
        <MultiSelect
          defaultValue={["tokens", "evidence"]}
          label="Areas included in review"
          options={options}
          showSelectionSummary={args.showSelectionSummary}
          {...(args.limitSelections ? { maximum: 3 } : {})}
          {...(args.collapseSelectedTokens ? { maximumVisibleTokens: 1 } : {})}
        />
      );
    case "tags-input":
      return (
        <TagsInput
          defaultValue={["keyboard", "responsive"]}
          label="Evidence tags"
          recoverDuplicates={args.recoverDuplicates}
          reorderable={args.reorderable}
        />
      );
    case "transfer-list":
      return (
        <TransferList
          defaultValue={["tokens", "evidence"]}
          items={options}
          label="Review scope"
          filterable={args.filterable}
          showTransferSummary={args.showTransferSummary}
        />
      );
  }
}

function StorySurface(args: StoryProps): ReactElement {
  return (
    <main style={{ inlineSize: "min(42rem, 100%)" }}>
      <h1>Advanced collection workbench</h1>
      <ComponentExample {...args} />
    </main>
  );
}

const meta = {
  title: "P5/Advanced Collections",
  component: StorySurface,
  parameters: { layout: "padded", a11y: { test: "error" } },
  argTypes: {
    kind: {
      control: "select",
      options: [
        "autocomplete",
        "command-palette",
        "creatable-select",
        "mention-field",
        "multi-select",
        "tags-input",
        "transfer-list",
      ],
    },
    showMatchContext: { control: "boolean" },
    showExecutionPreview: { control: "boolean" },
    showCanonicalPreview: { control: "boolean" },
    showMentionSummary: { control: "boolean" },
    showSelectionSummary: { control: "boolean" },
    limitSelections: { control: "boolean" },
    collapseSelectedTokens: { control: "boolean" },
    recoverDuplicates: { control: "boolean" },
    reorderable: { control: "boolean" },
    showTransferSummary: { control: "boolean" },
    filterable: { control: "boolean" },
    embeddedPalette: { control: "boolean" },
    multiEntityTriggers: { control: "boolean" },
  },
} satisfies Meta<typeof StorySurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicAutocomplete: Story = {
  args: { ...disabledEnhancements, kind: "autocomplete" },
  name: "Autocomplete · basic",
};
export const RecommendedAutocomplete: Story = {
  args: { ...disabledEnhancements, kind: "autocomplete", showMatchContext: true },
  name: "Autocomplete · Recommended Mergora",
};
export const BasicCommandPalette: Story = {
  args: { ...disabledEnhancements, kind: "command-palette" },
  name: "Command Palette · basic",
};
export const RecommendedCommandPalette: Story = {
  args: {
    ...disabledEnhancements,
    embeddedPalette: true,
    kind: "command-palette",
    showExecutionPreview: true,
  },
  name: "Command Palette · Recommended Mergora",
};
export const BasicCreatableSelect: Story = {
  args: { ...disabledEnhancements, kind: "creatable-select" },
  name: "Creatable Select · basic",
};
export const RecommendedCreatableSelect: Story = {
  args: { ...disabledEnhancements, kind: "creatable-select", showCanonicalPreview: true },
  name: "Creatable Select · Recommended Mergora",
};
export const BasicMentionField: Story = {
  args: { ...disabledEnhancements, kind: "mention-field" },
  name: "Mention Field · basic",
};
export const RecommendedMentionField: Story = {
  args: {
    ...disabledEnhancements,
    kind: "mention-field",
    multiEntityTriggers: true,
    showMentionSummary: true,
  },
  name: "Mention Field · Recommended Mergora",
};
export const BasicMultiSelect: Story = {
  args: { ...disabledEnhancements, kind: "multi-select" },
  name: "Multi Select · basic",
};
export const RecommendedMultiSelect: Story = {
  args: {
    ...disabledEnhancements,
    collapseSelectedTokens: true,
    kind: "multi-select",
    limitSelections: true,
    showSelectionSummary: true,
  },
  name: "Multi Select · Recommended Mergora",
};
export const BasicTagsInput: Story = {
  args: { ...disabledEnhancements, kind: "tags-input" },
  name: "Tags Input · basic",
};
export const RecommendedTagsInput: Story = {
  args: {
    ...disabledEnhancements,
    kind: "tags-input",
    recoverDuplicates: true,
    reorderable: true,
  },
  name: "Tags Input · Recommended Mergora",
};
export const BasicTransferList: Story = {
  args: { ...disabledEnhancements, kind: "transfer-list" },
  name: "Transfer List · basic",
};
export const RecommendedTransferList: Story = {
  args: {
    ...disabledEnhancements,
    filterable: true,
    kind: "transfer-list",
    showTransferSummary: true,
  },
  name: "Transfer List · Recommended Mergora",
};

function CatalogCapabilitiesWorkbench(): ReactElement {
  const [activity, setActivity] = useState("No collection action yet.");
  return (
    <main style={{ display: "grid", gap: "2rem", inlineSize: "min(46rem, 100%)" }}>
      <h1>Catalog capability evidence</h1>
      <CommandPalette
        commands={commands}
        description="Search catalog and quality actions."
        label="Catalog commands"
        navigationAdapter={{ navigate: (command) => setActivity(`Navigated to ${command.label}.`) }}
        onCommand={(command) => setActivity(`Ran ${command.label}.`)}
        presentation="embedded"
        showExecutionPreview
      />
      <MultiSelect
        defaultValue={["tokens", "components", "evidence"]}
        label="Bounded review areas"
        maximum={3}
        maximumVisibleTokens={1}
        options={options}
        showSelectionSummary
      />
      <TagsInput
        defaultValue={["keyboard", "responsive"]}
        delimiters={[",", ";", "\n"]}
        label="Ordered evidence tags"
        recoverDuplicates
        reorderable
        validateTag={(tag) => (tag.length < 3 ? "Use at least three characters." : null)}
      />
      <CreatableSelect
        label="Async catalog label"
        onCreate={(next, { signal }) => {
          setActivity(`Creating ${next}.`);
          if (!next.toLocaleLowerCase().includes("pending")) return Promise.resolve();
          return new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                setActivity(`Aborted ${next}.`);
                reject(new DOMException("Creation aborted", "AbortError"));
              },
              { once: true },
            );
          });
        }}
        onValueChange={(next, reason) => setActivity(`${reason}: ${next ?? "empty"}.`)}
        options={options}
        showCanonicalPreview
        validateCreate={(next) => (next.length < 3 ? "Use at least three characters." : null)}
      />
      <MentionField
        label="Entity-aware note"
        onQueryChange={(query) =>
          setActivity(
            query === null
              ? "Mention query closed."
              : `Searching ${query.entityType} for ${query.query || "all"}.`,
          )
        }
        options={mentionOptions}
        showMentionSummary
        triggers={[
          { entityType: "person", label: "People", symbol: "@" },
          { entityType: "topic", label: "Topics", symbol: "#" },
        ]}
      />
      <TransferList
        defaultValue={["evidence"]}
        filterable
        items={options}
        label="Filterable review scope"
        showTransferSummary
      />
      <output data-testid="catalog-capability-output">{activity}</output>
    </main>
  );
}

export const CatalogCapabilities: Story = {
  args: { ...disabledEnhancements, kind: "multi-select" },
  render: () => <CatalogCapabilitiesWorkbench />,
};

export const AsyncRemoteStates: Story = {
  args: { ...disabledEnhancements, kind: "autocomplete" },
  render: () => (
    <main style={{ display: "grid", gap: "1.5rem", inlineSize: "min(42rem, 100%)" }}>
      <h1>Remote collection states</h1>
      <Autocomplete label="Loading catalog areas" loading onRetry={() => undefined} options={[]} />
      <MultiSelect
        label="Unavailable areas"
        loadError="Areas could not be loaded."
        onRetry={() => undefined}
        options={[]}
      />
      <CommandPalette
        commands={[]}
        label="Loading commands"
        loading
        onCommand={() => undefined}
        presentation="embedded"
      />
      <MentionField label="Loading entity suggestions" loading options={[]} />
      <CreatableSelect
        creating
        defaultValue="New catalog area"
        label="Creating an area"
        onCancelCreate={() => undefined}
        onCreate={() => undefined}
        options={[]}
      />
    </main>
  ),
};

function ControlledFormWorkbench(): ReactElement {
  const [single, setSingle] = useState<string | null>("components");
  const [multi, setMulti] = useState<readonly string[]>(["tokens"]);
  const [tags, setTags] = useState<readonly string[]>(["keyboard"]);
  const [transferred, setTransferred] = useState<readonly string[]>(["evidence"]);
  const [formOutput, setFormOutput] = useState("No submission yet.");
  return (
    <form
      aria-label="Advanced collection form"
      onReset={() => {
        setSingle("components");
        setMulti(["tokens"]);
        setTags(["keyboard"]);
        setTransferred(["evidence"]);
        setFormOutput("Defaults restored.");
      }}
      onSubmit={(event) => {
        event.preventDefault();
        setFormOutput(JSON.stringify(Array.from(new FormData(event.currentTarget).entries())));
      }}
      style={{ display: "grid", gap: "1.5rem", inlineSize: "min(42rem, 100%)" }}
    >
      <h1>Controlled collection form</h1>
      <CreatableSelect
        label="Primary area"
        name="primary"
        onCreate={() => undefined}
        onValueChange={setSingle}
        options={options}
        required
        showCanonicalPreview
        value={single}
      />
      <MultiSelect
        label="Additional areas"
        name="areas"
        onValueChange={setMulti}
        options={options}
        required
        showSelectionSummary
        value={multi}
      />
      <TagsInput
        label="Evidence tags"
        name="tags"
        onValueChange={setTags}
        recoverDuplicates
        required
        value={tags}
      />
      <TransferList
        items={options}
        label="Included scope"
        name="scope"
        onValueChange={setTransferred}
        required
        showTransferSummary
        value={transferred}
      />
      <div>
        <button type="submit">Inspect form values</button>{" "}
        <button type="reset">Restore defaults</button>
      </div>
      <output data-testid="advanced-form-output">{formOutput}</output>
    </form>
  );
}

export const ControlledAndForms: Story = {
  args: { ...disabledEnhancements, kind: "multi-select" },
  render: () => <ControlledFormWorkbench />,
};

export const StateMatrix: Story = {
  args: { ...disabledEnhancements, kind: "autocomplete" },
  render: () => (
    <main style={{ display: "grid", gap: "1.5rem", inlineSize: "min(42rem, 100%)" }}>
      <h1>Advanced collection state matrix</h1>
      <Autocomplete disabled label="Disabled autocomplete" options={options} />
      <MentionField
        defaultValue="Read-only @Design-tokens note"
        label="Read-only note"
        options={options}
        readOnly
      />
      <MultiSelect
        errorMessage="Choose at least one available area."
        invalid
        label="Invalid review areas"
        options={options}
        required
      />
      <TagsInput disabled defaultValue={["locked"]} label="Disabled tags" />
      <TransferList items={options} label="Read-only transfer" readOnly defaultValue={["tokens"]} />
    </main>
  ),
};

export const EmptyAndError: Story = {
  args: { ...disabledEnhancements, kind: "creatable-select" },
  render: () => (
    <main style={{ display: "grid", gap: "1.5rem", inlineSize: "min(42rem, 100%)" }}>
      <h1>Empty and error states</h1>
      <Autocomplete
        label="Empty catalog"
        loadError="Suggestions could not be loaded."
        onRetry={() => undefined}
        options={[]}
        emptyMessage="The catalog has no areas yet."
      />
      <CommandPalette
        commands={[]}
        emptyMessage="No commands match this workspace."
        label="Unavailable commands"
        loadError="Commands could not be loaded."
        onCommand={() => undefined}
        onRetry={() => undefined}
        presentation="embedded"
      />
      <CreatableSelect
        errorMessage="Use a unique, descriptive label."
        invalid
        label="Invalid label"
        onCreate={() => undefined}
        options={[]}
        showCanonicalPreview
      />
      <MultiSelect
        loadError="The areas could not be loaded."
        label="Unavailable areas"
        onRetry={() => undefined}
        options={[]}
      />
      <MentionField
        errorMessage="Choose a recognized entity."
        invalid
        label="Invalid entity note"
        options={[]}
      />
      <TagsInput label="Empty evidence tags" />
      <TransferList
        errorMessage="The scope is unavailable."
        invalid
        items={[]}
        label="Unavailable scope"
        showTransferSummary
      />
    </main>
  ),
};

export const NarrowRtlAndPreferences: Story = {
  args: { ...disabledEnhancements, kind: "transfer-list" },
  render: () => (
    <main
      dir="rtl"
      style={{ display: "grid", gap: "1.5rem", inlineSize: 320, maxInlineSize: "100%" }}
    >
      <h1>مجموعة متقدمة بعرض ضيق</h1>
      <Autocomplete label="البحث في الفهرس" options={options} showMatchContext />
      <CommandPalette
        commands={commands}
        description="Search and run one catalog command."
        label="Workspace commands"
        onCommand={() => undefined}
        presentation="embedded"
        showExecutionPreview
      />
      <CreatableSelect
        defaultValue="tokens"
        label="Catalog label"
        onCreate={() => undefined}
        options={options}
        showCanonicalPreview
      />
      <MentionField
        defaultValue="Review @Components before the next check."
        label="Review note"
        options={mentionOptions.filter((option) => option.trigger === "@")}
        showMentionSummary
      />
      <MultiSelect label="المجالات المختارة" options={options} showSelectionSummary />
      <TagsInput
        defaultValue={["keyboard", "responsive"]}
        label="Evidence tags"
        recoverDuplicates
        reorderable
      />
      <TransferList
        destinationLabel="مضمن"
        items={options}
        label="نطاق المراجعة"
        showTransferSummary
        sourceLabel="متاح"
      />
    </main>
  ),
};

export const KeyboardAndScreenReader: Story = {
  args: { ...disabledEnhancements, kind: "mention-field", showMentionSummary: true },
  render: (args) => (
    <main style={{ display: "grid", gap: "1.5rem", inlineSize: "min(42rem, 100%)" }}>
      <h1>Keyboard and screen-reader practice</h1>
      <p>
        Use Tab, arrow keys, Home, End, Enter, Escape, and native multiple-selection keys. Live
        context is opt-in and system forced-colors and reduced-motion preferences are honored.
      </p>
      <ComponentExample {...args} />
      <TagsInput
        label="Duplicate recovery practice"
        defaultValue={["keyboard"]}
        recoverDuplicates
      />
    </main>
  ),
};
