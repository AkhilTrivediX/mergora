import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type CSSProperties } from "react";

import "mergora-tokens/tokens.css";
import { Field } from "../../../registry/source/components/field/index.ts";
import { Input } from "../../../registry/source/components/input/index.ts";
import { Switch } from "../../../registry/source/components/switch/index.ts";
import {
  OnboardingWizard,
  type OnboardingDraft,
  type OnboardingPersistenceAdapter,
  type OnboardingRenderContext,
  type OnboardingSnapshot,
  type OnboardingStep,
} from "../../../registry/source/kits/onboarding-wizard/index.ts";

interface OnboardingStoryProps {
  readonly announceStepChanges: boolean;
  readonly persistence: boolean;
  readonly progressContext: boolean;
}

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  minBlockSize: "100vh",
  padding: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const steps: readonly OnboardingStep[] = [
  {
    description: "Choose the name shown to collaborators.",
    id: "workspace",
    label: "Workspace details",
    validate: (draft) =>
      String(draft.workspaceName ?? "").trim().length === 0
        ? [{ id: "workspaceName", message: "Add a workspace name to continue." }]
        : [],
  },
  {
    description: "Select only the updates that are useful.",
    id: "preferences",
    label: "Preferences",
    optional: true,
  },
  { description: "Review the draft before completion.", id: "review", label: "Review" },
];

function renderOnboardingStep(context: OnboardingRenderContext) {
  if (context.step.id === "workspace") {
    return (
      <Field
        error={context.errors.find((error) => error.id === "workspaceName")?.message}
        label="Workspace name"
        required
      >
        <Input
          autoComplete="organization"
          disabled={context.disabled}
          name="workspaceName"
          onChange={(event) => context.setDraftValue("workspaceName", event.currentTarget.value)}
          readOnly={context.readOnly}
          required
          value={String(context.draft.workspaceName ?? "")}
        />
      </Field>
    );
  }
  if (context.step.id === "preferences") {
    return (
      <Switch
        disabled={context.disabled || context.readOnly}
        name="releaseUpdates"
        onValueChange={(value) => context.setDraftValue("releaseUpdates", value)}
        value={context.draft.releaseUpdates === true}
      >
        Release updates
      </Switch>
    );
  }
  return (
    <dl>
      <dt>Workspace name</dt>
      <dd>{String(context.draft.workspaceName ?? "Not provided")}</dd>
      <dt>Release updates</dt>
      <dd>{context.draft.releaseUpdates === true ? "Enabled" : "Disabled"}</dd>
    </dl>
  );
}

function OnboardingStory({
  announceStepChanges,
  persistence,
  progressContext,
}: OnboardingStoryProps) {
  const [completion, setCompletion] = useState("Not completed.");
  const persistenceAdapter = useMemo<OnboardingPersistenceAdapter>(() => {
    let snapshot: OnboardingSnapshot | null = null;
    return {
      clear() {
        snapshot = null;
      },
      load() {
        return snapshot;
      },
      save(next) {
        snapshot = next;
      },
    };
  }, []);
  return (
    <main style={canvasStyle}>
      <OnboardingWizard
        announceStepChanges={announceStepChanges}
        defaultDraft={{ releaseUpdates: false, workspaceName: "" }}
        onComplete={({ draft }) => setCompletion(`Completed ${String(draft.workspaceName)}.`)}
        persistence={persistence ? persistenceAdapter : false}
        renderStep={renderOnboardingStep}
        showProgressContext={progressContext}
        steps={steps}
      />
      <output>{completion}</output>
    </main>
  );
}

const meta = {
  title: "Kits/Onboarding Wizard",
  component: OnboardingStory,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  argTypes: {
    announceStepChanges: { control: "boolean" },
    persistence: { control: "boolean" },
    progressContext: { control: "boolean" },
  },
} satisfies Meta<typeof OnboardingStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicOnboardingWizard: Story = {
  args: { announceStepChanges: false, persistence: false, progressContext: false },
};

export const RecommendedOnboardingWizard: Story = {
  args: { announceStepChanges: true, persistence: true, progressContext: true },
};

function ControlledOnboardingExample() {
  const [draft, setDraft] = useState<OnboardingDraft>({
    releaseUpdates: true,
    workspaceName: "Northstar notes",
  });
  const [stepId, setStepId] = useState("preferences");
  return (
    <main style={canvasStyle}>
      <OnboardingWizard
        announceStepChanges
        draft={draft}
        onDraftChange={setDraft}
        onStepChange={setStepId}
        renderStep={renderOnboardingStep}
        showProgressContext
        stepId={stepId}
        steps={steps}
      />
      <output>Controlled step: {stepId}</output>
    </main>
  );
}

export const ControlledOnboardingWizard: Story = {
  args: RecommendedOnboardingWizard.args,
  render: () => <ControlledOnboardingExample />,
};

const failedPersistence: OnboardingPersistenceAdapter = {
  clear() {
    throw new Error("The saved draft could not be removed.");
  },
  load() {
    throw new Error("The saved draft is temporarily unavailable.");
  },
  save() {
    throw new Error("The draft could not be saved.");
  },
};

function ReadOnlyOnboardingExample() {
  const [draftEvents, setDraftEvents] = useState(0);
  const [resetEvents, setResetEvents] = useState(0);
  const [stepEvents, setStepEvents] = useState(0);
  return (
    <>
      <OnboardingWizard
        aria-label="Read-only onboarding"
        defaultDraft={{ workspaceName: "Readable draft" }}
        onDraftChange={() => setDraftEvents((current) => current + 1)}
        onReset={() => setResetEvents((current) => current + 1)}
        onStepChange={() => setStepEvents((current) => current + 1)}
        readOnly
        renderStep={renderOnboardingStep}
        steps={steps}
      />
      <output data-slot="onboarding-readonly-events">
        Read-only reset events: {resetEvents}; draft events: {draftEvents}; step events:{" "}
        {stepEvents}
      </output>
    </>
  );
}

export const OnboardingStateMatrix: Story = {
  args: BasicOnboardingWizard.args,
  render: () => (
    <main style={{ ...canvasStyle, display: "grid", gap: "2rem" }}>
      <section aria-labelledby="onboarding-disabled-heading">
        <h2 id="onboarding-disabled-heading">Disabled</h2>
        <OnboardingWizard
          aria-label="Disabled onboarding"
          disabled
          renderStep={renderOnboardingStep}
          steps={steps}
        />
      </section>
      <section aria-labelledby="onboarding-readonly-heading">
        <h2 id="onboarding-readonly-heading">Read only</h2>
        <ReadOnlyOnboardingExample />
      </section>
      <section aria-labelledby="onboarding-error-heading">
        <h2 id="onboarding-error-heading">Persistence error</h2>
        <OnboardingWizard
          aria-label="Persistence-error onboarding"
          persistence={failedPersistence}
          renderStep={renderOnboardingStep}
          steps={steps}
        />
      </section>
    </main>
  ),
};

export const OnboardingFormLifecycle: Story = {
  args: BasicOnboardingWizard.args,
  render: () => (
    <main style={canvasStyle}>
      <OnboardingWizard
        defaultDraft={{ releaseUpdates: true, workspaceName: "Initial workspace" }}
        renderStep={renderOnboardingStep}
        showProgressContext
        steps={steps}
      />
    </main>
  ),
};

export const NarrowRtlOnboarding: Story = {
  args: RecommendedOnboardingWizard.args,
  globals: { viewport: { value: "mobile1" } },
  render: (args) => (
    <div dir="rtl">
      <OnboardingStory {...args} />
    </div>
  ),
};
