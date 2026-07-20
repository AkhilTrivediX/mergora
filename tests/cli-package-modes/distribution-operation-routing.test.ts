import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireDistributionPackageEvidence,
  applyAcquiredSourceAdd,
  applyInit,
  applyPackageDistributionAdd,
  applyPackageDistributionRemove,
  applyPackageDistributionUpdate,
  listIncompleteTransactions,
  planAcquiredSourceAdd,
  planInit,
  planPackageDistributionAdd,
  planPackageDistributionRemove,
  planPackageDistributionUpdate,
  planRecovery,
  recoverTransaction,
  resolveDistributionAddMode,
  resolveDistributionUpdateRoute,
  TransactionInterruption,
  type AcquiredDistributionPackageEvidence,
  type PackageDistributionAddOptions,
  type PackageDistributionRemoveOptions,
  type PackageDistributionUpdateOptions,
  type ProvenanceManifest,
} from "../../packages/cli/src/index.ts";
import { validateSchemaDocument } from "../../registry/schemas/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";
import { createAuthenticModeFixture, type AuthenticModeFixture } from "./authentic-mode-fixture.ts";

const roots: string[] = [];

function initializedProject(defaultMode: "source" | "package" | "hybrid" = "hybrid") {
  const project = createProjectFixture({ directoryPrefix: "mergora-distribution-operation-" });
  roots.push(project.root);
  const options = { projectRoot: project.root, defaultMode } as const;
  applyInit(options, planInit(options).planDigest);
  return project;
}

function readJson<T>(root: string, target: string): T {
  return JSON.parse(readFileSync(resolve(root, target), "utf8")) as T;
}

function manifest(root: string): ProvenanceManifest {
  return readJson<ProvenanceManifest>(root, ".mergora/manifest.json");
}

async function authenticFixture(
  root: string,
  version = "1.2.3",
  source?: string,
): Promise<AuthenticModeFixture> {
  return createAuthenticModeFixture(
    root,
    readJson<Record<string, unknown>>(root, "mergora.json"),
    "package-to-source",
    version,
    source,
  );
}

async function evidenceFor(
  root: string,
  fixture: AuthenticModeFixture,
): Promise<AcquiredDistributionPackageEvidence> {
  return acquireDistributionPackageEvidence({
    projectRoot: root,
    acquiredRelease: fixture.migration.acquiredReleases[0]!,
    offline: true,
    vendorReader: async () => fixture.tarball,
  });
}

