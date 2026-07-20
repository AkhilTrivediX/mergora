import { gzipSync } from "node:zlib";

import {
  BUILT_IN_MODE_IMPORT_ADAPTER,
  type ApplyDistributionModeTransactionOptions,
  type DistributionModeMigrationObservation,
  type DistributionModeMigrationOptions,
} from "../../packages/cli/src/distribution-mode-migration.ts";
import { resolveNativeRegistryRelease } from "../../packages/cli/src/acquisition-resolver.ts";
import type { AcquisitionRegistryIdentity } from "../../packages/cli/src/acquisition.ts";
import { canonicalJson, sha256 } from "../../packages/cli/src/contracts.ts";
import {
  manifestBytes,
  type ManifestItem,
  type ProvenanceManifest,
} from "../../packages/cli/src/source-operations.ts";
import {
  serializeDistributionProvenance,
  type DistributionProvenanceState,
} from "../../packages/cli/src/distribution-provenance.ts";
import { OFFICIAL_REGISTRY_ORIGIN } from "../../packages/cli/src/registry-data.ts";
import { seedPackedCompleteNativeReleaseCache } from "../cli-acquisition/packed-release-fixture.ts";

const DEFAULT_VERSION = "1.2.3";
const PACKAGE = "mergora-ui";
const DEFAULT_SOURCE = "export const Button = () => null;\n";

function tarString(header: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength > length) throw new Error("test tar field is too long");
  bytes.copy(header, offset);
}

function tarOctal(header: Buffer, offset: number, length: number, value: number): void {
  tarString(header, offset, length, `${value.toString(8).padStart(length - 1, "0")}\0`);
}

function tarEntry(path: string, content: Buffer): Buffer {
  const header = Buffer.alloc(512);
  tarString(header, 0, 100, path);
  tarOctal(header, 100, 8, 0o644);
  tarOctal(header, 108, 8, 0);
  tarOctal(header, 116, 8, 0);
  tarOctal(header, 124, 12, content.byteLength);
  tarOctal(header, 136, 12, 0);
  header.fill(32, 148, 156);
  header[156] = "0".charCodeAt(0);
  tarString(header, 257, 6, "ustar\0");
  tarString(header, 263, 2, "00");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  tarString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return Buffer.concat([
    header,
    content,
    Buffer.alloc(Math.ceil(content.byteLength / 512) * 512 - content.byteLength),
  ]);
}

export function authenticNpmTarball(version = DEFAULT_VERSION): Buffer {
  const packageJson = Buffer.from(
    `${JSON.stringify({ name: PACKAGE, version, license: "MIT" })}\n`,
  );
  return gzipSync(
    Buffer.concat([
      tarEntry("package/package.json", packageJson),
      tarEntry("package/index.js", Buffer.from("export const stable = true;\n")),
      Buffer.alloc(1024),
    ]),
    { level: 9 },
  );
}

function transformContext(config: Record<string, unknown>): ManifestItem["transformContext"] {
  const styling = config.styling as Record<string, unknown>;
  return {
    targets: config.targets as Record<string, string>,
    aliases: config.aliases as Record<string, string>,
    styling: {
      engine: "tailwind-v4",
      tokenPreset: styling.tokenPreset as string,
      density: styling.density as "comfortable",
      direction: styling.direction as "auto",
    },
  };
}

function ownershipViews(state: DistributionProvenanceState) {
  return {
    dependencyOwners: Object.fromEntries(
      Object.entries(state.dependencyOwnership).map(([key, value]) => [key, [...value.owners]]),
    ),
    sharedTargets:
      Object.keys(state.patchOwnership).length === 0
        ? {}
        : {
            "package.json": Object.keys(state.patchOwnership).sort(),
          },
  };
}

export function manifestForAuthenticState(
  stateValue: unknown,
  config: Record<string, unknown>,
): ProvenanceManifest {
  const state = serializeDistributionProvenance(stateValue).state;
  const context = transformContext(config);
  const items = Object.fromEntries(
    Object.entries(state.items).map(([id, item]) => [
      id,
      {
        ...item,
        transformContext: context,
        transformContextDigest: sha256(canonicalJson(context)),
        structuredPatches: item.structuredPatches.map((patch) => ({ ...patch })),
      },
    ]),
  ) as Record<string, ManifestItem>;
  return {
    $schema: "https://akhiltrivedix.github.io/mergora/r/v1/schemas/manifest-v1.schema.json",
    schemaVersion: 1,
    projectId: state.projectId,
    configDigest: state.configDigest,
    defaultMode: state.defaultMode,
    packageName: state.packageName,
    toolchain: { cli: "0.0.0", schema: "1.0.0", transformer: "0.0.0", formatter: "mergora@1" },
    releases: state.releases,
    items,
    ...ownershipViews(state),
    dependencyOwnership: state.dependencyOwnership,
    patchOwnership: state.patchOwnership,
  };
}

