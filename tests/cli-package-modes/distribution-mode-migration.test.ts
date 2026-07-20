import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CliError } from "../../packages/cli/src/contracts.ts";
import {
  planDistributionModeTransaction,
  type PlanDistributionModeTransactionOptions,
} from "../../packages/cli/src/distribution-mode-migration.ts";
import { serializeDistributionProvenance } from "../../packages/cli/src/distribution-provenance.ts";
import { manifestBytes } from "../../packages/cli/src/source-operations.ts";
import {
  createAuthenticModeFixture,
  manifestForAuthenticState,
  type AuthenticModeFixture,
} from "./authentic-mode-fixture.ts";

const configUrl = new URL("./fixtures/valid-config.json", import.meta.url);
const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(resolve(tmpdir(), "mergora-mode-plan-"));
  roots.push(value);
  return value;
}

function config(): Record<string, unknown> {
  return JSON.parse(readFileSync(configUrl, "utf8")) as Record<string, unknown>;
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
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe("authentic distribution mode planning", () => {
  it("plans source-to-package from one exact acquired release without exposing execution hooks", async () => {
    const fixture = await createAuthenticModeFixture(root(), config(), "source-to-package");
    const review = planDistributionModeTransaction(planOptions(fixture));
    const plan = review.migrationPlan;

    expect(review.plan.command).toBe("migrate");
    expect(plan).toMatchObject({
      command: "migrate-mode",
      migrationId: "mode-source-to-package-v1",
      items: ["official:button"],
      manifestCommitOrder: "last",
      rollbackRequired: true,
      externalExecutableCodeUsed: false,
      validationRequirements: [
        "package-integrity",
        "typescript-imports",
        "consumer-type-imports",
        "structured-patch-adapters",
        "accessibility-contracts",
      ],
    });
    expect(plan.fileOperations).toEqual([
      expect.objectContaining({ operation: "delete", target: fixture.sourceTarget }),
    ]);
    expect(plan.dependencyOperations).toEqual([
      expect.objectContaining({ key: "runtime:mergora-ui", operation: "add" }),
    ]);
  });

  it("derives package-to-source files from authentic payload bytes and compiled targets", async () => {
    const fixture = await createAuthenticModeFixture(root(), config(), "package-to-source");
    const plan = planDistributionModeTransaction(planOptions(fixture)).migrationPlan;

    expect(plan.fileOperations).toEqual([
      expect.objectContaining({
        operation: "add",
        target: fixture.sourceTarget,
      }),
    ]);
    expect(plan.dependencyOperations).toEqual([
      expect.objectContaining({ key: "runtime:mergora-ui", operation: "remove" }),
    ]);
  });

  it("rejects a cloned release because authentic acquisition identity is not serializable", async () => {
    const fixture = await createAuthenticModeFixture(root(), config(), "package-to-source");
    const forged = {
      ...fixture.migration,
      acquiredReleases: structuredClone(fixture.migration.acquiredReleases),
    };
    expect(() =>
      planDistributionModeTransaction(planOptions(fixture, { migration: forged })),
    ).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "REGISTRY_ACQUIRED_RELEASE_UNAUTHENTIC" }),
    );
  });

  it("rejects caller-invented package-to-source files even when provenance is self-consistent", async () => {
    const fixture = await createAuthenticModeFixture(root(), config(), "package-to-source");
    const proposed = structuredClone(fixture.proposed);
    const item = (proposed.items as Record<string, Record<string, unknown>>)["official:button"]!;
    const files = item.files as Record<string, unknown>[];
    files[0]!.target = "src/components/mergora/attacker.tsx";
    const migration = { ...fixture.migration, proposedState: proposed };

    expect(() => planDistributionModeTransaction(planOptions(fixture, { migration }))).toThrowError(
      expect.objectContaining<Partial<CliError>>({
        code: "MODE_MIGRATION_ACQUIRED_SOURCE_MISMATCH",
      }),
    );
  });

  it("rejects package import rewrites that were not acquired with the exact payload", async () => {
    const fixture = await createAuthenticModeFixture(root(), config(), "package-to-source");
    const current = structuredClone(fixture.current);
    const item = (current.items as Record<string, Record<string, unknown>>)["official:button"]!;
    item.importSubpaths = ["mergora-ui/attacker"];
    const observation = {
      ...structuredClone(fixture.migration.observation),
      stateDigest: serializeDistributionProvenance(current).canonicalDigest,
    };
    const currentManifestBytes = manifestBytes(manifestForAuthenticState(current, fixture.config));

    expect(() =>
      planDistributionModeTransaction(
        planOptions(fixture, {
          migration: {
            ...fixture.migration,
            currentState: current,
            currentManifestBytes,
            observation,
          },
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<CliError>>({
        code: "MODE_MIGRATION_ACQUIRED_ITEM_INVALID",
      }),
    );
  });

  it("rejects stale source observations before producing a reviewable plan", async () => {
    const fixture = await createAuthenticModeFixture(root(), config(), "source-to-package");
    const observation = structuredClone(fixture.migration.observation);
    (observation.sourceFiles as Record<string, `sha256:${string}` | null>)[fixture.sourceTarget] =
      `sha256:${"f".repeat(64)}`;

    expect(() =>
      planDistributionModeTransaction(
        planOptions(fixture, { migration: { ...fixture.migration, observation } }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "MODE_MIGRATION_SOURCE_DIRTY" }),
    );
  });
});
