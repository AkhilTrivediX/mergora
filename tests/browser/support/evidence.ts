import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { release as osRelease, platform as osPlatform } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Browser, Page } from "@playwright/test";

import {
  createPlaywrightVisualCaptureAdapter,
  type VisualArtifactWrite,
} from "../../../packages/test-utils/src/adapters/playwright-visual.ts";
import { captureVisual } from "../../../packages/test-utils/src/runtime-contracts.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const evidenceRoot = resolve(workspaceRoot, "artifacts", "browser-evidence");

function exactVersion(value: string, subject: string): string {
  const match = value.match(/\d+(?:\.\d+)+/u);
  if (match === null)
    throw new Error(`${subject} did not expose an exact numeric version: ${value}`);
  return match[0];
}

function safeSegment(value: string, subject: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new Error(`${subject} is not a safe catalog-style path segment: ${value}`);
  }
  return value;
}

function absoluteArtifactPath(artifact: string): string {
  const target = resolve(workspaceRoot, ...artifact.split("/"));
  const allowedPrefix = `${evidenceRoot}${sep}`;
  if (!target.startsWith(allowedPrefix)) {
    throw new Error(`Browser evidence must remain under artifacts/browser-evidence: ${artifact}`);
  }
  return target;
}

async function writeVisualArtifact(write: VisualArtifactWrite): Promise<void> {
  const target = absoluteArtifactPath(write.artifact);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, write.bytes);
  await writeFile(
    target.replace(/\.png$/u, ".json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: "automated-visual-capture",
        artifact: write.artifact,
        digest: write.digest,
        request: write.request,
        limitations: [
          "This automated capture is not a reviewed visual baseline.",
          "This automated capture is not manual assistive-technology evidence.",
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function fontManifestDigest(): Promise<string> {
  const bytes = await readFile(resolve(workspaceRoot, "assets", "fonts", "manifest.json"));
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function operatingSystem(): string {
  const value = osPlatform();
  if (value === "win32") return "Windows";
  if (value === "darwin") return "macOS";
  if (value === "linux") return "Linux";
  return value;
}

export interface CaptureFixtureVisualOptions {
  readonly browser: Browser;
  readonly mode: string;
  readonly page: Page;
  readonly projectName: string;
  readonly sequence: "first" | "second";
  readonly width: number;
  readonly height: number;
}

export async function captureFixtureVisual({
  browser,
  mode: rawMode,
  page,
  projectName: rawProjectName,
  sequence,
  width,
  height,
}: CaptureFixtureVisualOptions) {
  const mode = safeSegment(rawMode, "Visual mode");
  const projectName = safeSegment(rawProjectName, "Playwright project name");
  const artifact = `artifacts/browser-evidence/visual/${projectName}/${mode}-${sequence}.png`;
  const adapter = createPlaywrightVisualCaptureAdapter({ writeArtifact: writeVisualArtifact });

  return captureVisual(
    adapter,
    {
      page,
      referenceId: `p1-tracer-${mode}-${projectName}-${sequence}`,
      artifact,
    },
    {
      itemId: "p1-tracer",
      stateId: `${mode}-${sequence}`,
      environmentId: `${projectName}-${width}x${height}`,
      os: operatingSystem(),
      osVersion: exactVersion(osRelease(), "Operating system"),
      browser: projectName,
      browserVersion: exactVersion(browser.version(), "Browser"),
      fontDigest: await fontManifestDigest(),
      width,
      height,
      masks: [],
    },
  );
}

export async function persistJsonEvidence(
  relativeArtifact: string,
  value: unknown,
): Promise<{ readonly artifact: string; readonly digest: string }> {
  const artifact = `artifacts/browser-evidence/${relativeArtifact}`;
  const target = absoluteArtifactPath(artifact);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return {
    artifact,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}
