/// <reference lib="esnext.disposable" />
/// <reference types="node" />

import type { Page } from "@playwright/test";

import type {
  GeometryAdapter,
  GeometryMeasurement,
  GeometryOverlayMeasurement,
  GeometryTargetMeasurement,
} from "../runtime-contracts.js";
import { HarnessConfigurationError, RuntimeCapabilityError } from "../runtime-capability.js";

export interface DomGeometryTargetSpec {
  readonly id: string;
  readonly element: HTMLElement;
  readonly minimumWidth: number;
  readonly minimumHeight: number;
  readonly touch: boolean;
}

export interface DomGeometryOverlaySpec {
  readonly id: string;
  readonly element: HTMLElement;
}

export interface DomGeometryTarget {
  readonly root: HTMLElement;
  readonly focus?: HTMLElement;
  readonly targets: readonly DomGeometryTargetSpec[];
  readonly overlays: readonly DomGeometryOverlaySpec[];
}

interface RectValue {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

function readRect(element: HTMLElement, subject: string): RectValue {
  const rect = element.getBoundingClientRect();
  const values = [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height];
  if (!values.every(Number.isFinite)) {
    throw new HarnessConfigurationError(
      "dom-geometry.invalid-rectangle",
      `${subject} returned non-finite geometry.`,
    );
  }
  return rect;
}

function isVisible(element: HTMLElement, view: Window): boolean {
  const rect = readRect(element, "The focused element");
  const style = view.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.visibility !== "collapse" &&
    style.opacity !== "0"
  );
}

function isOccluded(element: HTMLElement, document: Document): boolean {
  const rect = readRect(element, "The focused element");
  const viewportRight = Math.max(0, (document.defaultView?.innerWidth ?? 0) - 1);
  const viewportBottom = Math.max(0, (document.defaultView?.innerHeight ?? 0) - 1);
  const x = Math.max(0, Math.min(viewportRight, rect.left + rect.width / 2));
  const y = Math.max(0, Math.min(viewportBottom, rect.top + rect.height / 2));
  const topElement = document.elementFromPoint(x, y);
  return topElement === null || (topElement !== element && !element.contains(topElement));
}

function isClipped(element: HTMLElement, view: Window): boolean {
  const rect = readRect(element, "An overlay");
  for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
    const style = view.getComputedStyle(ancestor);
    const clipsX = ["auto", "clip", "hidden", "scroll"].includes(style.overflowX);
    const clipsY = ["auto", "clip", "hidden", "scroll"].includes(style.overflowY);
    if (!clipsX && !clipsY) continue;
    const ancestorRect = readRect(ancestor, "An overlay clipping ancestor");
    if (
      (clipsX && (rect.left < ancestorRect.left || rect.right > ancestorRect.right)) ||
      (clipsY && (rect.top < ancestorRect.top || rect.bottom > ancestorRect.bottom))
    ) {
      return true;
    }
  }
  return false;
}

function targetMeasurement(spec: DomGeometryTargetSpec): GeometryTargetMeasurement {
  if (
    spec.id.trim().length === 0 ||
    !Number.isFinite(spec.minimumWidth) ||
    !Number.isFinite(spec.minimumHeight) ||
    spec.minimumWidth <= 0 ||
    spec.minimumHeight <= 0
  ) {
    throw new HarnessConfigurationError(
      "dom-geometry.invalid-target",
      "Geometry target ids and minimum dimensions must be explicit and positive.",
    );
  }
  const rect = readRect(spec.element, `Geometry target ${spec.id}`);
  return {
    id: spec.id,
    width: rect.width,
    height: rect.height,
    minimumWidth: spec.minimumWidth,
    minimumHeight: spec.minimumHeight,
    touch: spec.touch,
  };
}

