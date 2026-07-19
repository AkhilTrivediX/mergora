import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import {
  Listbox,
  useCollectionLoader,
  type CollectionEntry,
  type CollectionKey,
} from "../../../registry/source/components/listbox/listbox";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";
import { Select } from "../../../registry/source/components/select/select";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  overflowWrap: "anywhere",
  padding: "clamp(1rem, 4vw, 3rem)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xl)",
  gridTemplateColumns: "minmax(0, 1fr)",
  marginInline: "auto",
  maxInlineSize: "64rem",
  minInlineSize: 0,
} satisfies CSSProperties;

const columnsStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xl)",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 19rem), 1fr))",
  minInlineSize: 0,
} satisfies CSSProperties;

const stateRailStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  display: "grid",
} satisfies CSSProperties;

const stateRowStyle = {
  alignItems: "start",
  borderBlockEnd:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  gridTemplateColumns: "minmax(9rem, 0.35fr) minmax(0, 1fr)",
  paddingBlock: "var(--mrg-semantic-space-inset-lg)",
} satisfies CSSProperties;

const actionsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-space-inline-sm)",
} satisfies CSSProperties;

const primaryButtonStyle = {
  background: "var(--mrg-semantic-color-action-background)",
  border: 0,
  borderRadius: "var(--mrg-semantic-radius-control)",
  color: "var(--mrg-semantic-color-action-foreground)",
  font: "inherit",
  minBlockSize: "var(--mrg-semantic-size-target-preferred)",
  paddingInline: "var(--mrg-semantic-space-inline-md)",
} satisfies CSSProperties;

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "var(--mrg-semantic-color-background-canvas)",
  border:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-interactive)",
  color: "var(--mrg-semantic-color-foreground-primary)",
} satisfies CSSProperties;

const DELIVERY_ENTRIES = [
  {
    key: "environments",
    label: "Environments",
    textValue: "Environments",
    type: "section",
    items: [
      { key: "preview", textValue: "Preview" },
      { key: "staging", textValue: "Staging" },
      { key: "production", textValue: "Production" },
    ],
  },
  {
    key: "channels",
    label: "Release channels",
    textValue: "Release channels",
    type: "section",
    items: [
      { key: "canary", textValue: "Canary" },
      { disabled: true, key: "legacy", textValue: "Legacy (unavailable)" },
      { key: "stable", textValue: "Stable" },
    ],
  },
] as const satisfies readonly CollectionEntry[];

const TEAM_ENTRIES = [
  {
    description: "Reviews keyboard, screen-reader, speech, and switch behavior.",
    key: "accessibility",
    textValue: "Accessibility",
  },
  { key: "design-systems", textValue: "Design systems" },
  { key: "frontend", textValue: "Frontend platform" },
  { disabled: true, key: "archived", textValue: "Archived team" },
  { key: "release", textValue: "Release engineering" },
] as const satisfies readonly CollectionEntry[];

const DESCRIBED_DELIVERY_ENTRIES = DELIVERY_ENTRIES.map((section) => ({
  ...section,
  items: section.items.map((item) =>
    item.key === "preview"
      ? { ...item, description: "Deploys the current branch to an isolated review URL." }
      : item,
  ),
})) satisfies readonly CollectionEntry[];

function Canvas({
  children,
  direction = "ltr",
  locale = "en-US",
}: {
  readonly children: ReactNode;
  readonly direction?: "ltr" | "rtl";
  readonly locale?: string;
}) {
  return (
    <MergoraProvider direction={direction} locale={locale}>
      <main style={canvasStyle}>
        <div style={workbenchStyle}>{children}</div>
      </main>
    </MergoraProvider>
  );
}

function inspectForm(event: FormEvent<HTMLFormElement>, publish: (value: string) => void): void {
  event.preventDefault();
  const entries = [...new FormData(event.currentTarget).entries()].map(([name, entry]) => [
    name,
    String(entry),
  ]);
  publish(JSON.stringify(entries));
}

