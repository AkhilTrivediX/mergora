import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  assertPackedArtifactsMatchEvidence,
  validatePackageTopology,
  validatePublicationContext,
  validateReleaseEvidence,
} from "../../scripts/lib/publication-contract.mjs";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const workflowPaths = [
  ".github/workflows/changesets.yml",
  ".github/workflows/publish-next.yml",
  ".github/workflows/publish-production.yml",
] as const;

function text(path: string): string {
  return readFileSync(resolve(workspaceRoot, path), "utf8");
}

function occurrences(value: string, fragment: string): number {
  return value.split(fragment).length - 1;
}

const workflows = Object.fromEntries(workflowPaths.map((path) => [path, text(path)])) as Record<
  (typeof workflowPaths)[number],
  string
>;
const allWorkflows = Object.values(workflows).join("\n");
const publicationScript = text("scripts/publish-release.mjs");
const rootManifest = JSON.parse(text("package.json")) as {
  readonly scripts: Readonly<Record<string, string>>;
  readonly version: string;
};

const reviewedActionPins = new Map([
  ["actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0", "v7.0.0"],
  ["actions/setup-node@820762786026740c76f36085b0efc47a31fe5020", "v7.0.0"],
  ["actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c", "v8.0.1"],
  ["changesets/action@a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d", "v1.9.0"],
]);

function publicationEnvironment(channel: "next" | "stable"): Record<string, string | undefined> {
  const commit = "a".repeat(40);
  const stable = channel === "stable";
  const ref = stable ? "refs/tags/v1.2.3" : "refs/heads/main";
  const workflow = stable ? "publish-production.yml" : "publish-next.yml";
  return {
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc-request-token",
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.invalid/oidc",
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: ref,
    GITHUB_REF_PROTECTED: "true",
    GITHUB_REPOSITORY: "AkhilTrivediX/mergora",
    GITHUB_RUN_ID: "22",
    GITHUB_SHA: commit,
    GITHUB_WORKFLOW_REF: `AkhilTrivediX/mergora/.github/workflows/${workflow}@${ref}`,
    MERGORA_CANDIDATE_COMMIT: commit,
    MERGORA_GITHUB_TOKEN: "short-lived-actions-token",
    MERGORA_RELEASE_ENVIRONMENT: stable ? "npm-production" : "npm-next",
    MERGORA_RELEASE_TAG: stable ? "v1.2.3" : undefined,
    MERGORA_VERIFICATION_RUN_ID: "11",
  };
}

type JsonRecord = Record<string, unknown>;

function topologyFixture(channel: "next" | "stable") {
  const version = channel === "next" ? "1.2.3-rc.1" : "1.2.3";
  const packageMap = JSON.parse(text("config/public-packages.json")) as JsonRecord;
  const directories = ["contracts", "registry", "schema", "tokens", "ui", "cli", "mcp"];
  const manifests = Object.fromEntries(
    directories.map((directory) => {
      const manifest = JSON.parse(text(`packages/${directory}/package.json`)) as JsonRecord;
      return [`packages/${directory}`, { ...manifest, private: false, version }];
    }),
  );
  return {
    channel,
    manifests,
    packageMap,
    rootManifest: { ...rootManifest, version },
  };
}

function evidenceFixture(channel: "next" | "stable") {
  const topology = validatePackageTopology(topologyFixture(channel));
  const artifacts = topology.order.map(({ name, role, version }) => ({
    file: `${name}-${version}.tgz`,
    name,
    role,
    sha256: createHash("sha256").update(`${name}@${version}`).digest("hex"),
    version,
  }));
  const packedEvidence = {
    artifactDigestAlgorithm: "sha256-canonical-tar-content-v1",
    artifactKind: "p1-packed-consumer-evidence",
    artifacts,
    consumers: [{ id: "external-next", result: "passed" }],
    publicationStatus: "unreleased",
    schemaVersion: 1,
  };
  const packedEvidenceBytes = Buffer.from(`${JSON.stringify(packedEvidence)}\n`);
  const commit = "a".repeat(40);
  const summary = {
    artifacts,
    commit,
    kind: "mergora-automated-release-prerequisite-evidence",
    packedConsumerEvidence: {
      artifactDigestAlgorithm: packedEvidence.artifactDigestAlgorithm,
      path: "tests/packed-consumers/evidence.json",
      sha256: createHash("sha256").update(packedEvidenceBytes).digest("hex"),
    },
    productVersion: topology.productVersion,
    publicationStatus: "not-authorized",
    result: "passed",
    schemaVersion: 1,
    ...(channel === "stable"
      ? {
          stableAuthorization: {
            commit,
            completionManifestSha256: "b".repeat(64),
            independentReview: "passed",
            manualEvidence: "passed",
            status: "approved",
          },
        }
      : {}),
  };
  return { artifacts, commit, packedEvidence, packedEvidenceBytes, summary, topology };
}