/** Measures real browser DOM geometry without reading global state until measure() is called. */
export function createDomGeometryAdapter(): GeometryAdapter<DomGeometryTarget> {
  return {
    measure(target): GeometryMeasurement {
      if (target?.root?.ownerDocument === undefined) {
        throw new RuntimeCapabilityError(
          "dom-document",
          "DOM geometry requires a root with an ownerDocument.",
        );
      }
      const document = target.root.ownerDocument;
      const view = document.defaultView;
      if (view === null || typeof document.elementFromPoint !== "function") {
        throw new RuntimeCapabilityError(
          "dom-geometry",
          "DOM geometry requires defaultView, getComputedStyle, and elementFromPoint.",
        );
      }
      if (!Number.isFinite(target.root.scrollWidth) || !Number.isFinite(target.root.clientWidth)) {
        throw new HarnessConfigurationError(
          "dom-geometry.invalid-root",
          "The geometry root returned non-finite layout dimensions.",
        );
      }

      const focused = target.focus ?? (document.activeElement as HTMLElement | null);
      const focusVisible = focused !== null && isVisible(focused, view);
      const overlays: GeometryOverlayMeasurement[] = target.overlays.map((overlay) => {
        if (overlay.id.trim().length === 0) {
          throw new HarnessConfigurationError(
            "dom-geometry.invalid-overlay",
            "Geometry overlay ids must be non-empty.",
          );
        }
        const rect = readRect(overlay.element, `Geometry overlay ${overlay.id}`);
        return {
          id: overlay.id,
          clipped: isClipped(overlay.element, view),
          offscreen:
            rect.width <= 0 ||
            rect.height <= 0 ||
            rect.right <= 0 ||
            rect.bottom <= 0 ||
            rect.left >= view.innerWidth ||
            rect.top >= view.innerHeight,
        };
      });

      return {
        horizontalOverflowPx: Math.max(0, target.root.scrollWidth - target.root.clientWidth),
        focusVisible,
        focusOccluded: focusVisible && focused !== null ? isOccluded(focused, document) : false,
        targets: target.targets.map(targetMeasurement),
        overlays,
      };
    },
  };
}

export interface PlaywrightGeometryTargetSpec {
  readonly id: string;
  readonly selector: string;
  readonly minimumWidth: number;
  readonly minimumHeight: number;
  readonly touch: boolean;
}

export interface PlaywrightGeometryOverlaySpec {
  readonly id: string;
  readonly selector: string;
}

export interface PlaywrightGeometryTarget {
  readonly page: PlaywrightEvaluationPage;
  readonly rootSelector: string;
  readonly focusSelector?: string;
  readonly targets: readonly PlaywrightGeometryTargetSpec[];
  readonly overlays: readonly PlaywrightGeometryOverlaySpec[];
}

export type PlaywrightEvaluationPage = Pick<Page, "evaluate">;

export interface PlaywrightGeometryInput {
  readonly rootSelector: string;
  readonly focusSelector?: string;
  readonly targets: readonly PlaywrightGeometryTargetSpec[];
  readonly overlays: readonly PlaywrightGeometryOverlaySpec[];
}

function validatePlaywrightTarget(target: PlaywrightGeometryTarget): void {
  const invalidFocus =
    target.focusSelector !== undefined && target.focusSelector.trim().length === 0;
  const invalidTarget = target.targets.some(
    (entry) =>
      entry.id.trim().length === 0 ||
      entry.selector.trim().length === 0 ||
      !Number.isFinite(entry.minimumWidth) ||
      !Number.isFinite(entry.minimumHeight) ||
      entry.minimumWidth <= 0 ||
      entry.minimumHeight <= 0,
  );
  const invalidOverlay = target.overlays.some(
    (entry) => entry.id.trim().length === 0 || entry.selector.trim().length === 0,
  );
  if (invalidFocus || invalidTarget || invalidOverlay) {
    throw new HarnessConfigurationError(
      "playwright-geometry.invalid-target",
      "Playwright geometry requires non-empty ids/selectors and positive target minimums.",
    );
  }
}

function validatePlaywrightMeasurement(measurement: GeometryMeasurement): GeometryMeasurement {
  if (
    measurement == null ||
    !Array.isArray(measurement.targets) ||
    !Array.isArray(measurement.overlays)
  ) {
    throw new HarnessConfigurationError(
      "playwright-geometry.invalid-measurement",
      "Playwright returned incomplete or non-finite geometry.",
    );
  }
  const validTarget = measurement.targets.every(
    (entry) =>
      entry.id.trim().length > 0 &&
      [entry.width, entry.height, entry.minimumWidth, entry.minimumHeight].every(Number.isFinite) &&
      entry.minimumWidth > 0 &&
      entry.minimumHeight > 0 &&
      typeof entry.touch === "boolean",
  );
  const validOverlay = measurement.overlays.every(
    (entry) =>
      entry.id.trim().length > 0 &&
      typeof entry.clipped === "boolean" &&
      typeof entry.offscreen === "boolean",
  );
  if (
    !Number.isFinite(measurement.horizontalOverflowPx) ||
    measurement.horizontalOverflowPx < 0 ||
    typeof measurement.focusVisible !== "boolean" ||
    typeof measurement.focusOccluded !== "boolean" ||
    !validTarget ||
    !validOverlay
  ) {
    throw new HarnessConfigurationError(
      "playwright-geometry.invalid-measurement",
      "Playwright returned incomplete or non-finite geometry.",
    );
  }
  return measurement;
}

