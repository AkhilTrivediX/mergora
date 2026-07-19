import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalJson, CliError, sha256 } from "../../packages/cli/src/contracts.js";
import { CONFIG_SCHEMA, type MergoraConfig } from "../../packages/cli/src/configuration.js";
import {
  applyRegistryConfigPlan,
  inspectRegistry,
  listRegistries,
  normalizeRegistryOrigin,
  planRegistryEnrollment,
  planRegistryRemoval,
  retrieveRegistryMetadata,
  verifyRegistry,
} from "../../packages/cli/src/registry-management.js";
import { OFFICIAL_REGISTRY_ORIGIN } from "../../packages/cli/src/registry-data.js";

const temporaryRoots: string[] = [];
const PARTNER_ORIGIN = "https://registry.example.test/r/v1";
const PARTNER_ID = "partner";

function config(): MergoraConfig {
  return {
    $schema: CONFIG_SCHEMA,
    schemaVersion: 1,
    project: {
      framework: "vite-react",
      language: "typescript",
      sourceRoot: "src",
      packageJson: "package.json",
      tsconfig: "tsconfig.json",
    },
    distribution: { defaultMode: "source", packageName: "mergora-ui" },
    targets: {
      components: "src/components/mergora",
      hooks: "src/hooks/mergora",
      lib: "src/lib/mergora",
      systems: "src/components/mergora-systems",
      kits: "src/features/mergora-kits",
      styles: "src/styles/mergora",
      tokens: "src/styles/mergora/tokens",
    },
    aliases: {
      components: "@/components/mergora",
      hooks: "@/hooks/mergora",
      lib: "@/lib/mergora",
      systems: "@/components/mergora-systems",
      kits: "@/features/mergora-kits",
      styles: "@/styles/mergora",
      tokens: "@/styles/mergora/tokens",
    },
    styling: {
      engine: "tailwind-v4",
      globalCss: "src/index.css",
      tokenPreset: "workbench",
      colorMode: "system",
      density: "comfortable",
      direction: "auto",
      packageCssStrategy: "source-directive",
    },
    registries: {
      official: {
        protocol: "mergora-v1",
        origin: OFFICIAL_REGISTRY_ORIGIN,
        trust: "official",
      },
    },
    policy: {
      allowExternalRegistries: false,
      allowPrereleases: false,
      dependencyProtocols: ["registry-semver"],
      requireLicenses: true,
      retainSuccessfulTransactions: 10,
      maxRegistryItemBytes: 2_097_152,
      maxOperationBytes: 52_428_800,
    },
    formatting: {
      strategy: "project",
      fallback: "mergora",
      lineEndings: "preserve-existing",
    },
  };
}

function project(value: MergoraConfig = config()): string {
  const root = mkdtempSync(resolve(tmpdir(), "mergora-registry-management-"));
  temporaryRoots.push(root);
  writeFileSync(resolve(root, "package.json"), '{"name":"fixture","private":true}\n');
  writeFileSync(resolve(root, "mergora.json"), `${JSON.stringify(value, null, 2)}\n`);
  return root;
}

function externalConfig(
  identityDigest: `sha256:${string}` = `sha256:${"a".repeat(64)}`,
): MergoraConfig {
  const value = config();
  return {
    ...value,
    registries: {
      ...value.registries,
      partner: {
        protocol: "mergora-v1",
        origin: PARTNER_ORIGIN,
        trust: "enrolled",
        authEnvironmentVariable: "PARTNER_REGISTRY_TOKEN",
        identityDigest,
      },
    },
    policy: { ...value.policy, allowExternalRegistries: true },
  };
}

function compatibility() {
  return {
    cli: ">=1.0.0",
    node: ">=22.14.0",
    react: "^19.0.0",
    typescript: ">=5.8.0",
    tailwind: "^4.0.0",
    frameworks: { vite: ">=6.0.0" },
    packageManagers: { pnpm: ">=10.0.0" },
    browserCapabilities: ["css-variables"],
  };
}

