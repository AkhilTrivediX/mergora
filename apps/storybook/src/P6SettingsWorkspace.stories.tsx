import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";

import "mergora-tokens/tokens.css";
import { Field } from "../../../registry/source/components/field/index.ts";
import { Input } from "../../../registry/source/components/input/index.ts";
import { Switch } from "../../../registry/source/components/switch/index.ts";
import {
  SettingsWorkspace,
  type SettingsWorkspaceRenderContext,
  type SettingsWorkspaceSection,
  type SettingsWorkspaceSectionId,
} from "../../../registry/source/kits/settings-workspace/index.ts";

interface SettingsStoryProps {
  readonly destructiveConfirmation: boolean;
  readonly unsavedProtection: boolean;
}

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  minBlockSize: "100vh",
  padding: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const sections: readonly SettingsWorkspaceSection[] = [
  { description: "Name and contact context.", id: "profile", label: "Profile" },
  { description: "Display and reading preferences.", id: "preferences", label: "Preferences" },
  { description: "Consumer-owned delivery choices.", id: "notifications", label: "Notifications" },
  { description: "Session and recovery controls.", id: "security", label: "Security" },
];

interface SettingsValues {
  readonly displayName: string;
  readonly emailUpdates: boolean;
  readonly locale: string;
  readonly sessionLabel: string;
}

function SettingsStory({ destructiveConfirmation, unsavedProtection }: SettingsStoryProps) {
  const [values, setValues] = useState<SettingsValues>({
    displayName: "Asha Rao",
    emailUpdates: false,
    locale: "en-GB",
    sessionLabel: "Work laptop",
  });
  const [event, setEvent] = useState("No settings request yet.");
  const renderSection = (context: SettingsWorkspaceRenderContext) => {
    switch (context.section.id) {
      case "profile":
        return (
          <Field label="Display name" required>
            <Input
              autoComplete="name"
              disabled={context.disabled}
              name="displayName"
              onChange={(changeEvent) =>
                setValues((current) => ({
                  ...current,
                  displayName: changeEvent.currentTarget.value,
                }))
              }
              readOnly={context.readOnly}
              required
              value={values.displayName}
            />
          </Field>
        );
      case "preferences":
        return (
          <Field description="Use a BCP 47 locale identifier." label="Interface locale" required>
            <Input
              disabled={context.disabled}
              name="locale"
              onChange={(changeEvent) =>
                setValues((current) => ({ ...current, locale: changeEvent.currentTarget.value }))
              }
              readOnly={context.readOnly}
              required
              value={values.locale}
            />
          </Field>
        );
      case "notifications":
        return (
          <Switch
            disabled={context.disabled || context.readOnly}
            name="emailUpdates"
            onValueChange={(value) => {
              setValues((current) => ({ ...current, emailUpdates: value }));
              context.setDirty(true);
            }}
            value={values.emailUpdates}
          >
            Email product updates
          </Switch>
        );
      case "security":
        return (
          <Field
            description="A label helps identify this session without exposing device secrets."
            label="Session label"
          >
            <Input
              disabled={context.disabled}
              name="sessionLabel"
              onChange={(changeEvent) =>
                setValues((current) => ({
                  ...current,
                  sessionLabel: changeEvent.currentTarget.value,
                }))
              }
              readOnly={context.readOnly}
              value={values.sessionLabel}
            />
          </Field>
        );
    }
  };
  return (
    <main style={canvasStyle}>
      <SettingsWorkspace
        destructiveAction={
          destructiveConfirmation
            ? {
                confirmationText: "REMOVE",
                consequences: [
                  "Access is revoked after the consumer service confirms the request.",
                  "Retention and export remain governed by the consumer policy.",
                ],
                description: "Request account removal only after reviewing export and retention.",
                label: "account removal",
                onConfirm: () => setEvent("Account removal requested in the local fixture."),
              }
            : false
        }
        onSave={({ sectionId }) => setEvent(`Saved ${sectionId} in the local fixture.`)}
        protectUnsavedChanges={unsavedProtection}
        renderSection={renderSection}
        sections={sections}
      />
      <output>{event}</output>
    </main>
  );
}

