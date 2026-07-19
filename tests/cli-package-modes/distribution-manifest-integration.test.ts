import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalJson, type CliError, sha256 } from "../../packages/cli/src/contracts.ts";
import {
  applyDistributionModeTransaction,
  planDistributionModeTransaction,
  type ApplyDistributionModeTransactionOptions,
  type PlanDistributionModeTransactionOptions,
} from "../../packages/cli/src/distribution-mode-migration.ts";
import {
  basePath,
  distributionProvenanceFromManifest,
  parseManifestBytes,
} from "../../packages/cli/src/source-operations.ts";
import { validateSchemaDocument } from "../../registry/schemas/index.ts";
import { createAuthenticModeFixture, type AuthenticModeFixture } from "./authentic-mode-fixture.ts";

const configUrl = new URL("./fixtures/valid-config.json", import.meta.url);
const roots: string[] = [];

function tempRoot(): string {
  const value = mkdtempSync(resolve(tmpdir(), "mergora-mode-apply-"));
  roots.push(value);
  return value;
}

function config(): Record<string, unknown> {
  return JSON.parse(readFileSync(configUrl, "utf8")) as Record<string, unknown>;
}

function write(root: string, target: string, bytes: Uint8Array): void {
  const path = resolve(root, ...target.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function seedLiveProject(root: string, fixture: AuthenticModeFixture): void {
  write(root, "mergora.json", Buffer.from(`${JSON.stringify(fixture.config, null, 2)}\n`));
  write(root, ".mergora/manifest.json", fixture.currentManifest);
  write(root, "package.json", fixture.packageBefore);
  write(root, "src/app/page.tsx", fixture.pageBefore);
  if (fixture.migration.from === "source") {
    write(root, fixture.sourceTarget, fixture.sourceBytes);
    write(root, basePath(sha256(fixture.sourceBytes)), fixture.sourceBytes);
  }
}

function applyOptions(
  root: string,
  fixture: AuthenticModeFixture,
  overrides: Partial<ApplyDistributionModeTransactionOptions> = {},
): ApplyDistributionModeTransactionOptions {
  const reviewedPlanDigest = planDistributionModeTransaction(planOptions(fixture)).plan.planDigest;
  return {
    migration: fixture.migration,
    reviewedPlanDigest,
    proposedManifestBytes: fixture.proposedManifest,
    ...fixture.materialization,
    cliVersion: "0.0.0",
    projectRoot: root,
    packageManager: "npm",
    noInstall: true,
    yes: true,
    ...overrides,
  };
}

function planOptions(
  fixture: AuthenticModeFixture,
  overrides: Partial<PlanDistributionModeTransactionOptions> = {},
): PlanDistributionModeTransactionOptions {
  return {
    migration: fixture.migration,
    proposedManifestBytes: fixture.proposedManifest,
    ...fixture.materialization,
    cliVersion: "0.0.0",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("closed distribution mode execution", () => {
  it("executes source-to-package with internal consent and validators, returning committed provenance", async () => {
    const root = tempRoot();
    const fixture = await createAuthenticModeFixture(root, config(), "source-to-package");
    seedLiveProject(root, fixture);
    const reviewed = planDistributionModeTransaction(planOptions(fixture));
    expect(validateSchemaDocument("operation-plan", reviewed.plan).errors).toEqual([]);
    expect(reviewed.plan.dependencyChanges.every(({ owners }) => owners.length > 0)).toBe(true);

    const result = applyDistributionModeTransaction(applyOptions(root, fixture));

    expect(result.transaction.state).toBe("committed");
    expect(result.transaction.planDigest).toBe(reviewed.plan.planDigest);
    const committedPlan = JSON.parse(
      readFileSync(
        resolve(root, ".mergora/transactions", result.transaction.transactionId!, "plan.json"),
        "utf8",
      ),
    ) as unknown;
    expect(committedPlan).toEqual(reviewed.plan);
    expect(result.provenance.state.items["official:button"]?.mode).toBe("package");
    expect(readFileSync(resolve(root, "package.json"))).toEqual(fixture.packageAfter);
    expect(readFileSync(resolve(root, "src/app/page.tsx"))).toEqual(fixture.pageAfter);
    expect(() => readFileSync(resolve(root, ...fixture.sourceTarget.split("/")))).toThrow();
    const live = distributionProvenanceFromManifest(
      parseManifestBytes(readFileSync(resolve(root, ".mergora/manifest.json"))),
    );
    expect(live?.canonicalDigest).toBe(result.provenance.canonicalDigest);
    expect(Object.keys(result).sort()).toEqual(["provenance", "transaction"]);
  });

  it("executes package-to-source only with exact acquired bytes and immutable base", async () => {
    const root = tempRoot();
    const fixture = await createAuthenticModeFixture(root, config(), "package-to-source");
    seedLiveProject(root, fixture);
    const reviewed = planDistributionModeTransaction(planOptions(fixture));
    expect(validateSchemaDocument("operation-plan", reviewed.plan).errors).toEqual([]);

    const result = applyDistributionModeTransaction(applyOptions(root, fixture));

    expect(result.transaction.state).toBe("committed");
    expect(result.provenance.state.items["official:button"]?.mode).toBe("source");
    expect(readFileSync(resolve(root, ...fixture.sourceTarget.split("/")))).toEqual(
      fixture.sourceBytes,
    );
    expect(
      readFileSync(resolve(root, ...basePath(sha256(fixture.sourceBytes)).split("/"))),
    ).toEqual(fixture.sourceBytes);
    expect(readFileSync(resolve(root, "package.json"))).toEqual(fixture.packageAfter);
  });

  it("has no validator/consent injection surface and rejects changed reviewed plans", async () => {
    const root = tempRoot();
    const fixture = await createAuthenticModeFixture(root, config(), "source-to-package");
    seedLiveProject(root, fixture);
    type HasValidators = "validators" extends keyof ApplyDistributionModeTransactionOptions
      ? true
      : false;
    type HasAcceptedConsents =
      "acceptedConsents" extends keyof ApplyDistributionModeTransactionOptions ? true : false;
    const hasValidators: HasValidators = false;
    const hasAcceptedConsents: HasAcceptedConsents = false;
    const unsafe = vi.fn(() => ({ state: "pass" as const, summary: "unsafe" }));
    const injected = {
      ...applyOptions(root, fixture),
      validators: [
        {
          id: "caller-no-op",
          label: "digest",
          validateStagedOverlay: unsafe,
          validatePostCommit: unsafe,
        },
      ],
      acceptedConsents: [],
    } as ApplyDistributionModeTransactionOptions;
    const result = applyDistributionModeTransaction(injected);
    expect(result.transaction.state).toBe("committed");
    expect(unsafe).not.toHaveBeenCalled();
    expect(hasValidators).toBe(false);
    expect(hasAcceptedConsents).toBe(false);

    const secondRoot = tempRoot();
    const second = await createAuthenticModeFixture(secondRoot, config(), "source-to-package");
    seedLiveProject(secondRoot, second);
    const original = planDistributionModeTransaction(planOptions(second));
    const changed = planDistributionModeTransaction(planOptions(second, { cliVersion: "0.0.1" }));
    expect(changed.plan.planDigest).not.toBe(original.plan.planDigest);
    expect(() =>
      applyDistributionModeTransaction({
        ...applyOptions(secondRoot, second),
        reviewedPlanDigest: original.plan.planDigest,
        cliVersion: "0.0.1",
      }),
    ).toThrowError(expect.objectContaining<Partial<CliError>>({ code: "PLAN_PRECONDITION_STALE" }));

    const thirdRoot = tempRoot();
    const third = await createAuthenticModeFixture(thirdRoot, config(), "source-to-package");
    seedLiveProject(thirdRoot, third);
    expect(() =>
      applyDistributionModeTransaction({
        ...applyOptions(thirdRoot, third),
        reviewedPlanDigest: `sha256:${"0".repeat(64)}`,
      }),
    ).toThrowError(expect.objectContaining<Partial<CliError>>({ code: "PLAN_PRECONDITION_STALE" }));
  });

  it("rejects non-tgz or changed inventory evidence before any live mutation", async () => {
    const root = tempRoot();
    const fixture = await createAuthenticModeFixture(root, config(), "source-to-package");
    seedLiveProject(root, fixture);
    const beforeManifest = readFileSync(resolve(root, ".mergora/manifest.json"));
    const beforePackage = readFileSync(resolve(root, "package.json"));
    const evidence = fixture.materialization.packageIntegrityEvidence.map((entry) => ({
      ...entry,
      bytes: Buffer.from("plain text is not a package tarball"),
    }));

    expect(() =>
      applyDistributionModeTransaction(
        applyOptions(root, fixture, { packageIntegrityEvidence: evidence }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<CliError>>({
        code: "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
      }),
    );
    expect(readFileSync(resolve(root, ".mergora/manifest.json"))).toEqual(beforeManifest);
    expect(readFileSync(resolve(root, "package.json"))).toEqual(beforePackage);
    expect(readFileSync(resolve(root, ...fixture.sourceTarget.split("/")))).toEqual(
      fixture.sourceBytes,
    );
  });

  it("rolls every authoritative byte back when fixed post-validation detects runner tampering", async () => {
    const root = tempRoot();
    const fixture = await createAuthenticModeFixture(root, config(), "source-to-package");
    seedLiveProject(root, fixture);
    const beforeManifest = readFileSync(resolve(root, ".mergora/manifest.json"));
    const runner = vi.fn(() => {
      write(root, "src/app/page.tsx", Buffer.from("import { broken"));
      return { status: 0 };
    });

    expect(() =>
      applyDistributionModeTransaction(
        applyOptions(root, fixture, {
          noInstall: false,
          packageManagerRunner: runner,
        }),
      ),
    ).toThrowError();
    expect(runner).toHaveBeenCalledOnce();
    expect(readFileSync(resolve(root, ".mergora/manifest.json"))).toEqual(beforeManifest);
    expect(readFileSync(resolve(root, "package.json"))).toEqual(fixture.packageBefore);
    expect(readFileSync(resolve(root, "src/app/page.tsx"))).toEqual(fixture.pageBefore);
    expect(readFileSync(resolve(root, ...fixture.sourceTarget.split("/")))).toEqual(
      fixture.sourceBytes,
    );
  });

  it("rejects unreviewed package.json or import bytes before transaction creation", async () => {
    const root = tempRoot();
    const fixture = await createAuthenticModeFixture(root, config(), "source-to-package");
    seedLiveProject(root, fixture);
    const packageAfter = Buffer.from(
      `${canonicalJson({
        name: "consumer",
        dependencies: { "mergora-ui": "1.2.3" },
        scripts: { postinstall: "echo unsafe" },
      })}\n`,
    );
    expect(() =>
      applyDistributionModeTransaction(
        applyOptions(root, fixture, {
          targets: {
            ...fixture.materialization.targets,
            "package.json": { before: fixture.packageBefore, after: packageAfter },
          },
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<CliError>>({
        code: "MODE_MIGRATION_PACKAGE_JSON_SCOPE_INVALID",
      }),
    );
  });
});