/**
 * Measures the same contract in the browser process. Selectors are explicit because Playwright
 * locators cannot cross the page.evaluate serialization boundary.
 */
export function createPlaywrightGeometryAdapter(): GeometryAdapter<PlaywrightGeometryTarget> {
  return {
    async measure(target): Promise<GeometryMeasurement> {
      if (target?.page === undefined || typeof target.page.evaluate !== "function") {
        throw new RuntimeCapabilityError(
          "playwright-page",
          "Playwright geometry requires a live Page with evaluate().",
        );
      }
      if (target.rootSelector.trim().length === 0) {
        throw new HarnessConfigurationError(
          "playwright-geometry.invalid-root",
          "Playwright geometry requires a root selector.",
        );
      }
      validatePlaywrightTarget(target);

      const input: PlaywrightGeometryInput = {
        rootSelector: target.rootSelector,
        ...(target.focusSelector === undefined ? {} : { focusSelector: target.focusSelector }),
        targets: target.targets,
        overlays: target.overlays,
      };
      const measurement = await target.page.evaluate((configuration): GeometryMeasurement => {
        const requireElement = (selector: string, subject: string): HTMLElement => {
          const element = document.querySelector(selector);
          if (!(element instanceof HTMLElement)) {
            throw new Error(`${subject} selector did not resolve to an HTMLElement: ${selector}`);
          }
          return element;
        };
        const visible = (element: HTMLElement): boolean => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.visibility !== "collapse" &&
            style.opacity !== "0"
          );
        };
        const occluded = (element: HTMLElement): boolean => {
          const rect = element.getBoundingClientRect();
          const top = document.elementFromPoint(
            Math.max(0, Math.min(Math.max(0, innerWidth - 1), rect.left + rect.width / 2)),
            Math.max(0, Math.min(Math.max(0, innerHeight - 1), rect.top + rect.height / 2)),
          );
          return top === null || (top !== element && !element.contains(top));
        };
        const clipped = (element: HTMLElement): boolean => {
          const rect = element.getBoundingClientRect();
          for (
            let ancestor = element.parentElement;
            ancestor !== null;
            ancestor = ancestor.parentElement
          ) {
            const style = getComputedStyle(ancestor);
            const clipsX = ["auto", "clip", "hidden", "scroll"].includes(style.overflowX);
            const clipsY = ["auto", "clip", "hidden", "scroll"].includes(style.overflowY);
            if (!clipsX && !clipsY) continue;
            const ancestorRect = ancestor.getBoundingClientRect();
            if (
              (clipsX && (rect.left < ancestorRect.left || rect.right > ancestorRect.right)) ||
              (clipsY && (rect.top < ancestorRect.top || rect.bottom > ancestorRect.bottom))
            ) {
              return true;
            }
          }
          return false;
        };

        const root = requireElement(configuration.rootSelector, "Root");
        const focus =
          configuration.focusSelector === undefined
            ? document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null
            : requireElement(configuration.focusSelector, "Focus");
        const focusVisible = focus !== null && visible(focus);

        return {
          horizontalOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
          focusVisible,
          focusOccluded: focusVisible && focus !== null ? occluded(focus) : false,
          targets: configuration.targets.map((entry) => {
            const rect = requireElement(
              entry.selector,
              `Target ${entry.id}`,
            ).getBoundingClientRect();
            return {
              id: entry.id,
              width: rect.width,
              height: rect.height,
              minimumWidth: entry.minimumWidth,
              minimumHeight: entry.minimumHeight,
              touch: entry.touch,
            };
          }),
          overlays: configuration.overlays.map((entry) => {
            const element = requireElement(entry.selector, `Overlay ${entry.id}`);
            const rect = element.getBoundingClientRect();
            return {
              id: entry.id,
              clipped: clipped(element),
              offscreen:
                rect.width <= 0 ||
                rect.height <= 0 ||
                rect.right <= 0 ||
                rect.bottom <= 0 ||
                rect.left >= innerWidth ||
                rect.top >= innerHeight,
            };
          }),
        };
      }, input);
      return validatePlaywrightMeasurement(measurement);
    },
  };
}
