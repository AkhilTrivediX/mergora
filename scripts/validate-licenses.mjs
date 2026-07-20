import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const corepack =
  process.platform === "win32"
    ? {
        command: process.execPath,
        prefix: [
          resolve(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js"),
        ],
      }
    : { command: "corepack", prefix: [] };

const ordinaryAllowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "ISC",
  "MIT",
  "MPL-2.0",
]);

const sharpRuntimeLicenses = new Set([
  "Apache-2.0 AND LGPL-3.0-or-later",
  "Apache-2.0 OR LGPL-3.0-or-later",
  "LGPL-3.0-or-later",
]);

const publishCandidates = [
  ["packages/cli", "cli"],
  ["packages/contracts", "contracts"],
  ["packages/mcp", "mcp"],
  ["packages/registry", "registry"],
  ["packages/schema", "schema"],
  ["packages/tokens", "tokens"],
  ["packages/ui", "ui"],
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function validateDependencyLicenseReport(report) {
  const issues = [];
  if (report === null || typeof report !== "object" || Array.isArray(report)) {
    return ["Production dependency license report must be a JSON object."];
  }

  for (const [license, entries] of Object.entries(report).sort(([left], [right]) =>
    left.localeCompare(right, "en-US"),
  )) {
    if (!ordinaryAllowedLicenses.has(license) && !sharpRuntimeLicenses.has(license)) {
      issues.push(`Production dependency license ${JSON.stringify(license)} is not allowed.`);
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      issues.push(`Production dependency license ${JSON.stringify(license)} has no packages.`);
      continue;
    }
    for (const entry of entries) {
      const name = typeof entry?.name === "string" ? entry.name : "<missing-name>";
      if (entry?.license !== license) {
        issues.push(
          `${name} reports ${JSON.stringify(entry?.license)} under group ${JSON.stringify(license)}.`,
        );
      }
      if (
        !Array.isArray(entry?.versions) ||
        entry.versions.length === 0 ||
        entry.versions.some((version) => typeof version !== "string" || version === "")
      ) {
        issues.push(`${name} has no concrete installed version in the license report.`);
      }
      if (sharpRuntimeLicenses.has(license) && !name.startsWith("@img/sharp-")) {
        issues.push(
          `${name} uses the narrowly allowed Sharp/libvips runtime license ${JSON.stringify(license)}.`,
        );
      }
    }
  }
  return issues;
}

export function validateRepositoryLicenseFiles(root = workspaceRoot) {
  const issues = [];
  const rootManifest = readJson(resolve(root, "package.json"));
  const rootLicensePath = resolve(root, "LICENSE");
  if (rootManifest.license !== "MIT") issues.push("The root package must declare license MIT.");
  if (!existsSync(rootLicensePath)) {
    issues.push("The repository LICENSE file is missing.");
  } else {
    const rootLicense = readFileSync(rootLicensePath, "utf8");
    for (const required of [
      "MIT License",
      "Permission is hereby granted, free of charge",
      "The above copyright notice and this permission notice shall be included",
    ]) {
      if (!rootLicense.includes(required)) {
        issues.push(`The repository LICENSE file is missing ${JSON.stringify(required)}.`);
      }
    }
  }

  const names = readJson(resolve(root, "config/public-packages.json"));
  const expectedNames = { cli: names.cli?.package, ...names.public };
  for (const [directory, role] of publishCandidates) {
    const manifest = readJson(resolve(root, directory, "package.json"));
    if (manifest.name !== expectedNames[role]) {
      issues.push(
        `${directory}/package.json name ${JSON.stringify(manifest.name)} does not match the approved ${role} package identity.`,
      );
    }
    if (manifest.license !== "MIT") {
      issues.push(`${directory}/package.json must declare license MIT before it can be published.`);
    }
    if (manifest.bundledDependencies !== undefined || manifest.bundleDependencies !== undefined) {
      issues.push(
        `${directory}/package.json must not bundle undeclared third-party license obligations.`,
      );
    }
  }

  const fontRoot = resolve(root, "assets/fonts");
  const fontManifest = readJson(resolve(fontRoot, "manifest.json"));
  if (!Array.isArray(fontManifest.families) || fontManifest.families.length === 0) {
    issues.push("The font manifest must inventory every distributed font family.");
    return issues;
  }

  const assets = new Set();
  for (const family of fontManifest.families) {
    const label = typeof family?.family === "string" ? family.family : "<unnamed-font>";
    if (family?.licenseSpdx !== "OFL-1.1") {
      issues.push(`${label} must declare the reviewed OFL-1.1 font license.`);
    }
    for (const [field, expectedDigest] of [
      [family?.asset, family?.sha256],
      [family?.license, family?.licenseSha256],
    ]) {
      if (typeof field !== "string" || field === "" || basename(field) !== field) {
        issues.push(`${label} has an unsafe or missing font artifact path.`);
        continue;
      }
      const path = resolve(fontRoot, field);
      if (!existsSync(path)) {
        issues.push(`${label} artifact ${field} is missing.`);
      } else if (typeof expectedDigest !== "string" || sha256(path) !== expectedDigest) {
        issues.push(`${label} artifact ${field} does not match its reviewed SHA-256.`);
      }
    }
    if (typeof family?.asset === "string") assets.add(family.asset);
    if (typeof family?.license === "string" && basename(family.license) === family.license) {
      const licensePath = resolve(fontRoot, family.license);
      if (
        existsSync(licensePath) &&
        !readFileSync(licensePath, "utf8").includes("SIL OPEN FONT LICENSE Version 1.1")
      ) {
        issues.push(`${label} notice ${family.license} is not an OFL-1.1 license text.`);
      }
    }
  }

  for (const subset of fontManifest.siteSubsets ?? []) {
    const label = typeof subset?.asset === "string" ? subset.asset : "<unnamed-subset>";
    if (typeof subset?.asset !== "string" || basename(subset.asset) !== subset.asset) {
      issues.push(`Site font subset ${label} has an unsafe asset path.`);
      continue;
    }
    const subsetPath = resolve(fontRoot, subset.asset);
    if (!existsSync(subsetPath)) {
      issues.push(`Site font subset ${label} is missing.`);
    } else if (typeof subset.sha256 !== "string" || sha256(subsetPath) !== subset.sha256) {
      issues.push(`Site font subset ${label} does not match its reviewed SHA-256.`);
    }
    if (!assets.has(subset.sourceAsset)) {
      issues.push(`Site font subset ${label} does not identify a licensed source asset.`);
    }
  }

  return issues;
}

function installedProductionLicenses() {
  const result = spawnSync(
    corepack.command,
    [...corepack.prefix, "pnpm@11.14.0", "licenses", "list", "--prod", "--json"],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
      shell: false,
      windowsHide: true,
    },
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `pnpm licenses list failed with exit status ${String(result.status)}: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return JSON.parse(result.stdout);
}

function run() {
  const repositoryIssues = validateRepositoryLicenseFiles();
  const dependencyReport = installedProductionLicenses();
  const dependencyIssues = validateDependencyLicenseReport(dependencyReport);
  const issues = [...repositoryIssues, ...dependencyIssues];
  if (issues.length > 0) {
    throw new Error(
      `License validation found ${String(issues.length)} issue(s):\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
  }
  const packageCount = Object.values(dependencyReport).reduce(
    (total, entries) => total + entries.length,
    0,
  );
  process.stdout.write(
    `license validation passed: ${String(publishCandidates.length)} publish candidates, ${String(packageCount)} installed production dependency records, and all bundled font notices are accounted for\n`,
  );
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`license validation failed: ${message}\n`);
    process.exitCode = 1;
  }
}
