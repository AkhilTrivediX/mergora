import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireDistributionPackageEvidence,
  applyInit,
  applyProjectDistributionModeMigration,
  planInit,
  planProjectDistributionModeMigration,
  type ProjectDistributionModeOptions,
  type ProvenanceManifest,
} from "../../packages/cli/src/index.ts";
import { basePath } from "../../packages/cli/src/source-operations.ts";
import { validateSchemaDocument } from "../../registry/schemas/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";
import { createAuthenticModeFixture, type AuthenticModeFixture } from "./authentic-mode-fixture.ts";

const roots: string[] = [];

function write(root: string, target: string, bytes: Uint8Array): void {
  const path = resolve(root, target);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function readJson<T>(root: string, target: string): T {
  return JSON.parse(readFileSync(resolve(root, target), "utf8")) as T;
}

async function projectFor(direction: "source-to-package" | "package-to-source"): Promise<{
  readonly fixture: AuthenticModeFixture;
  readonly options: ProjectDistributionModeOptions;
  readonly root: string;
}> {
  const project = createProjectFixture({ directoryPrefix: `mergora-mode-command-${direction}-` });
  roots.push(project.root);
  const init = { projectRoot: project.root, defaultMode: "hybrid" as const };
  applyInit(init, planInit(init).planDigest);
  const config = readJson<Record<string, unknown>>(project.root, "mergora.json");
  const fixture = await createAuthenticModeFixture(project.root, config, direction);
  write(project.root, ".mergora/manifest.json", fixture.currentManifest);
  write(project.root, "src/app/page.tsx", fixture.pageBefore);
  const packageJson = readJson<Record<string, unknown>>(project.root, "package.json");
  const dependencies = {
    ...((packageJson.dependencies as Record<string, string> | undefined) ?? {}),
  };
  if (direction === "source-to-package") delete dependencies["mergora-ui"];
  else dependencies["mergora-ui"] = "1.2.3";
  packageJson.dependencies = dependencies;
  write(project.root, "package.json", Buffer.from(`${JSON.stringify(packageJson, null, 2)}\n`));
  if (direction === "source-to-package") {
    write(project.root, fixture.sourceTarget, fixture.sourceBytes);
    const digest = (fixture.current.items as Record<string, { files: { base: string }[] }>)[
      "official:button"
    ]!.files[0]!.base as `sha256:${string}`;
    write(project.root, basePath(digest), fixture.sourceBytes);
  }
  const acquiredRelease = fixture.migration.acquiredReleases[0]!;
  const packageEvidence = await acquireDistributionPackageEvidence({
    projectRoot: project.root,
    acquiredRelease,
    offline: true,
    vendorReader: async () => fixture.tarball,
  });
  return {
    root: project.root,
    fixture,
    options: {
      projectRoot: project.root,
      itemIds: ["button"],
      to: direction === "source-to-package" ? "package" : "source",
      acquiredReleases: [acquiredRelease],
      packageEvidence: [packageEvidence],
      noInstall: true,
      offline: true,
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("project distribution mode command", () => {
  it("plans and applies source-to-package with exact imports, ownership, and rollback evidence", async () => {
    const project = await projectFor("source-to-package");
    const first = planProjectDistributionModeMigration(project.options);
    const second = planProjectDistributionModeMigration(project.options);

    expect(second).toEqual(first);
    expect(validateSchemaDocument("operation-plan", first).errors).toEqual([]);
    expect(first).toMatchObject({
      command: "migrate",
      items: [expect.objectContaining({ id: "official:button", mode: "package" })],
      rollbackAvailable: true,
    });
    expect(first.fileOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "delete", target: project.fixture.sourceTarget }),
        expect.objectContaining({ operation: "semantic-merge", target: "src/app/page.tsx" }),
        expect.objectContaining({ operation: "structured-patch", target: "package.json" }),
      ]),
    );

    const result = applyProjectDistributionModeMigration(project.options, first.planDigest);
    expect(result.transaction.state).toBe("committed");
    expect(existsSync(resolve(project.root, project.fixture.sourceTarget))).toBe(false);
    expect(readFileSync(resolve(project.root, "src/app/page.tsx"), "utf8")).toContain(
      'from "mergora-ui/button"',
    );
    expect(
      readJson<{ dependencies: Record<string, string> }>(project.root, "package.json").dependencies[
        "mergora-ui"
      ],
    ).toBe("1.2.3");
    expect(
      readJson<ProvenanceManifest>(project.root, ".mergora/manifest.json").items["official:button"]!
        .mode,
    ).toBe("package");
  });

  it("plans and applies package-to-source with authentic bytes and dependency removal", async () => {
    const project = await projectFor("package-to-source");
    const plan = planProjectDistributionModeMigration(project.options);

    expect(validateSchemaDocument("operation-plan", plan).errors).toEqual([]);
    expect(plan.fileOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "add", target: project.fixture.sourceTarget }),
        expect.objectContaining({ operation: "semantic-merge", target: "src/app/page.tsx" }),
      ]),
    );
    const result = applyProjectDistributionModeMigration(project.options, plan.planDigest);

    expect(result.transaction.state).toBe("committed");
    expect(readFileSync(resolve(project.root, project.fixture.sourceTarget))).toEqual(
      project.fixture.sourceBytes,
    );
    expect(readFileSync(resolve(project.root, "src/app/page.tsx"), "utf8")).toContain(
      'from "@/components/mergora/button/button"',
    );
    expect(
      readJson<{ dependencies: Record<string, string> }>(project.root, "package.json").dependencies[
        "mergora-ui"
      ],
    ).toBeUndefined();
    expect(
      readJson<ProvenanceManifest>(project.root, ".mergora/manifest.json").items["official:button"]!
        .mode,
    ).toBe("source");
  });

  it("fails closed for dirty owned source and relative consumer imports", async () => {
    const dirty = await projectFor("source-to-package");
    write(dirty.root, dirty.fixture.sourceTarget, Buffer.from("export const local = true;\n"));
    expect(() => planProjectDistributionModeMigration(dirty.options)).toThrowError(
      expect.objectContaining({ code: "MODE_MIGRATION_SOURCE_DIRTY" }),
    );

    const relative = await projectFor("source-to-package");
    write(
      relative.root,
      "src/app/page.tsx",
      Buffer.from('import { Button } from "../components/mergora/button/button";\n'),
    );
    expect(() => planProjectDistributionModeMigration(relative.options)).toThrowError(
      expect.objectContaining({ code: "MODE_MIGRATION_IMPORT_MAPPING_UNAVAILABLE" }),
    );
  });

  it("recomputes the complete live plan and rejects stale consent", async () => {
    const project = await projectFor("source-to-package");
    const plan = planProjectDistributionModeMigration(project.options);
    write(
      project.root,
      "src/app/page.tsx",
      Buffer.from(`${readFileSync(resolve(project.root, "src/app/page.tsx"), "utf8")}\n`),
    );

    expect(() =>
      applyProjectDistributionModeMigration(project.options, plan.planDigest),
    ).toThrowError(expect.objectContaining({ code: "PLAN_PRECONDITION_STALE" }));
  });
});