async function packageAddOptions(
  root: string,
  overrides: Partial<PackageDistributionAddOptions> = {},
): Promise<{ options: PackageDistributionAddOptions; fixture: AuthenticModeFixture }> {
  const fixture = await authenticFixture(root);
  const options: PackageDistributionAddOptions = {
    projectRoot: root,
    itemIds: ["button"],
    acquiredRelease: fixture.migration.acquiredReleases[0]!,
    packageEvidence: await evidenceFor(root, fixture),
    distributionMode: "package",
    noInstall: true,
    offline: true,
    ...overrides,
  };
  return { options, fixture };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("operation-level distribution routing", () => {
  it("uses the configured add default and accepts an explicit per-operation override", () => {
    const hybrid = initializedProject("hybrid");
    const packaged = initializedProject("package");
    const sourced = initializedProject("source");

    expect(resolveDistributionAddMode({ projectRoot: hybrid.root })).toBe("source");
    expect(resolveDistributionAddMode({ projectRoot: hybrid.root, explicitMode: "package" })).toBe(
      "package",
    );
    expect(resolveDistributionAddMode({ projectRoot: packaged.root })).toBe("package");
    expect(resolveDistributionAddMode({ projectRoot: sourced.root })).toBe("source");
  });

  it("adds exact package/config/import provenance with only selected project-side artifacts", async () => {
    const project = initializedProject("hybrid");
    const { options } = await packageAddOptions(project.root);
    const reviewed = planPackageDistributionAdd(options);

    expect(validateSchemaDocument("operation-plan", reviewed).errors).toEqual([]);
    expect(reviewed.items).toEqual([
      expect.objectContaining({ id: "official:button", mode: "package", toVersion: "1.2.3" }),
    ]);
    expect(reviewed.fileOperations.map(({ target }) => target).sort()).toEqual([
      ".mergora/contracts/official--button.json",
      ".mergora/manifest.json",
      "package.json",
    ]);
    expect(reviewed.fileOperations.every(({ target }) => !target.includes("bases/"))).toBe(true);
    expect(reviewed.validationSuite).toEqual(expect.arrayContaining(["parse", "ownership"]));

    applyPackageDistributionAdd(options, reviewed.planDigest);

    const packageJson = readJson<{ dependencies: Record<string, string> }>(
      project.root,
      "package.json",
    );
    const installed = manifest(project.root);
    expect(packageJson.dependencies["mergora-ui"]).toBe("1.2.3");
    expect(installed.items["official:button"]).toMatchObject({
      mode: "package",
      packageClaims: ["mergora-ui"],
      importSubpaths: ["mergora-ui/button"],
      releaseRef: "official@1.2.3",
    });
    expect(installed.items["official:button"]!.files).toEqual([
      expect.objectContaining({ role: "contract" }),
    ]);
    expect(installed.toolchain.formatter).toBe("mergora@1");
    expect(existsSync(resolve(project.root, "src/components/mergora/button/button.tsx"))).toBe(
      false,
    );
    const bases = resolve(project.root, ".mergora/bases");
    expect(existsSync(bases) ? readdirSync(bases) : []).not.toEqual([]);
    expect(resolveDistributionUpdateRoute({ projectRoot: project.root })).toMatchObject({
      mode: "package",
      qualifiedItemIds: ["official:button"],
      itemIds: ["button"],
    });
    expect(() =>
      resolveDistributionUpdateRoute({ projectRoot: project.root, explicitMode: "source" }),
    ).toThrowError(expect.objectContaining({ code: "DISTRIBUTION_MODE_MIGRATION_REQUIRED" }));
  });

  it("makes --no-format observable while retaining schema, parse, and ownership validation", async () => {
    const packageProject = initializedProject("package");
    const { options } = await packageAddOptions(packageProject.root, { noFormat: true });
    const reviewed = planPackageDistributionAdd(options);

    expect(reviewed.warnings).toContain(
      "Formatting was explicitly skipped; JSON/schema/ownership/archive validation remains enabled, and formatter provenance is none.",
    );
    expect(reviewed.validationSuite).toEqual(expect.arrayContaining(["parse", "ownership"]));
    applyPackageDistributionAdd(options, reviewed.planDigest);
    expect(manifest(packageProject.root).toolchain.formatter).toBe("none");

    const sourceProject = initializedProject("source");
    const fixture = await authenticFixture(
      sourceProject.root,
      "1.2.3",
      "export const Button = () => 'source-no-format';\n",
    );
    const sourceOptions = {
      projectRoot: sourceProject.root,
      itemIds: ["button"],
      acquiredRelease: fixture.migration.acquiredReleases[0]!,
      distributionMode: "source" as const,
      noFormat: true,
      noInstall: true,
      offline: true,
    };
    const sourcePlan = planAcquiredSourceAdd(sourceOptions);
    expect(sourcePlan.validationSuite).toContain("parse");
    expect(sourcePlan.warnings).toContain(
      "Formatting was explicitly skipped; media parsing and semantic transaction validation remain enabled, and formatter provenance is recorded as none.",
    );
    applyAcquiredSourceAdd(sourceOptions, sourcePlan.planDigest);
    expect(readFileSync(resolve(sourceProject.root, fixture.sourceTarget))).toEqual(
      fixture.sourceBytes,
    );
    expect(manifest(sourceProject.root).toolchain.formatter).toBe("none");
  });

  it("updates the fixed package release group by exact owned-value replacement", async () => {
    const project = initializedProject("package");
    const initial = await packageAddOptions(project.root);
    const initialPlan = planPackageDistributionAdd(initial.options);
    applyPackageDistributionAdd(initial.options, initialPlan.planDigest);
    const before = readFileSync(resolve(project.root, "package.json"), "utf8");

    const nextFixture = await authenticFixture(
      project.root,
      "1.2.4",
      "export const Button = () => 'next';\n",
    );
    const nextOptions: PackageDistributionUpdateOptions = {
      projectRoot: project.root,
      itemIds: ["button"],
      acquiredRelease: nextFixture.migration.acquiredReleases[0]!,
      packageEvidence: await evidenceFor(project.root, nextFixture),
      distributionMode: "package",
      noFormat: true,
      noInstall: true,
      offline: true,
    };
    const reviewed = planPackageDistributionUpdate(nextOptions);

    expect(reviewed.dependencyChanges).toEqual([
      expect.objectContaining({
        operation: "change",
        package: "mergora-ui",
        from: "1.2.3",
        to: "1.2.4",
        owners: ["official:button"],
      }),
    ]);
    expect(
      reviewed.warnings.some((warning) => warning.includes("formatter provenance is none")),
    ).toBe(true);
    applyPackageDistributionUpdate(nextOptions, reviewed.planDigest);

    const after = readFileSync(resolve(project.root, "package.json"), "utf8");
    expect(after).toBe(before.replace('"1.2.3"', '"1.2.4"'));
    const updatedManifest = manifest(project.root);
    expect(updatedManifest.items["official:button"]).toMatchObject({
      mode: "package",
      resolved: "1.2.4",
      releaseRef: "official@1.2.4",
    });
    expect(updatedManifest.toolchain.formatter).toBe("none");
    expect(updatedManifest.releases).toBeDefined();
    expect(Object.keys(updatedManifest.releases ?? {})).toEqual(["official@1.2.4"]);
    expect(existsSync(resolve(project.root, ".mergora/bases"))).toBe(true);
  });

  it("preserves a customized Contract and leaves the entire package update unapplied", async () => {
    const project = initializedProject("package");
    const initial = await packageAddOptions(project.root);
    applyPackageDistributionAdd(
      initial.options,
      planPackageDistributionAdd(initial.options).planDigest,
    );
    const contractPath = resolve(project.root, ".mergora/contracts/official--button.json");
    const customized = `${readFileSync(contractPath, "utf8").trimEnd()}\n\n`;
    writeFileSync(contractPath, customized, "utf8");
    const manifestBefore = readFileSync(resolve(project.root, ".mergora/manifest.json"));
    const packageBefore = readFileSync(resolve(project.root, "package.json"));

    const nextFixture = await authenticFixture(project.root, "1.2.4");
    const options: PackageDistributionUpdateOptions = {
      projectRoot: project.root,
      itemIds: ["button"],
      acquiredRelease: nextFixture.migration.acquiredReleases[0]!,
      packageEvidence: await evidenceFor(project.root, nextFixture),
      distributionMode: "package",
      noInstall: true,
      offline: true,
    };
    const reviewed = planPackageDistributionUpdate(options);
    expect(reviewed.conflicts).toEqual([
      expect.objectContaining({
        target: ".mergora/contracts/official--button.json",
        kind: "modify-modify",
      }),
    ]);
    expect(() => applyPackageDistributionUpdate(options, reviewed.planDigest)).toThrowError(
      expect.objectContaining({ code: "OPERATION_CONFLICT" }),
    );
    expect(readFileSync(contractPath, "utf8")).toBe(customized);
    expect(readFileSync(resolve(project.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
    expect(readFileSync(resolve(project.root, "package.json"))).toEqual(packageBefore);
  });

  it("recovers an interrupted Contract commit without splitting artifact and manifest ownership", async () => {
    const project = initializedProject("package");
    const initial = await packageAddOptions(project.root);
    const manifestBefore = readFileSync(resolve(project.root, ".mergora/manifest.json"));
    const packageBefore = readFileSync(resolve(project.root, "package.json"));
    let interrupted = false;
    const options: PackageDistributionAddOptions = {
      ...initial.options,
      faultInjector(point, context) {
        if (
          !interrupted &&
          point === "commit-file" &&
          context.target === ".mergora/contracts/official--button.json"
        ) {
          interrupted = true;
          throw new TransactionInterruption("interrupt selected Contract commit");
        }
      },
    };
    const reviewed = planPackageDistributionAdd(options);
    expect(() => applyPackageDistributionAdd(options, reviewed.planDigest)).toThrow(
      TransactionInterruption,
    );
    expect(interrupted).toBe(true);
    const [transactionId] = listIncompleteTransactions(project.root);
    expect(transactionId).toBeDefined();
    const recovery = planRecovery({ root: project.root, transactionId });
    const recovered = recoverTransaction(
      { root: project.root, transactionId, allowCurrentProcessLockForTesting: true },
      recovery.plan.planDigest,
    );
    expect(recovered.state).toBe("rolled-back");
    expect(readFileSync(resolve(project.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
    expect(readFileSync(resolve(project.root, "package.json"))).toEqual(packageBefore);
    expect(existsSync(resolve(project.root, ".mergora/contracts/official--button.json"))).toBe(
      false,
    );
  });

  it("removes only an exact unmodified package Contract and exact owned dependency", async () => {
    const project = initializedProject("package");
    const initial = await packageAddOptions(project.root);
    applyPackageDistributionAdd(
      initial.options,
      planPackageDistributionAdd(initial.options).planDigest,
    );
    const contractPath = resolve(project.root, ".mergora/contracts/official--button.json");
    const originalContract = readFileSync(contractPath);
    const removeOptions: PackageDistributionRemoveOptions = {
      projectRoot: project.root,
      itemIds: ["button"],
      noInstall: true,
      offline: true,
    };

    writeFileSync(contractPath, Buffer.concat([originalContract, Buffer.from("\n")]));
    const manifestBefore = readFileSync(resolve(project.root, ".mergora/manifest.json"));
    const packageBefore = readFileSync(resolve(project.root, "package.json"));
    const customizedPlan = planPackageDistributionRemove(removeOptions);
    expect(customizedPlan.conflicts).toEqual([
      expect.objectContaining({
        target: ".mergora/contracts/official--button.json",
        kind: "modify-delete",
      }),
    ]);
    expect(() =>
      applyPackageDistributionRemove(removeOptions, customizedPlan.planDigest),
    ).toThrowError(expect.objectContaining({ code: "OPERATION_CONFLICT" }));
    expect(readFileSync(resolve(project.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
    expect(readFileSync(resolve(project.root, "package.json"))).toEqual(packageBefore);

    writeFileSync(contractPath, originalContract);
    const packagePath = resolve(project.root, "package.json");
    writeFileSync(packagePath, readFileSync(packagePath, "utf8").replace("1.2.3", "9.9.9"));
    expect(() => planPackageDistributionRemove(removeOptions)).toThrowError(
      expect.objectContaining({ code: "DEPENDENCY_OWNERSHIP_PRECONDITION_FAILED" }),
    );
    writeFileSync(packagePath, packageBefore);

    const reviewed = planPackageDistributionRemove(removeOptions);
    expect(validateSchemaDocument("operation-plan", reviewed).errors).toEqual([]);
    expect(reviewed.fileOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "delete",
          target: ".mergora/contracts/official--button.json",
        }),
        expect.objectContaining({ operation: "structured-patch", target: "package.json" }),
      ]),
    );
    const removed = applyPackageDistributionRemove(removeOptions, reviewed.planDigest);
    expect(removed.command).toBe("remove");
    expect(removed.transaction.state).toBe("committed");
    expect(existsSync(contractPath)).toBe(false);
    expect(manifest(project.root).items).toEqual({});
    expect(
      readJson<{ dependencies: Record<string, string> }>(project.root, "package.json").dependencies[
        "mergora-ui"
      ],
    ).toBeUndefined();
  });

  it("supports package --keep-files by detaching provenance without deleting Contract bytes", async () => {
    const project = initializedProject("package");
    const initial = await packageAddOptions(project.root);
    applyPackageDistributionAdd(
      initial.options,
      planPackageDistributionAdd(initial.options).planDigest,
    );
    const contractPath = resolve(project.root, ".mergora/contracts/official--button.json");
    const contractBefore = readFileSync(contractPath);
    const options: PackageDistributionRemoveOptions = {
      projectRoot: project.root,
      itemIds: ["button"],
      keepFiles: true,
      noInstall: true,
      offline: true,
    };
    const reviewed = planPackageDistributionRemove(options);
    expect(reviewed.fileOperations).toContainEqual(
      expect.objectContaining({
        operation: "no-op",
        target: ".mergora/contracts/official--button.json",
      }),
    );
    applyPackageDistributionRemove(options, reviewed.planDigest);
    expect(readFileSync(contractPath)).toEqual(contractBefore);
    expect(manifest(project.root).items).toEqual({});
  });

  it("rejects stale plans, cloned evidence, and offline package acquisition without vendor bytes", async () => {
    const project = initializedProject("package");
    const { options, fixture } = await packageAddOptions(project.root);
    const reviewed = planPackageDistributionAdd(options);
    const cloned = {
      ...options.packageEvidence,
      artifact: { ...options.packageEvidence.artifact },
    } as AcquiredDistributionPackageEvidence;

    expect(() => planPackageDistributionAdd({ ...options, packageEvidence: cloned })).toThrowError(
      expect.objectContaining({ code: "DISTRIBUTION_PACKAGE_EVIDENCE_UNAUTHENTIC" }),
    );
    await expect(
      acquireDistributionPackageEvidence({
        projectRoot: project.root,
        acquiredRelease: fixture.migration.acquiredReleases[0]!,
        offline: true,
      }),
    ).rejects.toMatchObject({ code: "DISTRIBUTION_PACKAGE_OFFLINE_MISSING" });

    const packagePath = resolve(project.root, "package.json");
    const tampered = `${readFileSync(packagePath, "utf8").trimEnd()}\n\n`;
    writeFileSync(packagePath, tampered, "utf8");
    expect(() => applyPackageDistributionAdd(options, reviewed.planDigest)).toThrowError(
      expect.objectContaining({ code: "PLAN_PRECONDITION_STALE" }),
    );
    expect(readFileSync(packagePath, "utf8")).toBe(tampered);
    expect(manifest(project.root).items).toEqual({});
  });

  it("fails closed when package add would duplicate an existing source owner", async () => {
    const project = initializedProject("hybrid");
    const fixture = await authenticFixture(project.root);
    const sourceOptions = {
      projectRoot: project.root,
      itemIds: ["button"],
      acquiredRelease: fixture.migration.acquiredReleases[0]!,
      distributionMode: "source" as const,
      noInstall: true,
      offline: true,
    };
    const sourcePlan = planAcquiredSourceAdd(sourceOptions);
    applyAcquiredSourceAdd(sourceOptions, sourcePlan.planDigest);
    const sourceBefore = readFileSync(resolve(project.root, fixture.sourceTarget));
    const packageEvidence = await evidenceFor(project.root, fixture);

    expect(() =>
      planPackageDistributionAdd({
        ...sourceOptions,
        distributionMode: "package",
        packageEvidence,
      }),
    ).toThrowError(expect.objectContaining({ code: "DISTRIBUTION_MIXED_OWNERSHIP_CONFLICT" }));
    expect(readFileSync(resolve(project.root, fixture.sourceTarget))).toEqual(sourceBefore);
    expect(manifest(project.root).items["official:button"]?.mode).toBe("source");
    expect(
      readJson<{ dependencies: Record<string, string> }>(project.root, "package.json").dependencies[
        "mergora-ui"
      ],
    ).toBeUndefined();
  });
});
