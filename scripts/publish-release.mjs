import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, readdirSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalPackedContentDigest } from "./lib/packed-content-digest.mjs";
import {
  CANONICAL_REPOSITORY,
  PublicationContractError,
  assertPackedArtifactsMatchEvidence,
  validatePackageTopology,
  validatePublicationContext,
  validateReleaseEvidence,
} from "./lib/publication-contract.mjs";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const corepackCommand = process.platform === "win32" ? "corepack.cmd" : "corepack";
const childSecretKeys = new Set([
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_URL",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "MERGORA_GITHUB_TOKEN",
]);

function usage() {
  return "Usage: node scripts/publish-release.mjs --channel <next|stable>\n";
}

function parseArguments(arguments_) {
  if (arguments_.length !== 2 || arguments_[0] !== "--channel") {
    throw new PublicationContractError(usage().trim());
  }
  if (!new Set(["next", "stable"]).has(arguments_[1])) {
    throw new PublicationContractError("Publication channel must be next or stable.");
  }
  return { channel: arguments_[1] };
}

function json(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PublicationContractError(`${label} is not readable valid JSON: ${detail}`);
  }
}

function sanitized(value) {
  return String(value).replaceAll(workspaceRoot, "<workspace>");
}

function run(command, arguments_, options = {}) {
  const childEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !childSecretKeys.has(key)),
  );
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd ?? workspaceRoot,
    encoding: "utf8",
    env: childEnvironment,
    shell: false,
    stdio: options.capture === false ? "inherit" : "pipe",
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    const detail = sanitized((result.stderr || result.stdout || "").trim());
    throw new PublicationContractError(
      `${command} ${arguments_.join(" ")} failed with exit ${String(result.status)}${detail === "" ? "" : `: ${detail}`}`,
    );
  }
  return (result.stdout ?? "").trim();
}

function requireCleanProtectedGitIdentity(context) {
  const status = run("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") {
    throw new PublicationContractError(
      "Publication requires a clean checkout; release evidence cannot be combined with local or generated drift.",
    );
  }
  const head = run("git", ["rev-parse", "HEAD"]);
  if (head !== context.commit) {
    throw new PublicationContractError(
      "Checked-out HEAD does not equal the confirmed candidate commit.",
    );
  }
  const remote = run("git", ["remote", "get-url", "origin"]);
  if (
    !new Set([
      "https://github.com/AkhilTrivediX/mergora",
      "https://github.com/AkhilTrivediX/mergora.git",
      "git@github.com:AkhilTrivediX/mergora.git",
    ]).has(remote)
  ) {
    throw new PublicationContractError(
      "Git origin does not identify the official Mergora repository.",
    );
  }
  const main = run("git", ["rev-parse", "refs/remotes/origin/main"]);
  if (context.channel === "next" && main !== head) {
    throw new PublicationContractError(
      "Prerelease publication is restricted to the exact protected origin/main tip selected at dispatch.",
    );
  }
  if (context.channel === "stable") {
    run("git", ["merge-base", "--is-ancestor", head, main]);
    const taggedCommit = run("git", ["rev-parse", `refs/tags/${context.tag}^{commit}`]);
    if (taggedCommit !== head) {
      throw new PublicationContractError(
        "Stable tag does not resolve to the checked-out candidate commit.",
      );
    }
  }
}

async function requireSuccessfulVerificationRun(context) {
  const response = await fetch(
    `https://api.github.com/repos/${CANONICAL_REPOSITORY}/actions/runs/${context.verificationRunId}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.MERGORA_GITHUB_TOKEN}`,
        "User-Agent": "mergora-protected-publication",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
    },
  );
  if (!response.ok) {
    throw new PublicationContractError(
      `GitHub could not validate release verification run ${context.verificationRunId} (HTTP ${String(response.status)}).`,
    );
  }
  const runRecord = await response.json();
  if (
    runRecord.path !== ".github/workflows/release-verify.yml" ||
    runRecord.status !== "completed" ||
    runRecord.conclusion !== "success" ||
    runRecord.head_sha !== context.commit ||
    runRecord.repository?.full_name !== CANONICAL_REPOSITORY ||
    !new Set(["pull_request", "workflow_dispatch"]).has(runRecord.event)
  ) {
    throw new PublicationContractError(
      "The referenced run is not a successful release-verify.yml execution for the exact candidate commit.",
    );
  }
}

function manifestsForPackageMap() {
  const packageMap = json(
    join(workspaceRoot, "config", "public-packages.json"),
    "Public package map",
  );
  const rootManifest = json(join(workspaceRoot, "package.json"), "Workspace manifest");
  const manifests = Object.fromEntries(
    ["contracts", "registry", "schema", "tokens", "ui", "cli", "mcp"].map((directory) => {
      const relativeDirectory = `packages/${directory}`;
      return [
        relativeDirectory,
        json(
          join(workspaceRoot, relativeDirectory, "package.json"),
          `${relativeDirectory} manifest`,
        ),
      ];
    }),
  );
  return { manifests, packageMap, rootManifest };
}

function requireStableTagVersion(context, productVersion) {
  if (context.channel === "stable" && context.tag !== `v${productVersion}`) {
    throw new PublicationContractError(
      `Stable tag ${context.tag} does not match coherent product version v${productVersion}.`,
    );
  }
}

