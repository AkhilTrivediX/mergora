import { createHash } from "node:crypto";

export const CANONICAL_REPOSITORY = "AkhilTrivediX/mergora";
export const CANONICAL_REPOSITORY_URL = "https://github.com/AkhilTrivediX/mergora";

export const PUBLIC_PACKAGE_DEFINITIONS = Object.freeze([
  { directory: "packages/contracts", mapPath: ["public", "contracts"], role: "contracts" },
  { directory: "packages/registry", mapPath: ["public", "registry"], role: "registry" },
  { directory: "packages/schema", mapPath: ["public", "schema"], role: "schema" },
  { directory: "packages/tokens", mapPath: ["public", "tokens"], role: "tokens" },
  { directory: "packages/ui", mapPath: ["public", "ui"], role: "ui" },
  { directory: "packages/cli", mapPath: ["cli", "package"], role: "cli" },
  { directory: "packages/mcp", mapPath: ["public", "mcp"], role: "mcp" },
]);

const channelContracts = Object.freeze({
  next: {
    environment: "npm-next",
    ref: "refs/heads/main",
    workflow: "publish-next.yml",
  },
  stable: {
    environment: "npm-production",
    workflow: "publish-production.yml",
  },
});

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export class PublicationContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "PublicationContractError";
  }
}