interface NativeFixture {
  readonly catalog: Record<string, unknown>;
  readonly catalogText: string;
  readonly manifestText: string;
  readonly payloadText: string;
  readonly manifestUrl: string;
  readonly payloadUrl: string;
}

function nativeFixture(origin = PARTNER_ORIGIN, registryId = PARTNER_ID): NativeFixture {
  const payloadUrl = `${origin}/releases/1.0.0/items/button.json`;
  const passportUrl = `${origin}/passports/1.0.0/button.json`;
  const contractUrl = `${origin}/contracts/1.0.0/button.json`;
  const payloadUnsigned = {
    schemaVersion: 1,
    registryId,
    itemId: "button",
    kind: "component",
    version: "1.0.0",
    lastChangedVersion: "1.0.0",
    maturity: "stable",
    license: "MIT",
    title: "Button",
    description: "A deterministic button.",
    links: {
      docs: `${origin}/docs/button`,
      source: `${origin}/source/button`,
      changelog: `${origin}/changelog/button`,
      passport: passportUrl,
      contract: contractUrl,
    },
    compatibility: compatibility(),
    files: [],
    registryDependencies: [],
    dependencies: { runtime: { react: "^19.0.0" }, development: {} },
    structuredPatches: [],
    migrations: [],
    contract: { id: "button", version: "1.0.0" },
    passport: { id: "button", version: "1.0.0" },
    examples: [],
    importPaths: ["mergora-ui/button"],
  };
  const payload = { ...payloadUnsigned, payloadDigest: sha256(canonicalJson(payloadUnsigned)) };
  const payloadText = `${canonicalJson(payload)}\n`;
  const graph = { button: [] };
  const graphDigest = sha256(canonicalJson(graph));
  const identityDigest = sha256(canonicalJson({ id: registryId, origin, trust: "official" }));
  const catalog = {
    schemaVersion: 1,
    protocolVersion: "mergora-v1",
    registry: { id: registryId, origin, trust: "official", identityDigest },
    releases: { currentStable: "1.0.0", currentPrerelease: null, supportedHistorical: [] },
    items: [
      {
        id: "button",
        aliases: [],
        displayName: "Button",
        description: "A deterministic button.",
        kind: "component",
        category: "actions",
        tags: ["action"],
        keywords: ["button"],
        maturity: "stable",
        latestStableVersion: "1.0.0",
        lastChangedVersion: "1.0.0",
        compatibility: compatibility(),
        license: "MIT",
        provenance: `${origin}/source/button`,
        links: {
          payload: payloadUrl,
          passport: passportUrl,
          contract: contractUrl,
          docs: `${origin}/docs/button`,
          source: `${origin}/source/button`,
        },
        registryDependencies: [],
        quality: { tier: "complete", manualAssistiveTechnologyEvidence: true },
      },
    ],
    dependencyGraphDigest: graphDigest,
  };
  const manifestUrl = `${origin}/releases/1.0.0/manifest.json`;
  const evidence = (id: string, artifact: string, digest: `sha256:${string}`) => ({
    id,
    artifact,
    digest,
  });
  const payloadDigest = sha256(payloadText);
  const manifestUnsigned = {
    schemaVersion: 1,
    registryId,
    uiVersion: "1.0.0",
    releaseCommit: "a".repeat(40),
    items: {
      button: {
        version: "1.0.0",
        payload: evidence("button", payloadUrl, payloadDigest),
        passport: evidence("button", passportUrl, `sha256:${"b".repeat(64)}`),
        contract: evidence("button", contractUrl, `sha256:${"c".repeat(64)}`),
        dependencies: [],
      },
    },
    dependencyGraphDigest: graphDigest,
    artifacts: [
      {
        name: "button-payload",
        url: payloadUrl,
        digest: payloadDigest,
        mediaType: "application/json",
        bytes: Buffer.byteLength(payloadText),
      },
    ],
    qualitySummary: evidence(
      "quality-summary",
      `${origin}/releases/1.0.0/quality-summary.json`,
      `sha256:${"d".repeat(64)}`,
    ),
  };
  const manifest = {
    ...manifestUnsigned,
    manifestDigest: sha256(canonicalJson(manifestUnsigned)),
  };
  return {
    catalog,
    catalogText: `${canonicalJson(catalog)}\n`,
    manifestText: `${canonicalJson(manifest)}\n`,
    payloadText,
    manifestUrl,
    payloadUrl,
  };
}

function jsonResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers },
  });
}

function nativeFetch(fixture: NativeFixture) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === `${PARTNER_ORIGIN}/catalog.json`) return jsonResponse(fixture.catalogText);
    if (url === fixture.manifestUrl) return jsonResponse(fixture.manifestText);
    if (url === fixture.payloadUrl) return jsonResponse(fixture.payloadText);
    return jsonResponse("{}", { status: 404 });
  });
}

function errorCode(error: unknown): string | undefined {
  return error instanceof CliError ? error.code : undefined;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("registry origin and network boundary", () => {
  it("rejects credentials, non-HTTPS origins, and unacknowledged loopback HTTP", () => {
    expect(() => normalizeRegistryOrigin("https://user:secret@example.test/r/v1")).toThrow(
      /credential policy/u,
    );
    expect(() => normalizeRegistryOrigin("http://example.test/r/v1")).toThrow(/transport/u);
    expect(() => normalizeRegistryOrigin("http://192.168.1.10:3000/r/v1")).toThrow(/transport/u);
    expect(() => normalizeRegistryOrigin("https://example.test/r/%2e%2e/private")).toThrow(
      /invalid/u,
    );
    expect(() => normalizeRegistryOrigin("http://localhost:3000/r/v1")).toThrow(
      /allow-insecure-localhost/u,
    );
    expect(
      normalizeRegistryOrigin("http://127.0.0.1:3000/r/v1/", {
        allowInsecureLocalhost: true,
      }),
    ).toBe("http://127.0.0.1:3000/r/v1");
  });

  it("never forwards an auth value across a metadata redirect", async () => {
    const fixture = nativeFixture();
    const headersByUrl = new Map<string, string | null>();
    const initial = "https://alias.example.test/r/v1/catalog.json";
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      headersByUrl.set(url, headers.get("authorization"));
      if (url === initial) {
        return new Response(null, {
          status: 302,
          headers: { location: `${PARTNER_ORIGIN}/catalog.json` },
        });
      }
      return jsonResponse(fixture.catalogText);
    });

    const metadata = await retrieveRegistryMetadata({
      origin: "https://alias.example.test/r/v1",
      protocol: "mergora-v1",
      authEnvironmentVariable: "PARTNER_TOKEN",
      environment: { PARTNER_TOKEN: "super-secret-token" },
      fetchImplementation,
    });

    expect(metadata.resolvedOrigin).toBe(PARTNER_ORIGIN);
    expect(headersByUrl.get(initial)).toBe("Bearer super-secret-token");
    expect(headersByUrl.get(`${PARTNER_ORIGIN}/catalog.json`)).toBeNull();
    expect(JSON.stringify(metadata)).not.toContain("super-secret-token");
  });

  it("bounds redirects and response bytes and rejects invalid JSON", async () => {
    const redirects = vi.fn<typeof fetch>(
      async (input) => new Response(null, { status: 302, headers: { location: String(input) } }),
    );
    await expect(
      retrieveRegistryMetadata({
        origin: PARTNER_ORIGIN,
        protocol: "mergora-v1",
        fetchImplementation: redirects,
        maxRedirects: 1,
      }),
    ).rejects.toMatchObject({ code: "REGISTRY_REDIRECT_LIMIT" });

    await expect(
      retrieveRegistryMetadata({
        origin: PARTNER_ORIGIN,
        protocol: "mergora-v1",
        maxBytes: 16,
        fetchImplementation: vi.fn<typeof fetch>(async () =>
          jsonResponse('{"oversized":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}'),
        ),
      }),
    ).rejects.toMatchObject({ code: "REGISTRY_RESPONSE_TOO_LARGE" });

    await expect(
      retrieveRegistryMetadata({
        origin: PARTNER_ORIGIN,
        protocol: "mergora-v1",
        fetchImplementation: vi.fn<typeof fetch>(async () => jsonResponse("{not-json")),
      }),
    ).rejects.toMatchObject({ code: "REGISTRY_INVALID_JSON" });
  });
});

