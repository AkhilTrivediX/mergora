import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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
const fixtureWorkspaceRoot = resolve(process.env.MERGORA_VISUAL_FIXTURE_ROOT ?? workspaceRoot);

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
        source: {
          phase: process.env.MERGORA_VISUAL_PHASE ?? "standalone",
          sourceId: process.env.MERGORA_VISUAL_SOURCE_ID ?? "working-tree",
        },
        limitations: [
          "Review and release eligibility are declared only by the cross-commit run summary, never by an isolated capture.",
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
  const manifestPath = resolve(fixtureWorkspaceRoot, "assets", "fonts", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    readonly families?: readonly {
      readonly asset?: string;
      readonly family?: string;
      readonly sha256?: string;
    }[];
  };
  if (!Array.isArray(manifest.families) || manifest.families.length === 0) {
    throw new Error(`Font manifest has no family records: ${manifestPath}`);
  }

  const records = [];
  for (const family of manifest.families) {
    if (
      typeof family.asset !== "string" ||
      typeof family.family !== "string" ||
      !/^[a-f0-9]{64}$/u.test(family.sha256 ?? "")
    ) {
      throw new Error(`Font manifest family record is incomplete: ${manifestPath}`);
    }
    const bytes = await readFile(resolve(fixtureWorkspaceRoot, "assets", "fonts", family.asset));
    const actualDigest = createHash("sha256").update(bytes).digest("hex");
    if (actualDigest !== family.sha256) {
      throw new Error(`Font bytes do not match the manifest digest: ${family.asset}`);
    }
    records.push({ asset: family.asset, family: family.family, sha256: actualDigest });
  }
  records.sort((left, right) => left.family.localeCompare(right.family));
  return `sha256:${createHash("sha256").update(JSON.stringify(records)).digest("hex")}`;
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
  readonly phase: "baseline" | "candidate" | "standalone";
  readonly projectName: string;
  readonly runId: string;
  readonly width: number;
  readonly height: number;
}

export async function captureFixtureVisual({
  browser,
  mode: rawMode,
  page,
  phase,
  projectName: rawProjectName,
  runId: rawRunId,
  width,
  height,
}: CaptureFixtureVisualOptions) {
  const mode = safeSegment(rawMode, "Visual mode");
  const projectName = safeSegment(rawProjectName, "Playwright project name");
  const runId = safeSegment(rawRunId, "Visual run id");
  const artifact = `artifacts/browser-evidence/visual-regression/${runId}/${phase}/${projectName}/${mode}.png`;
  const adapter = createPlaywrightVisualCaptureAdapter({ writeArtifact: writeVisualArtifact });

  return captureVisual(
    adapter,
    {
      page,
      referenceId: `p1-tracer-${mode}-${projectName}-${phase}`,
      artifact,
    },
    {
      itemId: "p1-tracer",
      stateId: `${mode}-${phase}`,
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

export async function stageFixtureVisualBaseline(options: {
  readonly mode: string;
  readonly projectName: string;
  readonly runId: string;
  readonly snapshotPath: string;
}): Promise<{ readonly artifact: string; readonly digest: string }> {
  const mode = safeSegment(options.mode, "Visual mode");
  const projectName = safeSegment(options.projectName, "Playwright project name");
  const runId = safeSegment(options.runId, "Visual run id");
  const artifact = `artifacts/browser-evidence/visual-regression/${runId}/baseline/${projectName}/${mode}.png`;
  const source = absoluteArtifactPath(artifact);
  const snapshotPath = resolve(options.snapshotPath);
  const allowedPrefix = `${evidenceRoot}${sep}`;
  if (!snapshotPath.startsWith(allowedPrefix)) {
    throw new Error(`Playwright visual snapshots must remain under ${evidenceRoot}`);
  }
  const bytes = await readFile(source);
  await mkdir(dirname(snapshotPath), { recursive: true });
  await copyFile(source, snapshotPath);
  return {
    artifact,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
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
