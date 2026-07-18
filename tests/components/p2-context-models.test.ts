import { describe, expect, it, vi } from "vitest";

import { createLayerManager } from "../../registry/source/components/layer-manager/index.ts";
import {
  nextPresenceState,
  normalizePresenceExitDeadline,
  presenceEndEventReachesDeadline,
  type PresenceState,
} from "../../registry/source/components/presence/index.ts";
import { createAnnouncementQueue } from "../../registry/source/components/sr-announcer/index.ts";

describe("P2 context infrastructure deterministic models", () => {
  it("queues priorities independently, deduplicates, and permits intentional repeats", () => {
    let time = 10_000;
    const queue = createAnnouncementQueue(1_000, () => time);

    const first = queue.enqueue("Upload complete");
    expect(first).toMatchObject({ id: 1, priority: "polite", message: "Upload complete" });
    expect(queue.enqueue(" Upload complete ")).toBeNull();
    expect(queue.enqueue("Connection lost", { priority: "assertive" })).toMatchObject({
      id: 2,
      priority: "assertive",
    });
    expect(queue.take("assertive")?.message).toBe("Connection lost");
    expect(queue.take("polite")?.message).toBe("Upload complete");

    time += 1;
    expect(queue.enqueue("Upload complete", { dedupe: false })).toMatchObject({ id: 3 });
    time += 1_000;
    expect(queue.enqueue("Upload complete")).toMatchObject({ id: 4 });
  });

  it("clears queued announcements and dedupe memory together", () => {
    const queue = createAnnouncementQueue(10_000, () => 1);
    queue.enqueue("Saved");
    queue.clear();
    expect(queue.has("polite")).toBe(false);
    expect(queue.enqueue("Saved")).not.toBeNull();
  });

  it.each<[PresenceState, boolean, PresenceState]>([
    ["unmounted", true, "entering"],
    ["entering", true, "entering"],
    ["entered", true, "entered"],
    ["exiting", true, "entering"],
    ["entered", false, "exiting"],
    ["exiting", false, "exiting"],
    ["unmounted", false, "unmounted"],
  ])("moves presence from %s with present=%s to %s", (current, present, expected) => {
    expect(nextPresenceState(current, present)).toBe(expected);
  });

  it("ignores shorter transition properties until the declared exit deadline", () => {
    expect(presenceEndEventReachesDeadline(0.08, 240)).toBe(false);
    expect(presenceEndEventReachesDeadline(0.16, 240)).toBe(false);
    expect(presenceEndEventReachesDeadline(0.24, 240)).toBe(true);
    expect(normalizePresenceExitDeadline(-20)).toBe(0);
    expect(normalizePresenceExitDeadline(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("dismisses only the top registered layer", () => {
    const manager = createLayerManager();
    const dismissed = vi.fn();
    const lowerElement = {} as HTMLElement;
    const upperElement = {} as HTMLElement;
    const unregisterLower = manager.registerLayer({
      id: "lower",
      element: lowerElement,
      modal: false,
      dismissible: true,
      onDismiss: dismissed,
    });
    const unregisterUpper = manager.registerLayer({
      id: "upper",
      element: upperElement,
      modal: true,
      dismissible: true,
      onDismiss: dismissed,
    });

    expect(manager.getSnapshot()).toMatchObject({
      layerIds: ["lower", "upper"],
      modalLayerIds: ["upper"],
      topLayerId: "upper",
    });
    expect(manager.dismissTopLayer("escape")).toBe(true);
    expect(dismissed).toHaveBeenLastCalledWith({ id: "upper", reason: "escape" });

    unregisterUpper();
    expect(manager.dismissTopLayer("escape")).toBe(true);
    expect(dismissed).toHaveBeenLastCalledWith({ id: "lower", reason: "escape" });
    unregisterLower();
    expect(manager.dismissTopLayer("escape")).toBe(false);
  });

  it("allows a non-dismissible top layer to block Escape behind it", () => {
    const manager = createLayerManager();
    const lowerDismiss = vi.fn();
    manager.registerLayer({
      id: "lower",
      element: {} as HTMLElement,
      modal: false,
      dismissible: true,
      onDismiss: lowerDismiss,
    });
    manager.registerLayer({
      id: "blocking",
      element: {} as HTMLElement,
      modal: true,
      dismissible: false,
      onDismiss: vi.fn(),
    });

    expect(manager.dismissTopLayer("escape")).toBe(false);
    expect(lowerDismiss).not.toHaveBeenCalled();
  });

  it("updates mutable layer policy without reordering the stack", () => {
    const manager = createLayerManager();
    const dismissA = vi.fn();
    const dismissB = vi.fn();
    const elementA = {} as HTMLElement;
    const elementB = {} as HTMLElement;
    manager.registerLayer({
      id: "a",
      element: elementA,
      modal: false,
      dismissible: true,
      onDismiss: dismissA,
    });
    manager.registerLayer({
      id: "b",
      element: elementB,
      modal: false,
      dismissible: true,
      onDismiss: dismissB,
    });

    manager.updateLayer({
      id: "a",
      element: elementA,
      modal: true,
      dismissible: false,
      onDismiss: dismissA,
    });

    expect(manager.getSnapshot()).toMatchObject({
      layerIds: ["a", "b"],
      modalLayerIds: ["a"],
      topLayerId: "b",
    });
    expect(manager.dismissTopLayer("escape")).toBe(true);
    expect(dismissB).toHaveBeenCalledOnce();
    expect(dismissA).not.toHaveBeenCalled();
  });

  it("keeps externally managed modals in stack order without changing ownership metadata", () => {
    const manager = createLayerManager();
    const nativeElement = {} as HTMLElement;
    const externalElement = {} as HTMLElement;
    const dismiss = vi.fn();
    manager.registerLayer({
      id: "native-modal",
      element: nativeElement,
      modal: true,
      dismissible: true,
      manageEnvironment: true,
      onDismiss: dismiss,
    });
    manager.registerLayer({
      id: "external-modal",
      element: externalElement,
      modal: true,
      dismissible: false,
      manageEnvironment: false,
      onDismiss: dismiss,
    });

    expect(manager.getSnapshot()).toMatchObject({
      layerIds: ["native-modal", "external-modal"],
      modalLayerIds: ["native-modal", "external-modal"],
      topLayerId: "external-modal",
    });
    expect(
      manager.getLayers().map(({ id, manageEnvironment }) => ({ id, manageEnvironment })),
    ).toEqual([
      { id: "native-modal", manageEnvironment: true },
      { id: "external-modal", manageEnvironment: false },
    ]);
    expect(manager.dismissTopLayer("escape")).toBe(false);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("rejects duplicate layer identities and restores root registration state", () => {
    const manager = createLayerManager();
    const layer = {
      id: "duplicate",
      element: {} as HTMLElement,
      modal: false,
      dismissible: true,
      onDismiss: vi.fn(),
    } as const;
    manager.registerLayer(layer);
    expect(() => manager.registerLayer(layer)).toThrow(/duplicate layer id/u);

    const root = {} as HTMLElement;
    const unregister = manager.registerApplicationRoot(root);
    expect(manager.getApplicationRoots()).toEqual([root]);
    unregister();
    expect(manager.getApplicationRoots()).toEqual([]);
  });
});
