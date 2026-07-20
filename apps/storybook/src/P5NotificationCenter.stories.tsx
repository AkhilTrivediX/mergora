import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactElement } from "react";

import {
  NotificationCenter,
  type NotificationCenterFilter,
  type NotificationCenterItem,
} from "../../../registry/source/components/notification-center/index.ts";
import "mergora-tokens/tokens.css";

const notifications: readonly NotificationCenterItem[] = [
  {
    category: "Updates",
    createdAt: "2026-07-19T09:30:00.000Z",
    description: "The interface evidence was refreshed.",
    id: "evidence-refreshed",
    title: "Evidence refreshed",
  },
  {
    category: "Messages",
    createdAt: "2026-07-18T15:00:00.000Z",
    description: "A new note is ready to review.",
    id: "review-note",
    read: true,
    title: "Review note available",
  },
  {
    category: "Updates",
    createdAt: "2026-07-18T10:00:00.000Z",
    id: "sync-complete",
    title: "Local sync completed",
  },
];

interface StoryProps {
  readonly announceReadChanges: boolean;
  readonly bulkActions: boolean;
  readonly grouped: boolean;
  readonly liveQueue: boolean;
  readonly virtualized: boolean;
}

function NotificationStory(args: StoryProps): ReactElement {
  const [pending, setPending] = useState(2);
  return (
    <NotificationCenter
      announceReadChanges={args.announceReadChanges}
      bulkActions={args.bulkActions}
      groupBy={args.grouped ? "date" : false}
      liveUpdatePolicy={args.liveQueue ? "queue" : false}
      notifications={notifications}
      onRevealPending={() => setPending(0)}
      pendingLiveCount={args.liveQueue ? pending : 0}
      virtualWindow={args.virtualized ? { startIndex: 0, windowSize: 2 } : false}
    />
  );
}

const disabled: StoryProps = {
  announceReadChanges: false,
  bulkActions: false,
  grouped: false,
  liveQueue: false,
  virtualized: false,
};

const meta = {
  title: "Feedback/Notification Center",
  component: NotificationStory,
  parameters: { layout: "padded", a11y: { test: "error" } },
  argTypes: {
    announceReadChanges: { control: "boolean" },
    bulkActions: { control: "boolean" },
    grouped: { control: "boolean" },
    liveQueue: { control: "boolean" },
    virtualized: { control: "boolean" },
  },
} satisfies Meta<typeof NotificationStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicNotificationCenter: Story = {
  args: disabled,
  name: "Notification Center · basic",
};
export const RecommendedNotificationCenter: Story = {
  args: {
    announceReadChanges: true,
    bulkActions: true,
    grouped: true,
    liveQueue: true,
    virtualized: false,
  },
  name: "Notification Center · Recommended Mergora",
};

function ControlledExample(): ReactElement {
  const [filter, setFilter] = useState<NotificationCenterFilter>("all");
  const [readIds, setReadIds] = useState<readonly string[]>(["review-note"]);
  return (
    <NotificationCenter
      filter={filter}
      notifications={notifications}
      onFilterChange={setFilter}
      onReadIdsChange={setReadIds}
      readIds={readIds}
    />
  );
}

export const ControlledNotificationCenter: Story = {
  args: disabled,
  render: () => <ControlledExample />,
};
export const NotificationStateMatrix: Story = {
  args: disabled,
  render: () => (
    <div style={{ display: "grid", gap: "2rem" }}>
      <NotificationCenter notifications={[]} />
      <NotificationCenter disabled notifications={notifications} />
      <NotificationCenter notifications={notifications} readOnly />
      <NotificationCenter loading notifications={[]} />
      <NotificationCenter
        error="Notifications could not load."
        notifications={[]}
        onRetry={() => undefined}
      />
    </div>
  ),
};
export const NarrowRtlNotifications: Story = {
  args: disabled,
  render: () => (
    <div dir="rtl" style={{ inlineSize: 320, maxInlineSize: "100%" }}>
      <NotificationCenter bulkActions groupBy="category" notifications={notifications} />
    </div>
  ),
};
export const NotificationPreferences: Story = {
  args: { ...disabled, announceReadChanges: true, bulkActions: true },
  render: (args) => (
    <div>
      <p>Tab reaches filters, selection controls, notification actions, and read-state controls.</p>
      <NotificationStory {...args} />
    </div>
  ),
};
