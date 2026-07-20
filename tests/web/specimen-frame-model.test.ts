import { describe, expect, it, vi } from "vitest";

import {
  resetStorybookSpecimen,
  resetStorybookSpecimenOrReload,
  resolveStorybookId,
  type StorybookChannel,
} from "../../apps/web/src/app/specimen-frame-model";

describe("public specimen resolution", () => {
  it("matches the exact story module and export", () => {
    const index = {
      entries: {
        basic: {
          exportName: "BasicDefaults",
          id: "p2-actions--basic-defaults",
          importPath: "./src/P2Actions.stories.tsx",
          type: "story",
        },
        docs: {
          exportName: "BasicDefaults",
          id: "docs-entry",
          importPath: "./src/P2Actions.stories.tsx",
          type: "docs",
        },
      },
    };

    expect(
      resolveStorybookId(index, {
        exportName: "BasicDefaults",
        modulePath: "apps/storybook/src/P2Actions.stories.tsx",
      }),
    ).toBe("p2-actions--basic-defaults");
  });

  it("returns null for stale evidence and rejects paths outside Storybook", () => {
    expect(
      resolveStorybookId(
        { entries: {} },
        {
          exportName: "Missing",
          modulePath: "apps/storybook/src/Missing.stories.tsx",
        },
      ),
    ).toBeNull();
    expect(() =>
      resolveStorybookId(
        { entries: {} },
        { exportName: "Unsafe", modulePath: "../private/Unsafe.stories.tsx" },
      ),
    ).toThrow(/outside the Storybook workspace/u);
  });

  it("resets Storybook state and remounts without replacing the iframe document", () => {
    const emitted: { readonly eventName: string; readonly storyId: string }[] = [];
    const channel: StorybookChannel = {
      emit: (eventName, { storyId }) => emitted.push({ eventName, storyId }),
    };

    expect(resetStorybookSpecimen(channel, "p2-actions--recommended-mergora")).toBe(true);
    expect(emitted).toEqual([
      {
        eventName: "resetStoryArgs",
        storyId: "p2-actions--recommended-mergora",
      },
      {
        eventName: "forceRemount",
        storyId: "p2-actions--recommended-mergora",
      },
    ]);
    expect(resetStorybookSpecimen(undefined, "p2-actions--recommended-mergora")).toBe(false);
  });

  it("waits for the pinned preview before resetting through its usable channel", async () => {
    const emitted: { readonly eventName: string; readonly storyId: string }[] = [];
    const reload = vi.fn();
    const runtime = {
      __STORYBOOK_ADDONS_CHANNEL__: {
        emit: (eventName: string, { storyId }: { readonly storyId: string }) =>
          emitted.push({ eventName, storyId }),
      },
      __STORYBOOK_PREVIEW__: {
        currentRender: { phase: "finished" },
        ready() {
          if (this.currentRender.phase !== "finished") throw new Error("incorrect receiver");
          return Promise.resolve();
        },
      },
    };

    await expect(
      resetStorybookSpecimenOrReload(runtime, "p2-actions--recommended-mergora", reload),
    ).resolves.toBe("remounted");
    expect(reload).not.toHaveBeenCalled();
    expect(emitted).toEqual([
      {
        eventName: "resetStoryArgs",
        storyId: "p2-actions--recommended-mergora",
      },
      {
        eventName: "forceRemount",
        storyId: "p2-actions--recommended-mergora",
      },
    ]);
  });

  it.each([
    ["missing runtime", undefined],
    ["missing preview", { __STORYBOOK_ADDONS_CHANNEL__: { emit: vi.fn() } }],
    [
      "backing initialization Promise without ready()",
      {
        __STORYBOOK_ADDONS_CHANNEL__: { emit: vi.fn() },
        __STORYBOOK_PREVIEW__: {
          currentRender: { phase: "finished" },
          storeInitializationPromise: Promise.resolve(),
        },
      },
    ],
    [
      "non-Promise-like initialization",
      {
        __STORYBOOK_ADDONS_CHANNEL__: { emit: vi.fn() },
        __STORYBOOK_PREVIEW__: {
          currentRender: { phase: "finished" },
          ready: () => ({}),
        },
      },
    ],
    [
      "unfinished render",
      {
        __STORYBOOK_ADDONS_CHANNEL__: { emit: vi.fn() },
        __STORYBOOK_PREVIEW__: {
          currentRender: { phase: "rendering" },
          ready: () => Promise.resolve(),
        },
      },
    ],
    [
      "missing channel",
      {
        __STORYBOOK_PREVIEW__: {
          currentRender: { phase: "finished" },
          ready: () => Promise.resolve(),
        },
      },
    ],
  ])("falls back to one reload for %s", async (_label, runtime) => {
    const reload = vi.fn();

    await expect(
      resetStorybookSpecimenOrReload(runtime, "p2-actions--recommended-mergora", reload),
    ).resolves.toBe("reloaded");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("uses one reload when pinned preview initialization rejects", async () => {
    const reload = vi.fn();
    const runtime = {
      __STORYBOOK_ADDONS_CHANNEL__: { emit: vi.fn() },
      __STORYBOOK_PREVIEW__: {
        currentRender: { phase: "finished" },
        ready: () => Promise.reject(new Error("preview initialization failed")),
      },
    };

    await expect(
      resetStorybookSpecimenOrReload(runtime, "p2-actions--recommended-mergora", reload),
    ).resolves.toBe("reloaded");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("uses one reload after the bounded initialization wait expires", async () => {
    vi.useFakeTimers();
    try {
      const reload = vi.fn();
      const runtime = {
        __STORYBOOK_ADDONS_CHANNEL__: { emit: vi.fn() },
        __STORYBOOK_PREVIEW__: {
          currentRender: { phase: "finished" },
          ready: () => new Promise(() => undefined),
        },
      };
      const reset = resetStorybookSpecimenOrReload(
        runtime,
        "p2-actions--recommended-mergora",
        reload,
      );

      await vi.advanceTimersByTimeAsync(2_000);
      await expect(reset).resolves.toBe("reloaded");
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