describe("registry read commands", () => {
  it("lists only auth environment names and keeps list/inspect offline byte-read-only", async () => {
    const root = project(externalConfig());
    const before = readFileSync(resolve(root, "mergora.json"));
    const fetchImplementation = vi.fn<typeof fetch>();

    const entries = listRegistries(root);
    const inspection = await inspectRegistry({
      projectRoot: root,
      id: "partner",
      offline: true,
      environment: { PARTNER_REGISTRY_TOKEN: "never-print-this" },
      fetchImplementation,
    });

    expect(entries.map(({ id }) => id)).toEqual(["official", "partner"]);
    expect(entries[1]).toMatchObject({
      authEnvironmentVariable: "PARTNER_REGISTRY_TOKEN",
      license: { status: "not-inspected", licenses: [] },
      risk: { status: "not-inspected", maximumClass: null },
    });
    expect(inspection.network).toBe("forbidden");
    expect(inspection.missingEvidence).toEqual([
      `catalog:${PARTNER_ORIGIN}`,
      "registry-identity:partner",
      "registry-policy:partner",
    ]);
    expect(JSON.stringify({ entries, inspection })).not.toContain("never-print-this");
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(readFileSync(resolve(root, "mergora.json"))).toEqual(before);
    expect(existsSync(resolve(root, ".mergora"))).toBe(false);
  });
});

