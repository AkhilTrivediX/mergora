/// <reference lib="esnext.disposable" />
/// <reference types="node" />

import type { Page } from "@playwright/test";

import type { EvidenceReference } from "../evidence.js";
import type { VisualCaptureAdapter, VisualCaptureRequest } from "../runtime-contracts.js";
import { HarnessConfigurationError, RuntimeCapabilityError } from "../runtime-capability.js";
import { isCatalogId, isImmutableHttpsUrl, isProjectRelativePath } from "../validation.js";

export interface PlaywrightVisualTarget {
  readonly page: PlaywrightVisualPage;
  readonly referenceId: string;
  readonly artifact: string;
}

export type PlaywrightVisualPage = Pick<Page, "locator" | "screenshot" | "viewportSize">;

export interface VisualArtifactWrite {
  readonly artifact: string;
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly request: VisualCaptureRequest;
}

export type VisualArtifactWriter = (write: VisualArtifactWrite) => void | Promise<void>;

export interface PlaywrightVisualAdapterOptions {
  /** Persists the bytes. The adapter never claims a reference before this hook resolves. */
  readonly writeArtifact?: VisualArtifactWriter;
  /** A test seam; omit it to use Web Crypto from the active runtime. */
  readonly crypto?: Pick<Crypto, "subtle">;
}

function hexadecimal(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function digestBytes(
  bytes: Uint8Array,
  cryptoRuntime: Pick<Crypto, "subtle">,
): Promise<string> {
  const input = new Uint8Array(bytes).buffer;
  const digest = await cryptoRuntime.subtle.digest("SHA-256", input);
  return `sha256:${hexadecimal(digest)}`;
}

/** Captures actual Playwright PNG bytes, hashes them, persists them, then returns a reference. */
export function createPlaywrightVisualCaptureAdapter(
  configuration: PlaywrightVisualAdapterOptions = {},
): VisualCaptureAdapter<PlaywrightVisualTarget> {
  return {
    async capture(target, request): Promise<EvidenceReference> {
      if (
        target?.page === undefined ||
        typeof target.page.screenshot !== "function" ||
        typeof target.page.locator !== "function" ||
        typeof target.page.viewportSize !== "function"
      ) {
        throw new RuntimeCapabilityError(
          "playwright-page",
          "Visual capture requires a live Page with locator(), viewportSize(), and screenshot().",
        );
      }
      if (configuration.writeArtifact === undefined) {
        throw new RuntimeCapabilityError(
          "visual-artifact-writer",
          "Visual capture requires a writer that persists the captured bytes.",
        );
      }
      if (
        !isCatalogId(target.referenceId) ||
        (!isProjectRelativePath(target.artifact) && !isImmutableHttpsUrl(target.artifact))
      ) {
        throw new HarnessConfigurationError(
          "playwright-visual.invalid-target",
          "Visual capture target requires a catalog reference id and immutable artifact location.",
        );
      }

      const viewport = target.page.viewportSize();
      if (
        viewport === null ||
        viewport.width !== request.width ||
        viewport.height !== request.height
      ) {
        throw new HarnessConfigurationError(
          "playwright-visual.viewport-mismatch",
          "The live Playwright viewport must exactly match the visual capture request.",
        );
      }
      const cryptoRuntime = configuration.crypto ?? globalThis.crypto;
      if (cryptoRuntime?.subtle === undefined) {
        throw new RuntimeCapabilityError(
          "web-crypto",
          "Visual capture requires SubtleCrypto to bind evidence to screenshot bytes.",
        );
      }

      const masks = request.masks.map((mask) => target.page.locator(mask.selector));
      const captured = await target.page.screenshot({
        animations: "disabled",
        caret: "hide",
        fullPage: false,
        mask: masks,
        scale: "css",
        type: "png",
      });
      const bytes = new Uint8Array(captured);
      if (bytes.byteLength === 0) {
        throw new HarnessConfigurationError(
          "playwright-visual.empty-capture",
          "Playwright returned an empty screenshot.",
        );
      }
      const digest = await digestBytes(bytes, cryptoRuntime);
      await configuration.writeArtifact({
        artifact: target.artifact,
        bytes,
        digest,
        request,
      });
      return { id: target.referenceId, artifact: target.artifact, digest };
    },
  };
}
