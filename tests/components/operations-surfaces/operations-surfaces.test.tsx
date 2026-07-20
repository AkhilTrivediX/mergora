import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  groupNotifications,
  NotificationCenter,
  type NotificationCenterItem,
} from "../../../registry/source/components/notification-center/notification-center.tsx";
import {
  createDeterministicFileManagerAdapter,
  createDeterministicFileManagerSnapshot,
} from "../../../registry/source/kits/file-manager/file-manager-adapter.ts";
import { FileManager } from "../../../registry/source/kits/file-manager/file-manager.tsx";
import {
  createDeterministicSchedulerAdapter,
  createDeterministicSchedulerSnapshot,
} from "../../../registry/source/kits/scheduler-kit/scheduler-kit-adapter.ts";
import { SchedulerKit } from "../../../registry/source/kits/scheduler-kit/scheduler-kit.tsx";
import {
  assertImplementationProfileShard,
  loadMergoraSignaturePolicy,
} from "../../../tooling/registry-builder/src/index.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const notifications: readonly NotificationCenterItem[] = [
  {
    category: "Updates",
    createdAt: "2026-07-19T10:00:00.000Z",
    id: "one",
    title: "One",
  },
  {
    category: "Messages",
    createdAt: "2026-07-18T10:00:00.000Z",
    id: "two",
    read: true,
    title: "Two",
  },
];