function SelectionWorkbenchContent() {
  const [controlledEnvironment, setControlledEnvironment] = useState<CollectionKey | null>(
    "staging",
  );
  const [submission, setSubmission] = useState("No form inspection yet.");
  return (
    <form
      aria-label="Collection selection workbench"
      onReset={() => setControlledEnvironment("staging")}
      onSubmit={(event) => inspectForm(event, setSubmission)}
    >
      <div style={columnsStyle}>
        <Listbox
          defaultValue={["accessibility", "frontend"]}
          description="Space toggles options. The archived team remains discoverable but unavailable."
          entries={TEAM_ENTRIES}
          label="Teams included in review"
          name="review-team"
          selectionMode="multiple"
        />
        <Listbox
          description="This value is accepted only when the server-owned state updates."
          entries={DELIVERY_ENTRIES}
          label="Controlled release target"
          name="controlled-target"
          onValueChange={setControlledEnvironment}
          value={controlledEnvironment}
        />
        <Select
          defaultValue="production"
          description="A non-editable enhanced selector over the same section and key model."
          entries={DESCRIBED_DELIVERY_ENTRIES}
          label="Default deployment environment"
          name="deployment-environment"
        />
      </div>
      <output aria-live="polite" data-testid="controlled-environment">
        Controlled target: {controlledEnvironment ?? "none"}
      </output>
      <div style={actionsStyle}>
        <button style={primaryButtonStyle} type="submit">
          Inspect collection values
        </button>
        <button style={secondaryButtonStyle} type="reset">
          Restore collection defaults
        </button>
      </div>
      <output aria-live="polite" data-testid="collection-form-output">
        {submission}
      </output>
    </form>
  );
}

function DynamicSelectionIntegrityContent() {
  const [pageEntries, setPageEntries] = useState<readonly CollectionEntry[]>(TEAM_ENTRIES);
  const [submission, setSubmission] = useState("No form inspection yet.");
  const [callbackValue, setCallbackValue] = useState("No selection callback yet.");
  return (
    <>
      <Listbox
        defaultValue="release"
        description="The selected record remains materialized when the owning page no longer returns it."
        entries={pageEntries}
        form="dynamic-selection-form"
        label="Page-owned reviewer"
        name="dynamic-reviewer"
        onValueChange={(next) => setCallbackValue(`Selection callback: ${String(next)}`)}
      />
      <form
        aria-label="Dynamic collection form"
        id="dynamic-selection-form"
        onSubmit={(event) => inspectForm(event, setSubmission)}
      >
        <div style={actionsStyle}>
          <button
            onClick={() => setPageEntries(TEAM_ENTRIES.filter((entry) => entry.key !== "release"))}
            style={secondaryButtonStyle}
            type="button"
          >
            Show next collection page
          </button>
          <button style={primaryButtonStyle} type="submit">
            Inspect retained value
          </button>
          <button style={secondaryButtonStyle} type="reset">
            Restore retained default
          </button>
        </div>
      </form>
      <output aria-live="polite" data-testid="dynamic-page-count">
        Page records: {pageEntries.length}
      </output>
      <output aria-live="polite" data-testid="dynamic-selection-callback">
        {callbackValue}
      </output>
      <output aria-live="polite" data-testid="dynamic-form-output">
        {submission}
      </output>
    </>
  );
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Canceled", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Canceled", "AbortError"));
      },
      { once: true },
    );
  });
}