function fail(message) {
  throw new PublicationContractError(message);
}

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function nonempty(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be non-empty.`);
  return value;
}

function exactSha(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/u.test(value)) {
    fail(`${label} must be an exact lowercase 40-character commit SHA.`);
  }
  return value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function semver(value, label) {
  const match = typeof value === "string" ? semverPattern.exec(value) : null;
  if (match === null) fail(`${label} must be a complete SemVer version.`);
  if (value === "0.0.0") fail(`${label} cannot use the unreleased 0.0.0 sentinel.`);
  return { prerelease: match[4] !== undefined, value };
}

function mapValue(packageMap, path) {
  let value = packageMap;
  for (const segment of path) value = record(value, "Public package map")[segment];
  return nonempty(value, `Public package map ${path.join(".")}`);
}

function repositoryUrl(manifest, packageName) {
  const repository = record(manifest.repository, `${packageName} repository`);
  const url = nonempty(repository.url, `${packageName} repository.url`);
  if (url !== "git+https://github.com/AkhilTrivediX/mergora.git") {
    fail(`${packageName} repository.url must identify the exact official public repository.`);
  }
}

function authenticationVariables(environment) {
  return Object.entries(environment)
    .filter(
      ([key, value]) =>
        typeof value === "string" &&
        value !== "" &&
        /^(?:NODE_AUTH_TOKEN|NPM_TOKEN|NPM_AUTH_TOKEN|NPM_CONFIG__AUTH)$/u.test(key),
    )
    .map(([key]) => key);
}

export function validatePublicationContext(channel, environment) {
  const contract = channelContracts[channel];
  if (contract === undefined) fail(`Unknown publication channel ${JSON.stringify(channel)}.`);
  if (environment.GITHUB_ACTIONS !== "true") {
    fail(
      "Publication is restricted to the protected GitHub Actions workflow; local invocation is read-only and cannot publish.",
    );
  }
  if (environment.GITHUB_REPOSITORY !== CANONICAL_REPOSITORY) {
    fail(`Publication is restricted to ${CANONICAL_REPOSITORY}.`);
  }
  if (environment.GITHUB_EVENT_NAME !== "workflow_dispatch") {
    fail(
      "Publication requires an explicit workflow_dispatch event; pull requests and automatic events cannot publish.",
    );
  }
  if (environment.GITHUB_HEAD_REF || environment.GITHUB_BASE_REF) {
    fail("Pull-request refs cannot enter a publication environment.");
  }
  if (environment.GITHUB_REF_PROTECTED !== "true") {
    fail(
      "The selected branch or tag must be covered by an active GitHub ruleset before publication.",
    );
  }
  if (environment.MERGORA_RELEASE_ENVIRONMENT !== contract.environment) {
    fail(`Publication requires the protected ${contract.environment} environment.`);
  }
  const authentication = authenticationVariables(environment);
  if (authentication.length > 0) {
    fail(`Long-lived npm authentication is forbidden (${authentication.join(", ")}).`);
  }
  nonempty(environment.ACTIONS_ID_TOKEN_REQUEST_URL, "GitHub OIDC request URL");
  nonempty(environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN, "GitHub OIDC request token");
  nonempty(environment.MERGORA_GITHUB_TOKEN, "Short-lived GitHub Actions token");
  if (!/^[1-9]\d*$/u.test(environment.GITHUB_RUN_ID ?? "")) {
    fail("GITHUB_RUN_ID must identify the current Actions run.");
  }
  if (!/^[1-9]\d*$/u.test(environment.MERGORA_VERIFICATION_RUN_ID ?? "")) {
    fail("MERGORA_VERIFICATION_RUN_ID must identify a prior release verification run.");
  }
  if (environment.GITHUB_RUN_ID === environment.MERGORA_VERIFICATION_RUN_ID) {
    fail("Publication must consume a distinct, already completed release verification run.");
  }

  const commit = exactSha(environment.MERGORA_CANDIDATE_COMMIT, "Candidate commit");
  if (exactSha(environment.GITHUB_SHA, "GITHUB_SHA") !== commit) {
    fail("The confirmed candidate commit must equal the immutable workflow ref commit.");
  }

  let expectedRef = contract.ref;
  let tag = null;
  if (channel === "stable") {
    tag = nonempty(environment.MERGORA_RELEASE_TAG, "Stable release tag");
    const parsedTag = /^v(.+)$/u.exec(tag);
    if (parsedTag === null) fail("Stable release tags must use the exact v<SemVer> form.");
    const parsedVersion = semver(parsedTag[1], "Stable release tag version");
    if (parsedVersion.prerelease) fail("Stable release tags cannot contain a prerelease version.");
    expectedRef = `refs/tags/${tag}`;
  }
  if (environment.GITHUB_REF !== expectedRef) {
    fail(`Publication must be dispatched from ${expectedRef}.`);
  }

  const expectedWorkflowRef = `${CANONICAL_REPOSITORY}/.github/workflows/${contract.workflow}@${expectedRef}`;
  if (environment.GITHUB_WORKFLOW_REF !== expectedWorkflowRef) {
    fail(`Trusted publication requires the exact workflow identity ${expectedWorkflowRef}.`);
  }

  return Object.freeze({
    channel,
    commit,
    environment: contract.environment,
    ref: expectedRef,
    repository: CANONICAL_REPOSITORY,
    tag,
    verificationRunId: environment.MERGORA_VERIFICATION_RUN_ID,
    workflow: contract.workflow,
  });
}

export function validatePackageTopology({ channel, packageMap, rootManifest, manifests }) {
  const map = record(packageMap, "Public package map");
  if (map.schemaVersion !== 1 || map.selectionStatus !== "verified") {
    fail("Public package selection must be the committed, schema-v1 verified map.");
  }
  if (map.repository !== CANONICAL_REPOSITORY_URL) {
    fail("Public package map repository identity does not match the official repository.");
  }
  const root = record(rootManifest, "Workspace manifest");
  const rootVersion = semver(root.version, "Workspace product version");
  if (channel === "next" && !rootVersion.prerelease) {
    fail("The next channel requires a prerelease workspace product version.");
  }
  if (channel === "stable" && rootVersion.prerelease) {
    fail("The stable channel requires a non-prerelease workspace product version.");
  }

  const selected = [];
  const byName = new Map();
  for (const definition of PUBLIC_PACKAGE_DEFINITIONS) {
    const expectedName = mapValue(map, definition.mapPath);
    const manifest = record(
      manifests[definition.directory],
      `${definition.directory}/package.json`,
    );
    if (manifest.name !== expectedName) {
      fail(`${definition.directory} must use selected public package name ${expectedName}.`);
    }
    if (manifest.private !== false) {
      fail(
        `${expectedName} is still private; the reviewed version commit must set private:false before publication.`,
      );
    }
    const version = semver(manifest.version, `${expectedName} version`);
    if (channel === "next" && !version.prerelease) {
      fail(
        `${expectedName}@${version.value} is not a prerelease and cannot enter the next transaction.`,
      );
    }
    if (channel === "stable" && version.prerelease) {
      fail(
        `${expectedName}@${version.value} is a prerelease and cannot enter the stable transaction.`,
      );
    }
    if (manifest.license !== "MIT") fail(`${expectedName} must publish with the MIT license.`);
    repositoryUrl(manifest, expectedName);
    if (byName.has(expectedName)) fail(`Public package map repeats ${expectedName}.`);
    const item = { ...definition, manifest, name: expectedName, version: version.value };
    byName.set(expectedName, item);
    selected.push(item);
  }

  const ui = selected.find(({ role }) => role === "ui");
  const tokens = selected.find(({ role }) => role === "tokens");
  if (ui.version !== tokens.version || ui.version !== rootVersion.value) {
    fail("Workspace, UI, and tokens versions must form one fixed coherent release identity.");
  }

  const edges = new Map(selected.map(({ name }) => [name, new Set()]));
  const dependents = new Map(selected.map(({ name }) => [name, new Set()]));
  for (const item of selected) {
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      const dependencies = item.manifest[field];
      if (dependencies === undefined) continue;
      for (const [dependencyName, range] of Object.entries(
        record(dependencies, `${item.name} ${field}`),
      )) {
        if (!byName.has(dependencyName)) continue;
        if (typeof range !== "string" || range.trim() === "") {
          fail(`${item.name} has an invalid internal ${field} range for ${dependencyName}.`);
        }
        edges.get(item.name).add(dependencyName);
        dependents.get(dependencyName).add(item.name);
      }
    }
  }

  const remaining = new Map([...edges].map(([name, dependencies]) => [name, dependencies.size]));
  const ready = [...remaining]
    .filter(([, count]) => count === 0)
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const orderedNames = [];
  while (ready.length > 0) {
    const name = ready.shift();
    orderedNames.push(name);
    for (const dependent of dependents.get(name)) {
      const count = remaining.get(dependent) - 1;
      remaining.set(dependent, count);
      if (count === 0) {
        ready.push(dependent);
        ready.sort((left, right) => left.localeCompare(right, "en-US"));
      }
    }
  }
  if (orderedNames.length !== selected.length) fail("Public package dependencies contain a cycle.");

  return Object.freeze({
    byName,
    channel,
    order: Object.freeze(orderedNames.map((name) => Object.freeze(byName.get(name)))),
    productVersion: rootVersion.value,
  });
}

function artifactMap(artifacts, label) {
  if (!Array.isArray(artifacts)) fail(`${label} artifacts must be an array.`);
  const result = new Map();
  for (const value of artifacts) {
    const artifact = record(value, `${label} artifact`);
    const name = nonempty(artifact.name, `${label} artifact name`);
    if (result.has(name)) fail(`${label} repeats artifact ${name}.`);
    if (!/^[a-f0-9]{64}$/u.test(artifact.sha256 ?? "")) {
      fail(`${label} artifact ${name} has an invalid canonical SHA-256 digest.`);
    }
    if (typeof artifact.file !== "string" || !/^[A-Za-z0-9._-]+\.tgz$/u.test(artifact.file)) {
      fail(`${label} artifact ${name} has an unsafe tarball filename.`);
    }
    result.set(name, artifact);
  }
  return result;
}

export function validateReleaseEvidence({
  channel,
  commit,
  packedEvidence,
  packedEvidenceBytes,
  summary,
  topology,
}) {
  const release = record(summary, "Release evidence summary");
  if (
    release.schemaVersion !== 1 ||
    release.kind !== "mergora-automated-release-prerequisite-evidence" ||
    release.result !== "passed" ||
    release.publicationStatus !== "not-authorized"
  ) {
    fail("Release evidence summary is not a passed, non-publishing schema-v1 prerequisite record.");
  }
  if (exactSha(release.commit, "Release evidence commit") !== commit) {
    fail("Release evidence was produced for a different commit.");
  }
  if (release.productVersion !== topology.productVersion) {
    fail("Release evidence product version does not match the coherent package topology.");
  }
  const packed = record(packedEvidence, "Packed consumer evidence");
  if (
    packed.schemaVersion !== 1 ||
    packed.artifactKind !== "p1-packed-consumer-evidence" ||
    packed.artifactDigestAlgorithm !== "sha256-canonical-tar-content-v1" ||
    packed.publicationStatus !== "unreleased"
  ) {
    fail("Packed consumer evidence is not the expected unreleased exact-tarball record.");
  }
  if (!Array.isArray(packed.consumers) || packed.consumers.length === 0) {
    fail("Packed consumer evidence does not contain clean consumer results.");
  }
  if (
    packed.consumers.some((consumer) => record(consumer, "Packed consumer").result !== "passed")
  ) {
    fail("Every packed consumer must pass before publication.");
  }
  const packedBinding = record(release.packedConsumerEvidence, "Packed evidence binding");
  if (packedBinding.artifactDigestAlgorithm !== packed.artifactDigestAlgorithm) {
    fail("Release summary and packed evidence use different artifact digest algorithms.");
  }
  if (packedBinding.sha256 !== sha256(packedEvidenceBytes)) {
    fail("Packed consumer evidence bytes do not match the release summary digest.");
  }

  const releaseArtifacts = artifactMap(release.artifacts, "Release summary");
  const packedArtifacts = artifactMap(packed.artifacts, "Packed evidence");
  if (
    releaseArtifacts.size !== topology.order.length ||
    packedArtifacts.size !== topology.order.length
  ) {
    fail("Release evidence must contain exactly the selected public package set.");
  }
  for (const item of topology.order) {
    const releaseArtifact = releaseArtifacts.get(item.name);
    const packedArtifact = packedArtifacts.get(item.name);
    if (releaseArtifact === undefined || packedArtifact === undefined) {
      fail(`Release evidence is missing ${item.name}.`);
    }
    if (
      releaseArtifact.version !== item.version ||
      packedArtifact.version !== item.version ||
      releaseArtifact.sha256 !== packedArtifact.sha256 ||
      releaseArtifact.file !== packedArtifact.file
    ) {
      fail(`Release evidence does not bind the exact ${item.name}@${item.version} tarball.`);
    }
  }
  for (const name of releaseArtifacts.keys()) {
    if (!topology.byName.has(name)) fail(`Release evidence contains unselected package ${name}.`);
  }

  if (channel === "stable") {
    const authorization = record(
      release.stableAuthorization,
      "Stable release evidence stableAuthorization",
    );
    if (
      authorization.status !== "approved" ||
      authorization.commit !== commit ||
      authorization.manualEvidence !== "passed" ||
      authorization.independentReview !== "passed" ||
      !/^[a-f0-9]{64}$/u.test(authorization.completionManifestSha256 ?? "")
    ) {
      fail(
        "Stable publication requires approved manual, independent-review, and completion-manifest evidence for the exact commit.",
      );
    }
  }

  return Object.freeze({ packedArtifacts, releaseArtifacts });
}

export function assertPackedArtifactsMatchEvidence(actualArtifacts, evidenceArtifacts, topology) {
  const actual = artifactMap(actualArtifacts, "Rebuilt package");
  if (actual.size !== topology.order.length) {
    fail("The trusted rebuild did not produce the exact selected package set.");
  }
  for (const item of topology.order) {
    const rebuilt = actual.get(item.name);
    const expected = evidenceArtifacts.get(item.name);
    if (rebuilt === undefined || expected === undefined)
      fail(`Tarball evidence is missing ${item.name}.`);
    if (
      rebuilt.version !== item.version ||
      rebuilt.file !== expected.file ||
      rebuilt.sha256 !== expected.sha256
    ) {
      fail(`Trusted rebuild digest mismatch for ${item.name}@${item.version}.`);
    }
  }
}