describe("publication and deployment workflow contracts", () => {
  it("uses only reviewed immutable action revisions and never persists checkout credentials", () => {
    const uses = [...allWorkflows.matchAll(/^\s*uses:\s*([^\s#]+)\s+#\s+(\S+)\s*$/gmu)];
    expect(uses.length).toBeGreaterThan(0);
    for (const match of uses) {
      const action = match[1] ?? "";
      expect(action).toMatch(/@[a-f0-9]{40}$/u);
      expect(reviewedActionPins.get(action), `unreviewed action pin ${action}`).toBe(match[2]);
    }
    const checkout = "uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0";
    expect(occurrences(allWorkflows, "persist-credentials: false")).toBe(
      occurrences(allWorkflows, checkout),
    );
  });

  it("keeps Changesets version-only and Vercel deployment outside GitHub Pages authority", () => {
    const changesets = workflows[".github/workflows/changesets.yml"];
    expect(changesets).toContain("if: github.repository == 'AkhilTrivediX/mergora'");
    expect(changesets).toContain("contents: write");
    expect(changesets).toContain("pull-requests: write");
    expect(changesets).not.toContain("id-token: write");
    expect(changesets).not.toMatch(/^\s*publish:/mu);

    const vercel = JSON.parse(text("vercel.json")) as {
      readonly buildCommand?: string;
      readonly installCommand?: string;
      readonly outputDirectory?: string;
    };
    expect(vercel).toMatchObject({
      buildCommand: "node scripts/vercel-build.mjs",
      outputDirectory: "apps/web/out",
    });
    expect(vercel.installCommand).toContain("pnpm install --frozen-lockfile");
    expect(allWorkflows).not.toContain("pages: write");
    expect(allWorkflows).not.toContain("actions/deploy-pages");
    expect(allWorkflows).not.toContain("actions/upload-pages-artifact");
  });

  it("binds both npm channels to exact protected refs and prior immutable verification runs", () => {
    const next = workflows[".github/workflows/publish-next.yml"];
    const stable = workflows[".github/workflows/publish-production.yml"];
    for (const workflow of [next, stable]) {
      expect(workflow).toContain("github.repository == 'AkhilTrivediX/mergora'");
      expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
      expect(workflow).toContain("github.ref_protected");
      expect(workflow).toContain("actions: read");
      expect(workflow).toContain("contents: read");
      expect(occurrences(workflow, "id-token: write")).toBe(1);
      expect(workflow).toContain("verification_run_id:");
      expect(workflow).toContain("release-candidate-${{ inputs.commit }}");
      expect(workflow).toContain("run-id: ${{ inputs.verification_run_id }}");
      expect(workflow).toContain("repository: ${{ github.repository }}");
      expect(workflow).toContain("pnpm install --frozen-lockfile --ignore-scripts");
      expect(occurrences(workflow, "MERGORA_GITHUB_TOKEN: ${{ github.token }}")).toBe(1);
      expect(workflow).not.toContain("pull_request:");
      expect(workflow).not.toContain("NODE_AUTH_TOKEN");
      expect(workflow).not.toContain("NPM_TOKEN");
    }
    expect(next).toContain("github.ref == 'refs/heads/main'");
    expect(next).toContain("environment: npm-next");
    expect(next).toContain("run: pnpm publish:next");
    expect(stable).toContain("startsWith(github.ref, 'refs/tags/')");
    expect(stable).toContain("github.ref_name == inputs.tag");
    expect(stable).toContain("environment: npm-production");
    expect(stable).toContain("run: pnpm publish:production");
  });

  it("routes publication aliases through the guarded release command without a token fallback", () => {
    expect(rootManifest.scripts["publish:next"]).toBe(
      "node scripts/publish-release.mjs --channel next",
    );
    expect(rootManifest.scripts["publish:production"]).toBe(
      "node scripts/publish-release.mjs --channel stable",
    );
    expect(publicationScript).toContain("validatePublicationContext(channel, process.env)");
    expect(publicationScript).toContain("validateReleaseEvidence");
    expect(publicationScript).toContain("canonicalPackedContentDigest");
    expect(publicationScript).toContain("assertPackedArtifactsMatchEvidence");
    expect(publicationScript).toContain("requireBootstrappedPublicPackages");
    expect(publicationScript).toContain("blockUnsafeChannelMutation");
    expect(publicationScript).toContain('"ACTIONS_ID_TOKEN_REQUEST_TOKEN"');
    expect(publicationScript).toContain('"MERGORA_GITHUB_TOKEN"');
    expect(publicationScript).toContain("!childSecretKeys.has(key)");
    expect(publicationScript).not.toMatch(/run\(npmCommand,\s*\[\s*"(?:publish|stage|dist-tag)"/u);
    expect(allWorkflows).not.toContain("secrets.NPM");
  });

  it("rejects local and pull-request execution before any npm binary can run", () => {
    const temporary = mkdtempSync(join(tmpdir(), "mergora-publication-contract-"));
    const sentinel = join(temporary, "npm-reached");
    const npmStub = join(temporary, process.platform === "win32" ? "npm.cmd" : "npm");
    writeFileSync(
      npmStub,
      process.platform === "win32"
        ? `@echo off\r\necho reached>"${sentinel}"\r\nexit /b 99\r\n`
        : `#!/bin/sh\nprintf reached > '${sentinel}'\nexit 99\n`,
      "utf8",
    );
    if (process.platform !== "win32") chmodSync(npmStub, 0o700);
    try {
      const baseEnvironment: NodeJS.ProcessEnv = {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) =>
              !key.startsWith("GITHUB_") &&
              !key.startsWith("ACTIONS_ID_TOKEN_") &&
              !key.startsWith("MERGORA_") &&
              !new Set(["NODE_AUTH_TOKEN", "NPM_TOKEN", "NPM_AUTH_TOKEN"]).has(key),
          ),
        ),
        NODE_ENV: process.env.NODE_ENV ?? "test",
      };
      const pathEnvironment = { ...baseEnvironment, PATH: temporary, Path: temporary };
      const local = spawnSync(
        process.execPath,
        [resolve(workspaceRoot, "scripts/publish-release.mjs"), "--channel", "next"],
        { encoding: "utf8", env: pathEnvironment },
      );
      expect(local.status).toBe(1);
      expect(local.stderr).toContain("local invocation is read-only and cannot publish");
      expect(existsSync(sentinel)).toBe(false);

      const pullRequest = spawnSync(
        process.execPath,
        [resolve(workspaceRoot, "scripts/publish-release.mjs"), "--channel", "next"],
        {
          encoding: "utf8",
          env: {
            ...pathEnvironment,
            GITHUB_ACTIONS: "true",
            GITHUB_EVENT_NAME: "pull_request",
            GITHUB_REPOSITORY: "AkhilTrivediX/mergora",
          },
        },
      );
      expect(pullRequest.status).toBe(1);
      expect(pullRequest.stderr).toContain("pull requests and automatic events cannot publish");
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(temporary, { force: true, recursive: true });
    }
  });
});

describe("publication evidence and package contracts", () => {
  it("accepts only exact protected Actions identities and rejects npm token fallback", () => {
    expect(validatePublicationContext("next", publicationEnvironment("next"))).toMatchObject({
      channel: "next",
      environment: "npm-next",
      ref: "refs/heads/main",
      workflow: "publish-next.yml",
    });
    expect(validatePublicationContext("stable", publicationEnvironment("stable"))).toMatchObject({
      channel: "stable",
      environment: "npm-production",
      ref: "refs/tags/v1.2.3",
      tag: "v1.2.3",
      workflow: "publish-production.yml",
    });
    expect(() =>
      validatePublicationContext("next", {
        ...publicationEnvironment("next"),
        NODE_AUTH_TOKEN: "forbidden",
      }),
    ).toThrow(/Long-lived npm authentication is forbidden/u);
  });

  it("derives deterministic dependency order and rejects the current unreleased private sentinels", () => {
    const topology = validatePackageTopology(topologyFixture("next"));
    const names = topology.order.map(({ name }) => name);
    expect(names.indexOf("mergora-contracts")).toBeLessThan(names.indexOf("mergora"));
    expect(names.indexOf("mergora-registry")).toBeLessThan(names.indexOf("mergora"));
    expect(names.indexOf("mergora-schema")).toBeLessThan(names.indexOf("mergora"));
    expect(names.indexOf("mergora")).toBeLessThan(names.indexOf("mergora-mcp"));

    const currentManifests = Object.fromEntries(
      ["contracts", "registry", "schema", "tokens", "ui", "cli", "mcp"].map((directory) => [
        `packages/${directory}`,
        {
          ...(JSON.parse(text(`packages/${directory}/package.json`)) as JsonRecord),
          version: "0.0.0",
          private: true,
        },
      ]),
    );
    expect(() =>
      validatePackageTopology({
        channel: "stable",
        manifests: currentManifests,
        packageMap: JSON.parse(text("config/public-packages.json")) as JsonRecord,
        rootManifest,
      }),
    ).toThrow(/0\.0\.0 sentinel|still private/u);
  });

  it("binds summary, packed evidence bytes, versions, and canonical tarball digests", () => {
    const fixture = evidenceFixture("next");
    const evidence = validateReleaseEvidence({ channel: "next", ...fixture });
    expect(evidence.packedArtifacts.size).toBe(fixture.topology.order.length);
    expect(() =>
      assertPackedArtifactsMatchEvidence(
        fixture.artifacts,
        evidence.packedArtifacts,
        fixture.topology,
      ),
    ).not.toThrow();
    const corrupted = fixture.artifacts.map((artifact, index) =>
      index === 0 ? { ...artifact, sha256: "f".repeat(64) } : artifact,
    );
    expect(() =>
      assertPackedArtifactsMatchEvidence(corrupted, evidence.packedArtifacts, fixture.topology),
    ).toThrow(/Trusted rebuild digest mismatch/u);
  });

  it("requires explicit manual and independent evidence before Stable", () => {
    const fixture = evidenceFixture("stable");
    const { stableAuthorization: _omitted, ...summary } = fixture.summary;
    expect(() => validateReleaseEvidence({ channel: "stable", ...fixture, summary })).toThrow(
      /stableAuthorization/u,
    );
    expect(() => validateReleaseEvidence({ channel: "stable", ...fixture })).not.toThrow();
  });
});
