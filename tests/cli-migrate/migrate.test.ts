import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyInit,
  planInit,
  validateMergoraConfig,
} from "../../packages/cli/src/configuration.ts";
import type { CliError } from "../../packages/cli/src/contracts.ts";
import {
  applyMigration,
  listBuiltInMigrations,
  planMigration,
} from "../../packages/cli/src/migrate.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const temporaryDirectories: string[] = [];

function project(initialized = true) {
  const fixture = createProjectFixture();
  temporaryDirectories.push(fixture.root);
  if (initialized) {
    applyInit({ projectRoot: fixture.root }, planInit({ projectRoot: fixture.root }).planDigest);
  }
  return fixture;
}

function legacyConfig() {
  return {
    schemaVersion: 0,
    framework: "next-app",
    sourceRoot: "src",
    globalCss: "src/app/globals.css",
    aliasPrefix: "@",
    defaultMode: "source",
    tokenPreset: "workbench",
  } as const;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("trusted migration planning", () => {
  it("treats an already-v1 config as a deterministic executable no-op", () => {
    const fixture = project();
    const options = { projectRoot: fixture.root, target: "config" as const };
    const plan = planMigration(options);
    expect(plan).toEqual(planMigration(options));
    expect(plan.migration).toMatchObject({
      id: "config-v0-to-v1",
      execution: "no-op",
      sourceVersion: "1",
      targetVersion: "1",
      externalExecutableCodeUsed: false,
    });
    const result = applyMigration(options, plan.planDigest);
    expect(result.transaction).toMatchObject({ state: "no-op", transactionId: null });
  });

  it("advances the exact supported v0 shape sequentially and reversibly", () => {
    const fixture = project(false);
    const configPath = resolve(fixture.root, "mergora.json");
    const before = `${JSON.stringify(legacyConfig(), null, 2)}\n`;
    writeFileSync(configPath, before, "utf8");
    const options = { projectRoot: fixture.root, target: "config" as const };
    const plan = planMigration(options);
    expect(plan.migration).toMatchObject({ execution: "transaction", trustedBuiltin: true });
    expect(plan.migration.steps).toEqual([
      expect.objectContaining({ sequence: 1, reversible: true, kind: "structured-json" }),
    ]);
    expect(plan.fileOperations).toEqual([
      expect.objectContaining({ target: "mergora.json", operation: "structured-patch" }),
    ]);

    const result = applyMigration(options, plan.planDigest);
    expect(result.transaction.state).toBe("committed");
    const migrated = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    expect(validateMergoraConfig(migrated).schemaVersion).toBe(1);
  });

  it("returns a blocking manual checklist for unsupported config shapes without mutation", () => {
    const fixture = project(false);
    const configPath = resolve(fixture.root, "mergora.json");
    const before = '{"schemaVersion":0,"unknown":true}\n';
    writeFileSync(configPath, before, "utf8");
    const options = { projectRoot: fixture.root, target: "config" as const };
    const plan = planMigration(options);
    expect(plan.migration.execution).toBe("manual-only");
    expect(plan.migration.manualChecklist.length).toBeGreaterThan(0);
    expect(plan.fileOperations).toEqual([]);
    expect(() => applyMigration(options, plan.planDigest)).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "MIGRATION_MANUAL_REQUIRED" }),
    );
    expect(readFileSync(configPath, "utf8")).toBe(before);
  });

  it("plans shadcn, framework, and mode work honestly without executing codemods", () => {
    const shadcn = project();
    const componentsPath = resolve(shadcn.root, "components.json");
    const components = '{"$schema":"https://ui.shadcn.com/schema.json","tsx":true}\n';
    writeFileSync(componentsPath, components, "utf8");
    const shadcnPlan = planMigration({ projectRoot: shadcn.root, target: "shadcn" });
    expect(shadcnPlan.migration).toMatchObject({
      execution: "manual-only",
      componentsJsonRetained: true,
      externalExecutableCodeUsed: false,
    });
    expect(readFileSync(componentsPath, "utf8")).toBe(components);

    const pages = project(false);
    const initOptions = { projectRoot: pages.root, framework: "next-pages" as const };
    applyInit(initOptions, planInit(initOptions).planDigest);
    const frameworkPlan = planMigration({
      projectRoot: pages.root,
      target: "framework",
      migrationId: "framework-next-pages-to-next-app-v1",
    });
    expect(frameworkPlan.migration).toMatchObject({
      execution: "manual-only",
      sourceVersion: "next-pages",
      targetVersion: "next-app",
    });

    const modePlan = planMigration({
      projectRoot: shadcn.root,
      target: "mode",
      migrationId: "mode-source-to-package-v1",
      itemIds: ["dialog", "button", "dialog"],
    });
    expect(modePlan.migration.itemIds).toEqual(["official:button", "official:dialog"]);
    expect(modePlan.migration.steps.every(({ reversible }) => reversible)).toBe(true);
  });

  it("rejects any external or mismatched migration ID", () => {
    const fixture = project();
    expect(listBuiltInMigrations()).toEqual([...listBuiltInMigrations()].sort());
    expect(() =>
      planMigration({
        projectRoot: fixture.root,
        target: "id",
        migrationId: "registry:run-this.js",
      }),
    ).toThrowError(expect.objectContaining<Partial<CliError>>({ code: "MIGRATION_ID_UNTRUSTED" }));
    expect(() =>
      planMigration({
        projectRoot: fixture.root,
        target: "mode",
        migrationId: "framework-next-app-to-vite-v1",
        itemIds: ["button"],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CliError>>({ code: "MIGRATION_TARGET_MISMATCH" }),
    );
  });
});
