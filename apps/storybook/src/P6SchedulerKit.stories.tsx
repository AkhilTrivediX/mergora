import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type ReactElement } from "react";

import {
  createDeterministicSchedulerAdapter,
  createDeterministicSchedulerSnapshot,
  SchedulerKit,
  type SchedulerView,
} from "../../../registry/source/kits/scheduler-kit/index.ts";
import "mergora-tokens/tokens.css";

interface StoryProps {
  readonly announceChanges: boolean;
  readonly showConflictGuidance: boolean;
  readonly showDurationSummary: boolean;
  readonly showTimeZoneContext: boolean;
}

function SchedulerStory(args: StoryProps): ReactElement {
  const adapter = useMemo(() => createDeterministicSchedulerAdapter(), []);
  return (
    <SchedulerKit
      adapter={adapter}
      announceChanges={args.announceChanges}
      initialSnapshot={createDeterministicSchedulerSnapshot()}
      showConflictGuidance={args.showConflictGuidance}
      showDurationSummary={args.showDurationSummary}
      showTimeZoneContext={args.showTimeZoneContext}
      timeZones={["UTC", "Asia/Kolkata", "Europe/Paris"]}
    />
  );
}

const disabled: StoryProps = {
  announceChanges: false,
  showConflictGuidance: false,
  showDurationSummary: false,
  showTimeZoneContext: false,
};

const meta = {
  title: "Kits/Scheduler Kit",
  component: SchedulerStory,
  parameters: { layout: "padded", a11y: { test: "error" } },
  argTypes: {
    announceChanges: { control: "boolean" },
    showConflictGuidance: { control: "boolean" },
    showDurationSummary: { control: "boolean" },
    showTimeZoneContext: { control: "boolean" },
  },
} satisfies Meta<typeof SchedulerStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicSchedulerKit: Story = { args: disabled, name: "Scheduler Kit · basic Beta" };
export const RecommendedSchedulerKit: Story = {
  args: {
    announceChanges: true,
    showConflictGuidance: true,
    showDurationSummary: true,
    showTimeZoneContext: true,
  },
  name: "Scheduler Kit · Recommended Mergora Beta",
};

function ControlledExample(): ReactElement {
  const adapter = useMemo(() => createDeterministicSchedulerAdapter(), []);
  const [date, setDate] = useState("2026-07-20");
  const [timeZone, setTimeZone] = useState("UTC");
  const [view, setView] = useState<SchedulerView>("calendar");
  return (
    <SchedulerKit
      adapter={adapter}
      initialSnapshot={createDeterministicSchedulerSnapshot()}
      onSelectedDateChange={setDate}
      onTimeZoneChange={setTimeZone}
      onViewChange={setView}
      selectedDate={date}
      timeZone={timeZone}
      timeZones={["UTC", "Asia/Kolkata"]}
      view={view}
    />
  );
}

export const ControlledSchedulerKit: Story = {
  args: disabled,
  render: () => <ControlledExample />,
};
export const SchedulerStateMatrix: Story = {
  args: disabled,
  render: () => (
    <div style={{ display: "grid", gap: "2rem" }}>
      <SchedulerKit
        adapter={createDeterministicSchedulerAdapter()}
        disabled
        initialSnapshot={createDeterministicSchedulerSnapshot()}
        label="Disabled scheduler"
      />
      <SchedulerKit
        adapter={createDeterministicSchedulerAdapter()}
        initialSnapshot={createDeterministicSchedulerSnapshot()}
        label="Read-only scheduler"
        readOnly
      />
      <SchedulerKit
        adapter={createDeterministicSchedulerAdapter()}
        initialSnapshot={createDeterministicSchedulerSnapshot()}
        label="Offline cached schedule"
        offline
      />
    </div>
  ),
};
export const NarrowRtlScheduler: Story = {
  args: disabled,
  render: () => (
    <div dir="rtl" style={{ inlineSize: 320, maxInlineSize: "100%" }}>
      <SchedulerKit
        adapter={createDeterministicSchedulerAdapter()}
        initialSnapshot={createDeterministicSchedulerSnapshot()}
        showConflictGuidance
        view="agenda"
      />
    </div>
  ),
};
export const SchedulerPreferences: Story = {
  args: { ...disabled, announceChanges: true, showDurationSummary: true },
  render: (args) => (
    <div>
      <p>
        Use Calendar arrow keys and PageUp/PageDown, then Tab through agenda and editor controls.
      </p>
      <SchedulerStory {...args} />
    </div>
  ),
};
