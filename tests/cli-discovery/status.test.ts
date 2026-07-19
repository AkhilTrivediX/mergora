import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyInit, planInit, projectStatus } from "../../packages/cli/src/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function digest(content: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function installedFixture() {
  const project = createProjectFixture();
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
  const target = "src/components/mergora/button/button.tsx";
  const content = "export const Button = true;\n";
  const base = digest(content);
  const hexadecimal = base.slice("sha256:".length);
  const basePath = resolve(
    project.root,
    `.mergora/bases/sha256/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}.blob`,
  );
  mkdirSync(dirname(basePath), { recursive: true });
  mkdirSync(dirname(resolve(project.root, target)), { recursive: true });
  writeFileSync(basePath, content);
  writeFileSync(resolve(project.root, target), content);
  const manifestPath = resolve(project.root, ".mergora/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.items = {
    "official:button": {
      files: [{ target, base, installed: base }],
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...project, target, content, basePath };
}

describe("local status classification", () => {
  it("classifies clean, locally modified, deleted, and missing-base states", () => {
    const project = installedFixture();
    expect(projectStatus(project.root).items[0]).toMatchObject({
      id: "official:button",
      status: "clean",
      files: [{ target: project.target, status: "clean" }],
    });

    writeFileSync(resolve(project.root, project.target), "// local customization\n");
    expect(projectStatus(project.root).items[0]?.status).toBe("locally-modified");

    unlinkSync(resolve(project.root, project.target));
    expect(projectStatus(project.root).items[0]?.status).toBe("locally-deleted");

    writeFileSync(resolve(project.root, project.target), project.content);
    unlinkSync(project.basePath);
    expect(projectStatus(project.root).items[0]?.status).toBe("missing-base");
  });

  it("reports unfinished journals while ignoring terminal retained transactions", () => {
    const project = installedFixture();
    const transactions = resolve(project.root, ".mergora/transactions");
    mkdirSync(resolve(transactions, "unfinished"), { recursive: true });
    mkdirSync(resolve(transactions, "retained"), { recursive: true });
    writeFileSync(
      resolve(transactions, "retained/transaction.json"),
      `${JSON.stringify({ schemaVersion: 1, state: "committed" })}\n`,
    );
    expect(projectStatus(project.root).incompleteTransactions).toEqual(["unfinished"]);
  });

  it("keeps legacy P1 provenance honest about missing immutable bases", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    mkdirSync(resolve(project.root, ".mergora"));
    writeFileSync(
      resolve(project.root, ".mergora/p1-manifest.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        mode: "p1-temporary-source-installer",
        items: ["button"],
        files: ["src/components/button/button.tsx"],
      })}\n`,
    );
    mkdirSync(resolve(project.root, "src/components/button"), { recursive: true });
    writeFileSync(resolve(project.root, "src/components/button/button.tsx"), "export {};\n");
    const status = projectStatus(project.root);
    expect(status.manifest).toBe("p1-legacy");
    expect(status.items[0]?.status).toBe("missing-base");
  });
});