function AsyncCollectionContent() {
  const initialFailures = useRef(0);
  const [requestCount, setRequestCount] = useState(0);
  const collection = useCollectionLoader({
    load: async ({ cursor, requestId, signal }) => {
      setRequestCount((current) => current + 1);
      if (cursor === null && initialFailures.current === 0) {
        await abortableDelay(140, signal);
        initialFailures.current += 1;
        throw new Error("The prepared catalog request failed. Retry keeps this state recoverable.");
      }
      if (cursor === null && requestId >= 4 && requestId % 2 === 0) {
        // This adapter deliberately ignores abort for a slow response. The hook's monotonic request
        // id must still prevent it from overwriting a newer completion or a canceled request.
        await new Promise((resolve) => setTimeout(resolve, 320));
      } else {
        await abortableDelay(cursor === null ? 70 : 220, signal);
      }
      const start = cursor === null ? 1 : Number.parseInt(cursor, 10);
      const entries = Array.from({ length: 24 }, (_, index) => {
        const number = start + index;
        return {
          key: `remote-${String(number)}`,
          textValue: `Remote option ${new Intl.NumberFormat("en-US").format(number)} · request ${String(requestId)}`,
        } satisfies CollectionEntry;
      });
      return {
        cursor: start >= 25 ? null : "25",
        entries,
      };
    },
  });
  return (
    <>
      <div style={columnsStyle}>
        <Listbox
          asyncState={collection.asyncState}
          entries={collection.entries}
          label="Remote release records"
        />
        <Select
          asyncState={collection.asyncState}
          entries={collection.entries}
          label="Remote release default"
          placeholder="Choose a loaded record"
        />
      </div>
      <div style={actionsStyle}>
        <button onClick={collection.reload} style={secondaryButtonStyle} type="button">
          Restart remote request
        </button>
        <button onClick={collection.abort} style={secondaryButtonStyle} type="button">
          Cancel remote request
        </button>
      </div>
      <output aria-live="polite" data-testid="remote-count">
        Loaded options: {collection.entries.length}; requests: {requestCount}
      </output>
    </>
  );
}

function NativeFormContent() {
  const [submission, setSubmission] = useState("No form inspection yet.");
  return (
    <form
      aria-label="Native and enhanced Select parity"
      onSubmit={(event) => inspectForm(event, setSubmission)}
    >
      <div style={columnsStyle}>
        <Select
          defaultValue="stable"
          entries={DELIVERY_ENTRIES}
          label="Platform release channel"
          name="platform-channel"
          presentation="native"
          required
        />
        <Select
          defaultValue="staging"
          entries={DELIVERY_ENTRIES}
          label="Enhanced release environment"
          name="enhanced-environment"
          required
        />
      </div>
      <div style={actionsStyle}>
        <button style={primaryButtonStyle} type="submit">
          Inspect Select values
        </button>
        <button style={secondaryButtonStyle} type="reset">
          Restore Select defaults
        </button>
      </div>
      <output aria-live="polite" data-testid="select-form-output">
        {submission}
      </output>
    </form>
  );
}

function TenThousandContent() {
  const entries = useMemo<readonly CollectionEntry[]>(
    () =>
      Array.from({ length: 10_000 }, (_, index) => {
        const number = index + 1;
        return {
          key: `record-${String(number)}`,
          textValue: `Record ${new Intl.NumberFormat("en-US").format(number)}`,
        };
      }),
    [],
  );
  return (
    <Listbox
      defaultValue="record-9000"
      description="Only the visible window and retained focused option belong in the DOM; all 10,000 stable collection nodes remain navigable."
      entries={entries}
      label="Ten thousand release records"
      virtualization={{ estimatedItemSize: 48 }}
    />
  );
}

const ARABIC_ENTRIES = [
  { key: "cairo", textValue: "القاهرة" },
  { key: "amman", textValue: "عمّان" },
  { key: "riyadh", textValue: "الرياض" },
] as const satisfies readonly CollectionEntry[];

const GERMAN_ENTRIES = [
  { key: "security", textValue: "Sicherheitsüberprüfungsverantwortliche" },
  { key: "release", textValue: "Veröffentlichungsfreigabekoordination" },
  { key: "documentation", textValue: "Dokumentationsqualitätsverantwortliche" },
] as const satisfies readonly CollectionEntry[];