describe("registry enrollment and removal plans", () => {
  it("builds deterministic identity-bound plans and transactionally stores only an auth env name", async () => {
    const root = project();
    const fixture = nativeFixture();
    const fetchImplementation = nativeFetch(fixture);
    const options = {
      projectRoot: root,
      id: PARTNER_ID,
      origin: PARTNER_ORIGIN,
      protocol: "mergora-v1" as const,
      authEnvironmentVariable: "PARTNER_REGISTRY_TOKEN",
      environment: { PARTNER_REGISTRY_TOKEN: "never-persist-this" },
      fetchImplementation,
    };

    const first = await planRegistryEnrollment(options);
    const second = await planRegistryEnrollment(options);

    expect(first.plan).toEqual(second.plan);
    expect(first.plan.command).toBe("registry-enroll");
    expect(first.plan.consentRequirements[0]?.flag).toBe(
      `--accept-registry-identity ${first.metadata?.identityDigest}`,
    );
    expect(() =>
      applyRegistryConfigPlan(first, root, {
        expectedPlanDigest: first.plan.planDigest,
      }),
    ).toThrow(/--yes is insufficient/u);
    expect(() =>
      applyRegistryConfigPlan(first, root, {
        expectedPlanDigest: first.plan.planDigest,
        acceptRegistryIdentity: `sha256:${"f".repeat(64)}`,
      }),
    ).toThrow(/accept-registry-identity/u);

    const result = applyRegistryConfigPlan(first, root, {
      expectedPlanDigest: first.plan.planDigest,
      acceptRegistryIdentity: first.metadata?.identityDigest,
    });
    const written = readFileSync(resolve(root, "mergora.json"), "utf8");

    expect(result.state).toBe("committed");
    expect(first.proposedConfig.registries.partner).toMatchObject({
      origin: PARTNER_ORIGIN,
      trust: "enrolled",
      authEnvironmentVariable: "PARTNER_REGISTRY_TOKEN",
      identityDigest: first.metadata?.identityDigest,
    });
    expect(written).toContain("PARTNER_REGISTRY_TOKEN");
    expect(written).not.toContain("never-persist-this");
  });

  it("lets the transaction engine refuse a stale config precondition", async () => {
    const root = project();
    const fixture = nativeFixture();
    const planned = await planRegistryEnrollment({
      projectRoot: root,
      id: PARTNER_ID,
      origin: PARTNER_ORIGIN,
      protocol: "mergora-v1",
      fetchImplementation: nativeFetch(fixture),
    });
    const changed = {
      ...config(),
      formatting: { ...config().formatting, strategy: "none" as const },
    };
    writeFileSync(resolve(root, "mergora.json"), `${JSON.stringify(changed, null, 2)}\n`);

    expect(() =>
      applyRegistryConfigPlan(planned, root, {
        expectedPlanDigest: planned.plan.planDigest,
        acceptRegistryIdentity: planned.metadata?.identityDigest,
      }),
    ).toThrowError(expect.objectContaining({ code: "PLAN_CONFIG_STALE" }));
  });

  it("refuses official and installed registries, then removes an unused registry transactionally", () => {
    const officialRoot = project();
    expect(() => planRegistryRemoval({ projectRoot: officialRoot, id: "official" })).toThrow(
      /cannot be removed/u,
    );

    const installedRoot = project(externalConfig());
    mkdirSync(resolve(installedRoot, ".mergora"));
    writeFileSync(
      resolve(installedRoot, ".mergora/manifest.json"),
      `${JSON.stringify({
        $schema: `${OFFICIAL_REGISTRY_ORIGIN}/schemas/manifest-v1.schema.json`,
        schemaVersion: 1,
        projectId: `sha256:${"1".repeat(64)}`,
        toolchain: {
          cli: "0.0.0",
          schema: "1.0.0",
          transformer: "0.0.0",
          formatter: "mergora@1",
        },
        items: {
          "partner:button": {
            registry: "partner",
            itemId: "button",
            kind: "component",
            requested: "=1.0.0",
            resolved: "1.0.0",
            payload: {
              url: `${PARTNER_ORIGIN}/releases/1.0.0/items/button.json`,
              digest: `sha256:${"2".repeat(64)}`,
            },
            mode: "source",
            direct: true,
            transformContextDigest: sha256(canonicalJson({})),
            transformContext: {},
            files: [],
            registryDependencies: [],
            dependencies: { runtime: {}, development: {} },
            structuredPatches: [],
            contractVersion: "1.0.0",
            lastMigration: null,
          },
        },
        sharedTargets: {},
        dependencyOwners: {},
      })}\n`,
    );
    expect(() => planRegistryRemoval({ projectRoot: installedRoot, id: "partner" })).toThrowError(
      expect.objectContaining({ code: "REGISTRY_INSTALLED_DEPENDENCY" }),
    );

    const unusedRoot = project(externalConfig());
    const removal = planRegistryRemoval({ projectRoot: unusedRoot, id: "partner" });
    expect(removal.plan.command).toBe("registry-remove");
    expect(removal.proposedConfig.policy.allowExternalRegistries).toBe(false);
    const result = applyRegistryConfigPlan(removal, unusedRoot, {
      expectedPlanDigest: removal.plan.planDigest,
    });
    expect(result.state).toBe("committed");
    expect(listRegistries(unusedRoot).map(({ id }) => id)).toEqual(["official"]);
  });
});

