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
import { validateSchemaDocument } from "../../registry/schemas/index.ts";
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
    expect(validateSchemaDocument("operation-plan", plan).errors).toEqual([]);
    expect(Object.keys(plan)).not.toContain("migration");
    expect(plan.migrations).toEqual([
      { id: "config-v0-to-v1", adapter: "config-v1", phase: "proposed" },
    ]);
    expect(plan.warnings.join(" ")).toContain("maps 1 to 1");
    expect(plan.fileOperations.every(({ operation }) => operation === "no-op")).toBe(true);
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
    expect(validateSchemaDocument("operation-plan", plan).errors).toEqual([]);
    expect(plan.warnings.join(" ")).toContain("Migration step 1 (config-v0-to-v1:write)");
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
    expect(validateSchemaDocument("operation-plan", plan).errors).toEqual([]);
    expect(plan.migrations[0]?.adapter).toBe("manual-checklist");
    expect(plan.warnings.some((warning) => warning.startsWith("Manual checklist"))).toBe(true);
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
    expect(validateSchemaDocument("operation-plan", shadcnPlan).errors).toEqual([]);
    expect(shadcnPlan.migrations[0]?.adapter).toBe("manual-checklist");
    expect(shadcnPlan.warnings.join(" ")).toContain("components.json file is retained");
    expect(readFileSync(componentsPath, "utf8")).toBe(components);

    const pages = project(false);
    const initOptions = { projectRoot: pages.root, framework: "next-pages" as const };
    applyInit(initOptions, planInit(initOptions).planDigest);
    const frameworkPlan = planMigration({
      projectRoot: pages.root,
      target: "framework",
      migrationId: "framework-next-pages-to-next-app-v1",
    });
    expect(validateSchemaDocument("operation-plan", frameworkPlan).errors).toEqual([]);
    expect(frameworkPlan.migrations[0]?.adapter).toBe("manual-checklist");
    expect(frameworkPlan.warnings.join(" ")).toContain("maps next-pages to next-app");

    const modePlan = planMigration({
      projectRoot: shadcn.root,
      target: "mode",
      migrationId: "mode-source-to-package-v1",
      itemIds: ["dialog", "button", "dialog"],
    });
    expect(validateSchemaDocument("operation-plan", modePlan).errors).toEqual([]);
    expect(modePlan.items.map(({ id }) => id)).toEqual(["official:button", "official:dialog"]);
    expect(modePlan.items.every(({ requested }) => requested === "*")).toBe(true);
    expect(
      modePlan.warnings.filter((warning) => warning.startsWith("Migration step")),
    ).toHaveLength(4);
  });

  it("transactionally imports only compatible shadcn project settings and retains components.json", () => {
    const fixture = project();
    const configPath = resolve(fixture.root, "mergora.json");
    const config = validateMergoraConfig(JSON.parse(readFileSync(configPath, "utf8")) as unknown);
    const componentsPath = resolve(fixture.root, "components.json");
    const components = {
      $schema: "https://ui.shadcn.com/schema.json",
      style: "new-york",
      rsc: true,
      tsx: true,
      tailwind: {
        config: "",
        css: config.styling.globalCss,
        baseColor: "neutral",
        cssVariables: true,
        prefix: "",
      },
      iconLibrary: "lucide",
      aliases: {
        components: "~/components",
        utils: "~/lib/utils",
        ui: "~/components/ui",
        lib: "~/lib",
        hooks: "~/hooks",
      },
      registries: {},
    };
    const beforeComponents = `${JSON.stringify(components, null, 2)}\n`;
    writeFileSync(componentsPath, beforeComponents, "utf8");

    const options = { projectRoot: fixture.root, target: "shadcn" as const };
    const plan = planMigration(options);

    expect(validateSchemaDocument("operation-plan", plan).errors).toEqual([]);
    expect(plan.migrations[0]?.adapter).toBe("config-v1");
    expect(plan.fileOperations).toEqual([
      expect.objectContaining({ target: "mergora.json", operation: "structured-patch" }),
    ]);
    expect(plan.warnings.join(" ")).toContain("components.json file is retained");

    const result = applyMigration(options, plan.planDigest);
    const migrated = validateMergoraConfig(JSON.parse(readFileSync(configPath, "utf8")) as unknown);
    expect(result.transaction.state).toBe("committed");
    expect(migrated.aliases).toMatchObject({
      components: "~/components/mergora",
      hooks: "~/hooks/mergora",
      lib: "~/lib/mergora",
    });
    expect(migrated.styling.globalCss).toBe(config.styling.globalCss);
    expect(readFileSync(componentsPath, "utf8")).toBe(beforeComponents);
  });

  it("refuses to reinterpret installed Mergora ownership during shadcn settings migration", () => {
    const fixture = project();
    const config = validateMergoraConfig(
      JSON.parse(readFileSync(resolve(fixture.root, "mergora.json"), "utf8")) as unknown,
    );
    writeFileSync(
      resolve(fixture.root, "components.json"),
      `${JSON.stringify({
        $schema: "https://ui.shadcn.com/schema.json",
        tsx: true,
        tailwind: { css: config.styling.globalCss },
        aliases: { components: "@/components", lib: "@/lib", hooks: "@/hooks" },
      })}\n`,
      "utf8",
    );
    const manifestPath = resolve(fixture.root, ".mergora/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      items: Record<string, unknown>;
    };
    manifest.items["official:button"] = {};
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const plan = planMigration({ projectRoot: fixture.root, target: "shadcn" });
    expect(plan.migrations[0]?.adapter).toBe("manual-checklist");
    expect(plan.items.map(({ id }) => id)).toEqual(["official:button"]);
    expect(plan.fileOperations).toEqual([]);
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