describe("operational surfaces", () => {
  it("removes every optional enhancement from basic output", () => {
    const fileHtml = renderToStaticMarkup(
      <FileManager
        adapter={createDeterministicFileManagerAdapter()}
        initialSnapshot={createDeterministicFileManagerSnapshot()}
      />,
    );
    expect(fileHtml).not.toContain("file-manager-conflicts");
    expect(fileHtml).not.toContain("file-manager-storage");
    expect(fileHtml).not.toContain("file-manager-recovery");
    expect(fileHtml).not.toContain("file-manager-announcer");

    const schedulerHtml = renderToStaticMarkup(
      <SchedulerKit
        adapter={createDeterministicSchedulerAdapter()}
        initialSnapshot={createDeterministicSchedulerSnapshot()}
      />,
    );
    expect(schedulerHtml).not.toContain("scheduler-timezone-context");
    expect(schedulerHtml).not.toContain("scheduler-duration");
    expect(schedulerHtml).not.toContain("scheduler-conflicts");
    expect(schedulerHtml).not.toContain("scheduler-announcer");

    const reveal = vi.fn();
    const notificationHtml = renderToStaticMarkup(
      <NotificationCenter
        announceReadChanges={false}
        bulkActions={false}
        groupBy={false}
        liveUpdatePolicy={false}
        notifications={notifications}
        onRevealPending={reveal}
        pendingLiveCount={2}
        virtualWindow={false}
      />,
    );
    expect(notificationHtml).not.toContain("notification-center-live-queue");
    expect(notificationHtml).not.toContain("notification-center-bulk");
    expect(notificationHtml).not.toContain("notification-center-announcer");
    expect(reveal).not.toHaveBeenCalled();
  });

  it("renders recommended identity and independently selected advantages", () => {
    const fileHtml = renderToStaticMarkup(
      <FileManager
        adapter={createDeterministicFileManagerAdapter()}
        announceOperations
        defaultFolderId="working-set"
        enableRecoveryActions
        initialSnapshot={createDeterministicFileManagerSnapshot()}
        showConflictGuidance
        showStorageContext
      />,
    );
    expect(fileHtml).toContain("file-manager-conflicts");
    expect(fileHtml).toContain("file-manager-storage");
    expect(fileHtml).toContain("file-manager-announcer");

    const schedulerHtml = renderToStaticMarkup(
      <SchedulerKit
        adapter={createDeterministicSchedulerAdapter()}
        announceChanges
        initialSnapshot={createDeterministicSchedulerSnapshot()}
        showConflictGuidance
        showDurationSummary
        showTimeZoneContext
      />,
    );
    expect(schedulerHtml).toContain('data-maturity="beta"');
    expect(schedulerHtml).toContain("scheduler-timezone-context");
    expect(schedulerHtml).toContain("scheduler-duration");
    expect(schedulerHtml).toContain("scheduler-conflicts");
    expect(schedulerHtml).toContain("scheduler-announcer");

    const notificationHtml = renderToStaticMarkup(
      <NotificationCenter
        announceReadChanges
        bulkActions
        groupBy="date"
        liveUpdatePolicy="queue"
        notifications={notifications}
        onRevealPending={() => undefined}
        pendingLiveCount={2}
      />,
    );
    expect(notificationHtml).toContain("notification-center-live-queue");
    expect(notificationHtml).toContain("notification-center-bulk");
    expect(notificationHtml).toContain("notification-center-announcer");
  });

  it("keeps IDs instance-safe, virtual positions complete, and unavailable actions inert", () => {
    const fileAdapter = createDeterministicFileManagerAdapter();
    const fileSnapshot = createDeterministicFileManagerSnapshot();
    const fileHtml = renderToStaticMarkup(
      <>
        <FileManager
          adapter={fileAdapter}
          defaultFolderId="working-set"
          initialSnapshot={fileSnapshot}
          virtualWindow={{ startIndex: 1, windowSize: 1 }}
        />
        <FileManager adapter={fileAdapter} initialSnapshot={fileSnapshot} />
      </>,
    );
    const fileHeadingIds = [...fileHtml.matchAll(/id="([^"]+-files-heading)"/gu)].map(
      (match) => match[1]!,
    );
    expect(fileHeadingIds).toHaveLength(2);
    expect(new Set(fileHeadingIds).size).toBe(2);
    expect(fileHtml).toContain('aria-posinset="2"');
    expect(fileHtml).toContain('aria-setsize="2"');

    const offlineFileHtml = renderToStaticMarkup(
      <FileManager
        adapter={fileAdapter}
        defaultFolderId="working-set"
        defaultSelectedFileId="interface-map"
        enableRecoveryActions
        initialSnapshot={fileSnapshot}
        offline
      />,
    );
    expect(offlineFileHtml).not.toContain(">Rename<");
    expect(offlineFileHtml).not.toContain("Move to recovery");

    const notificationHtml = renderToStaticMarkup(
      <>
        <NotificationCenter groupBy="category" notifications={notifications} />
        <NotificationCenter groupBy="category" notifications={notifications} />
      </>,
    );
    const notificationIds = [...notificationHtml.matchAll(/id="([^"]+)"/gu)].map(
      (match) => match[1]!,
    );
    const notificationReferences = [
      ...notificationHtml.matchAll(/aria-labelledby="([^"]+)"/gu),
    ].map((match) => match[1]!);
    expect(new Set(notificationIds).size).toBe(notificationIds.length);
    expect(notificationReferences.every((id) => notificationIds.includes(id))).toBe(true);

    const plainNotificationHtml = renderToStaticMarkup(
      <NotificationCenter
        disabled
        liveUpdatePolicy="queue"
        notifications={notifications}
        onRevealPending={() => undefined}
        pendingLiveCount={2}
        virtualWindow={{ startIndex: 1, windowSize: 1 }}
      />,
    );
    expect(plainNotificationHtml).not.toMatch(/aria-labelledby="[^"]*notification.*group/iu);
    expect(plainNotificationHtml).toContain('aria-label="Notification items"');
    expect(plainNotificationHtml).toContain('aria-posinset="2"');
    expect(plainNotificationHtml).toContain('aria-setsize="2"');
    const liveQueue = plainNotificationHtml.match(
      /<aside[^>]*data-slot="notification-center-live-queue"[^>]*>([\s\S]*?)<\/aside>/u,
    )?.[0];
    expect(liveQueue).toContain('disabled=""');
    expect(liveQueue).toContain("Show new notifications");

    const readOnlyScheduler = renderToStaticMarkup(
      <SchedulerKit
        adapter={createDeterministicSchedulerAdapter()}
        initialSnapshot={createDeterministicSchedulerSnapshot()}
        readOnly
      />,
    );
    const resetButton = readOnlyScheduler.match(
      /<button[^>]*type="reset"[^>]*>(?:(?!<\/button>)[\s\S])*Reset(?:(?!<\/button>)[\s\S])*<\/button>/u,
    )?.[0];
    expect(resetButton).toContain('disabled=""');
  });

  it("groups notification dates and categories deterministically", () => {
    expect(groupNotifications(notifications, "category").map(({ id }) => id)).toEqual([
      "Updates",
      "Messages",
    ]);
    expect(groupNotifications(notifications, "date").map(({ id }) => id)).toEqual([
      "2026-07-19",
      "2026-07-18",
    ]);
  });

  it("keeps file recovery and scheduler conflict behavior inside deterministic adapters", async () => {
    const fileAdapter = createDeterministicFileManagerAdapter();
    const controller = new AbortController();
    const receipt = await fileAdapter.moveToRecovery("interface-map", controller.signal);
    expect((await fileAdapter.load(controller.signal)).files).not.toContainEqual(
      expect.objectContaining({ id: "interface-map" }),
    );
    await fileAdapter.restore(receipt.token, controller.signal);
    expect((await fileAdapter.load(controller.signal)).files).toContainEqual(
      expect.objectContaining({ id: "interface-map" }),
    );

    const schedulerAdapter = createDeterministicSchedulerAdapter();
    const result = await schedulerAdapter.save(
      {
        calendarId: "shared",
        date: "1970-01-01",
        endTime: "10:15",
        startTime: "09:45",
        timeZone: "UTC",
        title: "Collision check",
      },
      controller.signal,
    );
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it("owns complete canonical companions and valid implementation profiles", () => {
    const required = (id: string) => [
      "README.md",
      "index.ts",
      `${id}-css.d.ts`,
      `${id}.anatomy.json`,
      `${id}.api.json`,
      `${id}.contract.json`,
      `${id}.css`,
      `${id}.metadata.json`,
      `${id}.source.json`,
      `${id}.status.json`,
      `${id}.stories.json`,
      `${id}.tsx`,
    ];
    for (const [layer, id] of [
      ["kits", "file-manager"],
      ["kits", "scheduler-kit"],
      ["components", "notification-center"],
    ] as const) {
      const files = readdirSync(resolve(workspaceRoot, `registry/source/${layer}/${id}`));
      for (const companion of required(id))
        expect(files, `${id}/${companion}`).toContain(companion);
    }
    const policy = loadMergoraSignaturePolicy(workspaceRoot);
    for (const shard of ["file-management", "scheduler", "feedback-status"] as const) {
      const profile = JSON.parse(
        readFileSync(
          resolve(workspaceRoot, `registry/quality/implementation-profiles/${shard}.v1.json`),
          "utf8",
        ),
      );
      expect(() => assertImplementationProfileShard(profile, policy, workspaceRoot)).not.toThrow();
    }
  });

  it("uses semantic tokens and required preference fallbacks without banned styling", () => {
    const tokenCss = readFileSync(
      resolve(workspaceRoot, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    for (const [layer, id] of [
      ["kits", "file-manager"],
      ["kits", "scheduler-kit"],
      ["components", "notification-center"],
    ] as const) {
      const css = readFileSync(
        resolve(workspaceRoot, `registry/source/${layer}/${id}/${id}.css`),
        "utf8",
      );
      const tokens = [...css.matchAll(/var\((--mrg-semantic-[a-z0-9-]+)/gu)].map(
        (match) => match[1]!,
      );
      expect(tokens.length).toBeGreaterThan(12);
      expect(tokens.every((token) => tokenCss.includes(`${token}:`))).toBe(true);
      expect(css).toContain("@media (forced-colors: active)");
      expect(css).toContain("@media (prefers-reduced-motion: reduce)");
      expect(css).not.toMatch(
        /(?:gradient\(|backdrop-filter|border-radius:\s*(?:2[0-9]|[3-9][0-9])px)/u,
      );
    }
  });
});