function releaseEvidence(topology, context) {
  const summaryPath = join(
    workspaceRoot,
    "artifacts",
    "release-evidence",
    topology.productVersion,
    "summary.json",
  );
  const packedEvidencePath = join(workspaceRoot, "tests", "packed-consumers", "evidence.json");
  const packedEvidenceBytes = readFileSync(packedEvidencePath);
  const summary = json(summaryPath, "Downloaded immutable release evidence summary");
  const packedEvidence = json(packedEvidencePath, "Tracked packed consumer evidence");
  return validateReleaseEvidence({
    channel: context.channel,
    commit: context.commit,
    packedEvidence,
    packedEvidenceBytes,
    summary,
    topology,
  });
}

function versionAtLeast(actual, required) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(value);
    if (match === null) throw new PublicationContractError(`Cannot parse npm version ${value}.`);
    return match.slice(1).map(Number);
  };
  const left = parse(actual);
  const right = parse(required);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }
  return true;
}

function requireTrustedPublishingToolchain() {
  const version = run(npmCommand, ["--version"]);
  if (!versionAtLeast(version, "11.5.1")) {
    throw new PublicationContractError(
      `npm ${version} cannot use trusted publishing; the protected runner requires npm 11.5.1 or later.`,
    );
  }
}

async function requireBootstrappedPublicPackages(topology) {
  const missing = [];
  for (const item of topology.order) {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(item.name)}`, {
      headers: { Accept: "application/json", "User-Agent": "mergora-publication-preflight" },
      redirect: "error",
    });
    if (response.status === 404) missing.push(item.name);
    else if (!response.ok) {
      throw new PublicationContractError(
        `npm registry identity check for ${item.name} failed with HTTP ${String(response.status)}.`,
      );
    }
  }
  if (missing.length > 0) {
    throw new PublicationContractError(
      `Trusted publication is not bootstrapped for: ${missing.join(", ")}. Publish each exact release-verified initial tarball through the documented short-lived interactive bootstrap, configure the matching trusted publisher/environment, revoke bootstrap authority, and rerun. No npm mutation was attempted.`,
    );
  }
}

function pathIsInside(parent, child) {
  const value = relative(parent, child);
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}

function trustedRebuild(topology, evidenceArtifacts) {
  const temporaryRoot = mkdtempSync(join(realpathSync(tmpdir()), "mergora-publication-"));
  if (pathIsInside(workspaceRoot, temporaryRoot)) {
    throw new PublicationContractError(
      "Publication tarballs must be rebuilt outside the workspace.",
    );
  }
  try {
    run(
      corepackCommand,
      ["pnpm@11.14.0", ...topology.order.flatMap(({ name }) => ["--filter", name]), "build"],
      { capture: false },
    );
    const actual = [];
    for (const item of topology.order) {
      const before = new Set(readdirSync(temporaryRoot));
      run(corepackCommand, ["pnpm@11.14.0", "pack", "--pack-destination", temporaryRoot], {
        cwd: join(workspaceRoot, item.directory),
      });
      const created = readdirSync(temporaryRoot).filter(
        (file) => file.endsWith(".tgz") && !before.has(file),
      );
      if (created.length !== 1) {
        throw new PublicationContractError(
          `${item.name} must produce exactly one trusted tarball.`,
        );
      }
      const file = basename(created[0]);
      const bytes = readFileSync(join(temporaryRoot, file));
      actual.push({
        file,
        name: item.name,
        sha256: canonicalPackedContentDigest(bytes),
        version: item.version,
      });
    }
    assertPackedArtifactsMatchEvidence(actual, evidenceArtifacts, topology);
    const status = run("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
    if (status !== "") {
      throw new PublicationContractError(
        "Trusted rebuild changed tracked source or generated artifacts; publication is blocked.",
      );
    }
    return actual;
  } finally {
    const resolved = realpathSync(temporaryRoot);
    if (resolved !== realpathSync(tmpdir()) && pathIsInside(realpathSync(tmpdir()), resolved)) {
      rmSync(resolved, { force: true, recursive: true });
    }
  }
}

function blockUnsafeChannelMutation(context, artifacts) {
  const packageSet = artifacts.map(({ name, version }) => `${name}@${version}`).join(", ");
  throw new PublicationContractError(
    `Exact ${context.channel} candidate artifacts passed local preflight (${packageSet}), but no npm mutation was attempted. Current npm trusted-publisher OIDC authorizes package publish/stage operations, not the rollback-capable dist-tag transaction required to promote the whole verified set to ${context.channel === "stable" ? "latest" : "next"} only after coherent remote verification. Complete the documented package bootstrap and trusted-publisher bindings, provide a reviewed short-lived proof-of-presence channel-promotion transaction (or a registry-supported atomic set promotion), and rehearse partial-release recovery. Do not add NODE_AUTH_TOKEN or a long-lived npm secret.`,
  );
}

try {
  const { channel } = parseArguments(process.argv.slice(2));
  // This is intentionally the first action: local, fork, PR, and unprotected invocations fail
  // before filesystem, Git, network, package-manager, or registry operations.
  const context = validatePublicationContext(channel, process.env);
  requireCleanProtectedGitIdentity(context);
  await requireSuccessfulVerificationRun(context);
  const topology = validatePackageTopology({ channel, ...manifestsForPackageMap() });
  requireStableTagVersion(context, topology.productVersion);
  const evidence = releaseEvidence(topology, context);
  requireTrustedPublishingToolchain();
  await requireBootstrappedPublicPackages(topology);
  const artifacts = trustedRebuild(topology, evidence.packedArtifacts);
  blockUnsafeChannelMutation(context, artifacts);
} catch (error) {
  const message =
    error instanceof PublicationContractError
      ? error.message
      : error instanceof Error
        ? (error.stack ?? error.message)
        : String(error);
  process.stderr.write(`publication blocked: ${sanitized(message)}\n`);
  process.exitCode = 1;
}