describe("registry verification", () => {
  it("reports exact offline evidence without any network access", async () => {
    const root = project(externalConfig());
    const fetchImplementation = vi.fn<typeof fetch>();
    const result = await verifyRegistry({
      projectRoot: root,
      id: "partner",
      offline: true,
      fetchImplementation,
    });

    expect(result).toMatchObject({ ok: false, status: "incomplete", network: "forbidden" });
    expect(result.missingEvidence).toEqual([
      `catalog:${PARTNER_ORIGIN}`,
      "registry-identity:partner",
      "registry-policy:partner",
    ]);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("fails closed on an accepted identity mismatch before immutable sampling", async () => {
    const root = project(externalConfig());
    const fixture = nativeFixture();
    const fetchImplementation = nativeFetch(fixture);
    const result = await verifyRegistry({
      projectRoot: root,
      id: "partner",
      fetchImplementation,
    });

    expect(result).toMatchObject({ ok: false, status: "identity-mismatch" });
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: "identity-binding", state: "fail" }),
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("revalidates native catalog, release manifest, and immutable sample bytes", async () => {
    const fixture = nativeFixture();
    const fetchImplementation = nativeFetch(fixture);
    const metadata = await retrieveRegistryMetadata({
      origin: PARTNER_ORIGIN,
      protocol: "mergora-v1",
      fetchImplementation,
    });
    const root = project(externalConfig(metadata.identityDigest));

    const result = await verifyRegistry({
      projectRoot: root,
      id: "partner",
      fetchImplementation,
    });

    expect(result).toMatchObject({
      ok: true,
      status: "verified",
      identityStatus: "match",
      sample: { itemId: "button", url: fixture.payloadUrl, digest: sha256(fixture.payloadText) },
    });
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: "immutable-sample", state: "pass" }),
    );
  });

  it("never upgrades shadcn compatibility metadata into missing native evidence", async () => {
    const shadcn = {
      $schema: "https://ui.shadcn.com/schema/registry.json",
      name: "partner",
      homepage: "https://registry.example.test",
      items: [
        {
          $schema: "https://ui.shadcn.com/schema/registry-item.json",
          name: "button",
          type: "registry:ui",
          title: "Button",
          description: "A button.",
          dependencies: ["react@^19.0.0"],
          devDependencies: [],
          registryDependencies: [],
          files: [],
          docs: "Compatibility metadata only.",
        },
      ],
    };
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/catalog.json")) return jsonResponse("{}", { status: 404 });
      return jsonResponse(`${canonicalJson(shadcn)}\n`);
    });
    const root = project();
    const enrollment = await planRegistryEnrollment({
      projectRoot: root,
      id: "partner",
      origin: PARTNER_ORIGIN,
      fetchImplementation,
    });
    applyRegistryConfigPlan(enrollment, root, {
      expectedPlanDigest: enrollment.plan.planDigest,
      acceptRegistryIdentity: enrollment.metadata?.identityDigest,
    });

    const result = await verifyRegistry({
      projectRoot: root,
      id: "partner",
      fetchImplementation,
    });

    expect(result).toMatchObject({ ok: false, status: "incomplete" });
    expect(result.missingEvidence).toEqual([
      "immutable-release-manifest:partner",
      "immutable-payload-digest:partner",
      "license-policy:partner",
      "risk-class:partner",
      "quality-evidence:partner",
    ]);
  });

  it("rejects executable catalog extensions and keeps credential values out of errors", async () => {
    const fixture = nativeFixture();
    const hostile = { ...fixture.catalog, scripts: { postinstall: "steal-token" } };
    let caught: unknown;
    try {
      await retrieveRegistryMetadata({
        origin: PARTNER_ORIGIN,
        protocol: "mergora-v1",
        authEnvironmentVariable: "PARTNER_TOKEN",
        environment: { PARTNER_TOKEN: "do-not-leak-this-token" },
        fetchImplementation: vi.fn<typeof fetch>(async () =>
          jsonResponse(`${canonicalJson(hostile)}\n`),
        ),
      });
    } catch (error) {
      caught = error;
    }

    expect(errorCode(caught)).toBe("REGISTRY_METADATA_SCHEMA_INVALID");
    expect(String(caught)).not.toContain("do-not-leak-this-token");
  });
});