const meta = {
  title: "Kits/Settings Workspace",
  component: SettingsStory,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  argTypes: {
    destructiveConfirmation: { control: "boolean" },
    unsavedProtection: { control: "boolean" },
  },
} satisfies Meta<typeof SettingsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicSettingsWorkspace: Story = {
  args: { destructiveConfirmation: false, unsavedProtection: false },
};

export const RecommendedSettingsWorkspace: Story = {
  args: { destructiveConfirmation: true, unsavedProtection: true },
};

function ControlledSettingsExample() {
  const [activeSectionId, setActiveSectionId] = useState<SettingsWorkspaceSectionId>("preferences");
  const [dirty, setDirty] = useState(false);
  return (
    <main style={canvasStyle}>
      <SettingsWorkspace
        activeSectionId={activeSectionId}
        dirty={dirty}
        onActiveSectionChange={setActiveSectionId}
        onDirtyChange={setDirty}
        onSave={() => undefined}
        protectUnsavedChanges
        renderSection={(context) => (
          <Field label={`${String(context.section.label)} note`}>
            <Input defaultValue="Controlled example" name="note" />
          </Field>
        )}
        sections={sections}
      />
      <output>
        Controlled section: {activeSectionId}; dirty: {dirty ? "yes" : "no"}
      </output>
    </main>
  );
}

export const ControlledSettingsWorkspace: Story = {
  args: RecommendedSettingsWorkspace.args,
  render: () => <ControlledSettingsExample />,
};

const staticSection = (context: SettingsWorkspaceRenderContext) => (
  <Field label={`${String(context.section.label)} value`}>
    <Input
      defaultValue="Readable setting"
      disabled={context.disabled}
      name="setting"
      readOnly={context.readOnly}
    />
  </Field>
);

const stateDestructiveAction = {
  confirmationText: "REMOVE",
  consequences: ["The consumer must re-authorize this operation."],
  description: "Review the consumer-owned account boundary.",
  label: "account removal",
  onConfirm: () => undefined,
} as const;

function ReadOnlySettingsExample() {
  const [dirtyEvents, setDirtyEvents] = useState(0);
  const [resetEvents, setResetEvents] = useState(0);
  return (
    <>
      <SettingsWorkspace
        aria-label="Read-only settings"
        defaultDirty
        destructiveAction={stateDestructiveAction}
        onDirtyChange={() => setDirtyEvents((current) => current + 1)}
        onReset={() => setResetEvents((current) => current + 1)}
        protectUnsavedChanges
        readOnly
        renderSection={staticSection}
        sections={sections}
      />
      <output data-slot="settings-readonly-events">
        Read-only reset events: {resetEvents}; dirty events: {dirtyEvents}
      </output>
    </>
  );
}

export const SettingsStateMatrix: Story = {
  args: BasicSettingsWorkspace.args,
  render: () => (
    <main style={{ ...canvasStyle, display: "grid", gap: "2rem" }}>
      <section aria-labelledby="settings-disabled-heading">
        <h2 id="settings-disabled-heading">Disabled and loading</h2>
        <SettingsWorkspace
          aria-label="Disabled settings"
          destructiveAction={stateDestructiveAction}
          disabled
          loading
          renderSection={staticSection}
          sections={sections}
        />
      </section>
      <section aria-labelledby="settings-readonly-heading">
        <h2 id="settings-readonly-heading">Read only</h2>
        <ReadOnlySettingsExample />
      </section>
      <section aria-labelledby="settings-error-heading">
        <h2 id="settings-error-heading">Error</h2>
        <SettingsWorkspace
          aria-label="Settings error state"
          defaultDirty
          destructiveAction={stateDestructiveAction}
          error="Settings could not be refreshed. Existing values remain readable."
          protectUnsavedChanges
          renderSection={staticSection}
          sections={sections}
        />
      </section>
    </main>
  ),
};

export const SettingsFormLifecycle: Story = {
  args: BasicSettingsWorkspace.args,
  render: () => (
    <main style={canvasStyle}>
      <SettingsWorkspace
        onSave={() => undefined}
        protectUnsavedChanges
        renderSection={staticSection}
        sections={sections}
      />
    </main>
  ),
};

export const NarrowRtlSettings: Story = {
  args: RecommendedSettingsWorkspace.args,
  globals: { viewport: { value: "mobile1" } },
  render: (args) => (
    <div dir="rtl">
      <SettingsStory {...args} />
    </div>
  ),
};