const meta = {
  parameters: { layout: "fullscreen" },
  title: "P4/Collection foundation",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectionWorkbench: Story = {
  render: () => (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Shared collection and selection model</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "70ch" }}>
          Sections, disabled options, single and multiple keys, typeahead, controlled ownership,
          repeated form values, and reset all use one reviewed record model.
        </p>
      </header>
      <SelectionWorkbenchContent />
    </Canvas>
  ),
};

export const AsyncFailureAndPagination: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Async failure, retry, cancellation, and pagination</h1>
      <p style={{ margin: 0, maxInlineSize: "70ch" }}>
        The first deterministic request fails. Retry loads one page; Load more appends the next page
        only after global key validation.
      </p>
      <AsyncCollectionContent />
    </Canvas>
  ),
};

export const TenThousandVirtualized: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Ten thousand virtualized options</h1>
      <TenThousandContent />
    </Canvas>
  ),
};

export const DynamicSelectionIntegrity: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Dynamic collection selection integrity</h1>
      <p style={{ margin: 0, maxInlineSize: "70ch" }}>
        A server page replacement cannot silently erase the uncontrolled selection or its external
        form value. Choosing a visible replacement releases the retained record; reset restores the
        initial materialized default.
      </p>
      <DynamicSelectionIntegrityContent />
    </Canvas>
  ),
};

export const NativeFormAndReset: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Native and enhanced form parity</h1>
      <p style={{ margin: 0, maxInlineSize: "70ch" }}>
        Native is an explicit simple/mobile-first platform picker. Enhanced remains a
        single-selection custom popup. Both serialize the same stable key.
      </p>
      <NativeFormContent />
    </Canvas>
  ),
};

export const AdverseStateMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Collection adverse-state rail</h1>
      <div style={stateRailStyle}>
        <section aria-label="Required invalid collection" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Required and invalid</h2>
          <div style={columnsStyle}>
            <Listbox
              entries={TEAM_ENTRIES}
              errorMessage="Choose one team before continuing."
              invalid
              label="Owning team"
              required
            />
            <Select
              entries={DELIVERY_ENTRIES}
              errorMessage="Choose one environment before continuing."
              invalid
              label="Release environment"
              required
            />
          </div>
        </section>
        <section aria-label="Read-only collection" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Read only</h2>
          <Listbox defaultValue="release" entries={TEAM_ENTRIES} label="Approved team" readOnly />
        </section>
        <section aria-label="Disabled collection" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled</h2>
          <Listbox defaultValue="frontend" disabled entries={TEAM_ENTRIES} label="Archived owner" />
        </section>
        <section aria-label="Empty Select" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Empty</h2>
          <Select entries={[]} label="No matching environment" />
        </section>
        <section aria-label="Disabled Select" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled</h2>
          <Select
            defaultValue="stable"
            disabled
            entries={DELIVERY_ENTRIES}
            label="Locked channel"
          />
        </section>
      </div>
    </Canvas>
  ),
};

export const GermanExpansion: Story = {
  render: () => (
    <Canvas locale="de-DE">
      <h1 style={{ margin: 0 }}>Lange deutsche Sammlungsbezeichnungen</h1>
      <div style={columnsStyle}>
        <Listbox entries={GERMAN_ENTRIES} label="Verantwortungsbereich auswählen" />
        <Select entries={GERMAN_ENTRIES} label="Standardverantwortungsbereich" />
      </div>
    </Canvas>
  ),
};

export const RightToLeftAndNarrow: Story = {
  render: () => (
    <Canvas direction="rtl" locale="ar-EG">
      <h1 style={{ margin: 0 }}>مجموعة خيارات من اليمين إلى اليسار</h1>
      <div style={columnsStyle}>
        <Listbox defaultValue="amman" entries={ARABIC_ENTRIES} label="المدينة المسؤولة" />
        <Select defaultValue="cairo" entries={ARABIC_ENTRIES} label="المدينة الافتراضية" />
        <Select
          defaultValue="riyadh"
          entries={ARABIC_ENTRIES}
          label="منتقي المنصة"
          presentation="native"
        />
      </div>
    </Canvas>
  ),
};