function packagePatch(version: string) {
  return {
    id: "dependency-mergora-ui",
    adapter: "package-dependency" as const,
    target: "package.json",
    semanticKey: "dependencies.mergora-ui",
    ownedValueDigest: sha256(version),
  };
}

export interface AuthenticModeFixture {
  readonly config: Record<string, unknown>;
  readonly current: Record<string, unknown>;
  readonly proposed: Record<string, unknown>;
  readonly currentManifest: Buffer;
  readonly proposedManifest: Buffer;
  readonly migration: DistributionModeMigrationOptions;
  readonly materialization: Pick<
    ApplyDistributionModeTransactionOptions,
    "targets" | "bases" | "packageIntegrityEvidence" | "releaseSources"
  >;
  readonly pageBefore: Buffer;
  readonly pageAfter: Buffer;
  readonly packageBefore: Buffer;
  readonly packageAfter: Buffer;
  readonly sourceBytes: Buffer;
  readonly sourceTarget: string;
  readonly tarball: Buffer;
}

export async function createAuthenticModeFixture(
  root: string,
  config: Record<string, unknown>,
  direction: "source-to-package" | "package-to-source",
  version = DEFAULT_VERSION,
  source = DEFAULT_SOURCE,
): Promise<AuthenticModeFixture> {
  const tarball = authenticNpmTarball(version);
  const seeded = seedPackedCompleteNativeReleaseCache(root, version, source, {
    package: PACKAGE,
    bytes: tarball,
  });
  const registry: AcquisitionRegistryIdentity = {
    id: "official",
    origin: OFFICIAL_REGISTRY_ORIGIN,
    trust: "official",
    identityDigest: sha256(
      canonicalJson({ id: "official", origin: OFFICIAL_REGISTRY_ORIGIN, trust: "official" }),
    ),
  };
  const acquired = await resolveNativeRegistryRelease({
    projectRoot: root,
    registry,
    release: version,
    catalog: { path: "catalog.json", ...seeded.reference.catalog },
    manifest: { path: `releases/${version}/manifest.json`, ...seeded.reference.manifest },
    itemIds: ["button"],
    contractSelection: "stable",
    offline: true,
  });
  const acquiredItem = acquired.items[0]!;
  const acquiredFile = acquiredItem.files[0]!;
  const sourceBytes = Buffer.from(acquiredFile.content, "utf8");
  const sourceTarget = "src/components/mergora/button/button.tsx";
  const configDigest = sha256(canonicalJson(config));
  const releaseRef = `official@${version}`;
  const packageInventory = acquired.npmPackageInventory!.entries[0]!;
  if (packageInventory.disposition !== "include") throw new Error("fixture package was omitted");
  const release = {
    registryId: "official",
    origin: OFFICIAL_REGISTRY_ORIGIN,
    trust: "official",
    identityDigest: registry.identityDigest,
    release: version,
    manifestUrl: `${OFFICIAL_REGISTRY_ORIGIN}/releases/${version}/manifest.json`,
    manifestDigest: acquired.manifestDigest,
    packages: {
      [PACKAGE]: {
        name: PACKAGE,
        version,
        tarballDigest: packageInventory.digest,
      },
    },
  };
  const common = {
    registry: "official",
    itemId: "button",
    kind: "component",
    requested: `=${version}`,
    resolved: version,
    releaseRef,
    payload: { url: acquiredItem.payloadUrl, digest: acquiredItem.payloadDigest },
    direct: true,
    registryDependencies: [],
    contractVersion: acquiredItem.contract.version,
  };
  const sourceItem = {
    ...common,
    mode: "source",
    files: [
      {
        logicalPath: acquiredFile.logicalPath,
        target: sourceTarget,
        role: "component",
        base: acquiredFile.digest,
        installed: acquiredFile.digest,
        mediaType: acquiredFile.mediaType,
        executable: false,
      },
    ],
    packageClaims: [],
    importSubpaths: [],
    dependencies: { runtime: {}, development: {} },
    structuredPatches: [],
    lastMigration: direction === "package-to-source" ? "mode-package-to-source-v1" : null,
  };
  const packageItem = {
    ...common,
    mode: "package",
    files: [],
    packageClaims: [PACKAGE],
    importSubpaths: ["mergora-ui/button"],
    dependencies: { runtime: { [PACKAGE]: version }, development: {} },
    structuredPatches: [packagePatch(version)],
    lastMigration: direction === "source-to-package" ? "mode-source-to-package-v1" : null,
  };
  const packageOwnership = {
    [`runtime:${PACKAGE}`]: {
      scope: "runtime",
      package: PACKAGE,
      range: version,
      owners: ["official:button"],
      retention: "remove-if-unowned",
    },
  };
  const patchOwnership = {
    "dependency-mergora-ui": {
      ...packagePatch(version),
      owners: ["official:button"],
      retention: "remove-if-unowned",
    },
  };
  const stateBase = {
    schemaVersion: 1,
    projectId: `sha256:${"1".repeat(64)}`,
    configDigest,
    defaultMode: "hybrid",
    packageName: PACKAGE,
    releases: { [releaseRef]: release },
  };
  const sourceState = {
    ...stateBase,
    items: { "official:button": sourceItem },
    dependencyOwnership: {},
    patchOwnership: {},
  };
  const packageState = {
    ...stateBase,
    items: { "official:button": packageItem },
    dependencyOwnership: packageOwnership,
    patchOwnership,
  };
  const current = structuredClone(
    direction === "source-to-package" ? sourceState : packageState,
  ) as Record<string, unknown>;
  const proposed = structuredClone(
    direction === "source-to-package" ? packageState : sourceState,
  ) as Record<string, unknown>;
  const currentManifest = manifestBytes(manifestForAuthenticState(current, config));
  const proposedManifest = manifestBytes(manifestForAuthenticState(proposed, config));
  const pageBefore = Buffer.from(
    direction === "source-to-package"
      ? 'import { Button } from "@/components/mergora/button/button";\n'
      : 'import { Button } from "mergora-ui/button";\n',
  );
  const pageAfter = Buffer.from(
    direction === "source-to-package"
      ? 'import { Button } from "mergora-ui/button";\n'
      : 'import { Button } from "@/components/mergora/button/button";\n',
  );
  const packageBefore = Buffer.from(
    `${JSON.stringify(
      direction === "source-to-package"
        ? { name: "consumer", dependencies: {} }
        : { name: "consumer", dependencies: { [PACKAGE]: version } },
      null,
      2,
    )}\n`,
  );
  const packageAfter = Buffer.from(
    `${JSON.stringify(
      direction === "source-to-package"
        ? { name: "consumer", dependencies: { [PACKAGE]: version } }
        : { name: "consumer", dependencies: {} },
      null,
      2,
    )}\n`,
  );
  const observation: DistributionModeMigrationObservation = {
    stateDigest: serializeDistributionProvenance(current).canonicalDigest,
    unresolvedTransactions: [],
    sourceFiles: {
      [sourceTarget]: direction === "source-to-package" ? acquiredFile.digest : null,
    },
    dependencies: { [PACKAGE]: direction === "source-to-package" ? null : version },
    patches: {
      "dependency-mergora-ui": direction === "source-to-package" ? null : sha256(version),
    },
    projectFiles: { "src/app/page.tsx": sha256(pageBefore) },
    importRewrites: [
      {
        adapter: BUILT_IN_MODE_IMPORT_ADAPTER,
        target: "src/app/page.tsx",
        before: sha256(pageBefore),
        after: sha256(pageAfter),
      },
    ],
  };
  const migration: DistributionModeMigrationOptions = {
    currentState: current,
    proposedState: proposed,
    configuration: config,
    from: direction === "source-to-package" ? "source" : "package",
    to: direction === "source-to-package" ? "package" : "source",
    itemIds: ["official:button"],
    observation,
    currentManifestBytes: currentManifest,
    acquiredReleases: [acquired],
  };
  return {
    config,
    current,
    proposed,
    currentManifest,
    proposedManifest,
    migration,
    materialization: {
      targets: {
        "package.json": { before: packageBefore, after: packageAfter },
        "src/app/page.tsx": { before: pageBefore, after: pageAfter },
        [sourceTarget]: {
          before: direction === "source-to-package" ? sourceBytes : null,
          after: direction === "source-to-package" ? null : sourceBytes,
        },
      },
      bases:
        direction === "source-to-package"
          ? {}
          : { [acquiredFile.digest]: { before: null, content: sourceBytes } },
      packageIntegrityEvidence: [
        {
          releaseRef,
          package: PACKAGE,
          version,
          url: packageInventory.url,
          bytes: Buffer.from(tarball),
        },
      ],
      releaseSources: { [releaseRef]: "verified-cache" },
    },
    pageBefore,
    pageAfter,
    packageBefore,
    packageAfter,
    sourceBytes,
    sourceTarget,
    tarball,
  };
}
