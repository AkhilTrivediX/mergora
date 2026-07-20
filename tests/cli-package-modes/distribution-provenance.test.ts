import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { canonicalJson, sha256, type CliError } from "../../packages/cli/src/contracts.ts";
import {
  assertDistributionConfigurationBinding,
  assertDistributionEnrollmentAllowed,
  resolveRequestedDistributionMode,
  serializeDistributionProvenance,
  validateDistributionProvenance,
} from "../../packages/cli/src/distribution-provenance.ts";

const fixtureUrl = new URL("./fixtures/valid-hybrid-state.json", import.meta.url);
const configurationUrl = new URL("./fixtures/valid-config.json", import.meta.url);

function fixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as Record<string, unknown>;
}

function configuration(): Record<string, unknown> {
  return JSON.parse(readFileSync(configurationUrl, "utf8")) as Record<string, unknown>;
}

function objectAt(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  return parent[key] as Record<string, unknown>;
}

function reverseRecord(value: unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse());
}

describe("package and hybrid distribution provenance", () => {
  it("normalizes a deterministic portable snapshot with exact immutable release pins", () => {
    const first = serializeDistributionProvenance(fixture());
    const reordered = fixture();
    reordered.releases = reverseRecord(reordered.releases);
    reordered.items = reverseRecord(reordered.items);
    reordered.dependencyOwnership = reverseRecord(reordered.dependencyOwnership);
    reordered.patchOwnership = reverseRecord(reordered.patchOwnership);
    const dialog = objectAt(objectAt(reordered, "items"), "official:dialog");
    dialog.packageClaims = [...(dialog.packageClaims as string[])].reverse();
    dialog.structuredPatches = [...(dialog.structuredPatches as unknown[])].reverse();
    const dialogDependencies = objectAt(dialog, "dependencies");
    dialogDependencies.runtime = reverseRecord(dialogDependencies.runtime);

    const second = serializeDistributionProvenance(reordered);

    expect(second.canonicalDigest).toBe(first.canonicalDigest);
    expect(Buffer.from(second.persistedBytes)).toEqual(Buffer.from(first.persistedBytes));
    expect(first.state.releases["official@1.2.3"]).toMatchObject({
      release: "1.2.3",
      manifestDigest: `sha256:${"4".repeat(64)}`,
      identityDigest: "sha256:b9b3c786aa83813a49c3d51eac8ce7a92b9822d658e0bdbe3c87b232c4604920",
    });
    expect(first.state.items["official:dialog"]).toMatchObject({
      mode: "package",
      files: [],
      importSubpaths: ["mergora-ui/dialog"],
    });
    const persisted = Buffer.from(first.persistedBytes).toString("utf8");
    expect(persisted).not.toMatch(/timestamp|hostname|username|authEnvironment|credential/iu);
    expect(persisted.endsWith("\n")).toBe(true);
  });

  it("resolves hybrid as source-by-default while requiring explicit migration for an existing item", () => {
    const state = fixture();
    expect(resolveRequestedDistributionMode("hybrid")).toBe("source");
    expect(resolveRequestedDistributionMode("hybrid", "package")).toBe("package");
    expect(resolveRequestedDistributionMode("package")).toBe("package");
    expect(() =>
      assertDistributionEnrollmentAllowed(state, "official:dialog", "package"),
    ).not.toThrow();
    expect(() =>
      assertDistributionEnrollmentAllowed(state, "official:dialog", "source"),
    ).toThrowError(
      expect.objectContaining<Partial<CliError>>({
        code: "DISTRIBUTION_MIXED_OWNERSHIP_CONFLICT",
        exitCode: 6,
      }),
    );
  });

  it("accepts a digest-pinned enrolled origin while retaining no credential material", () => {
    const enrolled = JSON.parse(
      JSON.stringify(fixture())
        .replaceAll("official", "partner")
        .replaceAll(
          "https://akhiltrivedix.github.io/mergora/r/v1",
          "https://registry.example.test/r/v1",
        ),
    ) as Record<string, unknown>;
    const release = objectAt(objectAt(enrolled, "releases"), "partner@1.2.3");
    release.trust = "enrolled";
    const enrolledConfiguration = configuration();
    enrolledConfiguration.registries = {
      ...objectAt(enrolledConfiguration, "registries"),
      partner: {
        protocol: "mergora-v1",
        origin: "https://registry.example.test/r/v1",
        trust: "enrolled",
        identityDigest: release.identityDigest,
      },
    };
    objectAt(enrolledConfiguration, "policy").allowExternalRegistries = true;
    enrolled.configDigest = sha256(canonicalJson(enrolledConfiguration));

    const validated = serializeDistributionProvenance(enrolled);

    expect(validated.state.releases["partner@1.2.3"]?.trust).toBe("enrolled");
    expect(Buffer.from(validated.persistedBytes).toString("utf8")).not.toContain("TOKEN");
    expect(() =>
      assertDistributionConfigurationBinding(enrolled, enrolledConfiguration),
    ).not.toThrow();

    objectAt(objectAt(enrolledConfiguration, "registries"), "partner").identityDigest =
      `sha256:${"f".repeat(64)}`;
    enrolled.configDigest = sha256(canonicalJson(enrolledConfiguration));
    expect(() =>
      assertDistributionConfigurationBinding(enrolled, enrolledConfiguration),
    ).toThrowError(
      expect.objectContaining<Partial<CliError>>({
        code: "DISTRIBUTION_CONFIG_REGISTRY_MISMATCH",
      }),
    );

    release.origin = "https://user:secret@registry.example.test/r/v1";
    expect(() => validateDistributionProvenance(enrolled)).toThrowError(
      expect.objectContaining<Partial<CliError>>({
        code: "DISTRIBUTION_REGISTRY_SECURITY_INVALID",
        exitCode: 5,
      }),
    );
  });

  it("rejects mutable, release-drifted, or source-owning package provenance", () => {
    const spoofedOfficial = fixture();
    const spoofedRelease = objectAt(objectAt(spoofedOfficial, "releases"), "official@1.2.3");
    spoofedRelease.origin = "https://registry.example.test/r/v1";
    spoofedRelease.manifestUrl = "https://registry.example.test/r/v1/releases/1.2.3/manifest.json";
    expect(() => validateDistributionProvenance(spoofedOfficial)).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "DISTRIBUTION_REGISTRY_INVALID" }),
    );

    const forgedOfficialDigest = fixture();
    objectAt(objectAt(forgedOfficialDigest, "releases"), "official@1.2.3").identityDigest =
      `sha256:${"3".repeat(64)}`;
    expect(() => validateDistributionProvenance(forgedOfficialDigest)).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "DISTRIBUTION_REGISTRY_INVALID" }),
    );

    const mutable = fixture();
    objectAt(objectAt(mutable, "releases"), "official@1.2.3").release = "latest";
    expect(() => validateDistributionProvenance(mutable)).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "DISTRIBUTION_RELEASE_INVALID" }),
    );

    const drifted = fixture();
    const release = objectAt(objectAt(drifted, "releases"), "official@1.2.3");
    objectAt(objectAt(release, "packages"), "mergora-ui").version = "1.2.4";
    expect(() => validateDistributionProvenance(drifted)).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "DISTRIBUTION_RELEASE_GROUP_MISMATCH" }),
    );

    const packageFiles = fixture();
    const items = objectAt(packageFiles, "items");
    objectAt(items, "official:dialog").files = structuredClone(
      objectAt(items, "official:button").files,
    );
    expect(() => validateDistributionProvenance(packageFiles)).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "DISTRIBUTION_OWNERSHIP_CONFLICT" }),
    );
  });

  it("fails closed on mixed dependency graphs, unsafe imports, and false owner claims", () => {
    const mixed = fixture();
    objectAt(objectAt(mixed, "items"), "official:dialog").registryDependencies = [
      "official:button",
    ];
    expect(() => validateDistributionProvenance(mixed)).toThrowError(
      expect.objectContaining<Partial<CliError>>({
        code: "DISTRIBUTION_MIXED_OWNERSHIP_CONFLICT",
      }),
    );

    const unsafeImport = fixture();
    objectAt(objectAt(unsafeImport, "items"), "official:dialog").importSubpaths = [
      "other-ui/dialog",
    ];
    expect(() => validateDistributionProvenance(unsafeImport)).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "DISTRIBUTION_IMPORT_INVALID" }),
    );

    const falseOwner = fixture();
    objectAt(objectAt(falseOwner, "dependencyOwnership"), "runtime:mergora-ui").owners = [
      "official:button",
    ];
    expect(() => validateDistributionProvenance(falseOwner)).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "DISTRIBUTION_OWNERSHIP_INVALID" }),
    );
  });

  it("accepts one effective dependency range contained by every compatible owner requirement", () => {
    const compatible = fixture();
    const items = objectAt(compatible, "items");
    const button = objectAt(items, "official:button");
    const dialog = objectAt(items, "official:dialog");
    objectAt(objectAt(dialog, "dependencies"), "runtime")["react-aria-components"] = "^1.13.0";
    const effectiveRange = "^1.13.0";
    const effectiveDigest = sha256(effectiveRange);
    (button.structuredPatches as Record<string, unknown>[])[0]!.ownedValueDigest = effectiveDigest;
    (dialog.structuredPatches as Record<string, unknown>[]).push({
      ...(button.structuredPatches as Record<string, unknown>[])[0]!,
    });
    const dependency = objectAt(
      objectAt(compatible, "dependencyOwnership"),
      "runtime:react-aria-components",
    );
    dependency.range = effectiveRange;
    dependency.owners = ["official:button", "official:dialog"];
    const patch = objectAt(objectAt(compatible, "patchOwnership"), "dep-react-aria-components");
    patch.ownedValueDigest = effectiveDigest;
    patch.owners = ["official:button", "official:dialog"];

    expect(() => validateDistributionProvenance(compatible)).not.toThrow();

    dependency.range = "^2.0.0";
    expect(() => validateDistributionProvenance(compatible)).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "DISTRIBUTION_OWNERSHIP_INVALID" }),
    );
  });
});
