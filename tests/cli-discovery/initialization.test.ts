import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyInit,
  doctorProject,
  inspectProject,
  installP1Source,
  planInit,
  planP1SourceInstall,
  projectInfo,
  projectStatus,
  readMergoraConfig,
} from "../../packages/cli/src/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

function fixture(...parameters: Parameters<typeof createProjectFixture>) {
  const project = createProjectFixture(...parameters);
  temporaryDirectories.push(project.root);
  return project;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("project initialization", () => {
  it("plans exact portable edits before writing anything", () => {
    const project = fixture({ directoryPrefix: "mergora cli spaces " });
    const plan = planInit({ projectRoot: project.root });

    expect(plan.projectRoot).toBe(".");
    expect(plan.detection.framework).toBe("next-app");
    expect(plan.detection.packageManager).toBe("pnpm");
    expect(plan.detection.aliasPrefix).toBe("@");
    expect(plan.edits.map(({ target }) => target)).toEqual([
      "mergora.json",
      ".gitignore",
      ".mergora/manifest.json",
    ]);
    expect(plan.edits.every(({ afterDigest }) => afterDigest?.startsWith("sha256:") === true)).toBe(
      true,
    );
    expect(plan.planDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(false);
    expect(existsSync(resolve(project.root, ".mergora"))).toBe(false);
  });

  it("applies only planned metadata and preserves package, tsconfig, and CSS bytes", () => {
    const project = fixture({ newline: "\r\n", directoryPrefix: "mergora cli CRLF " });
    const packageBefore = readFileSync(resolve(project.root, "package.json"));
    const tsconfigBefore = readFileSync(resolve(project.root, "tsconfig.json"));
    const cssBefore = readFileSync(resolve(project.root, project.globalCss));
    writeFileSync(resolve(project.root, ".gitignore"), `dist/\r\n# consumer rule\r\n`, "utf8");

    const plan = planInit({ projectRoot: project.root });
    applyInit({ projectRoot: project.root }, plan.planDigest);

    expect(readFileSync(resolve(project.root, "package.json"))).toEqual(packageBefore);
    expect(readFileSync(resolve(project.root, "tsconfig.json"))).toEqual(tsconfigBefore);
    expect(readFileSync(resolve(project.root, project.globalCss))).toEqual(cssBefore);
    const ignore = readFileSync(resolve(project.root, ".gitignore"), "utf8");
    expect(ignore).toContain("dist/\r\n# consumer rule\r\n");
    expect(ignore).toContain(".mergora/cache/\r\n");
    expect(ignore.replaceAll("\r\n", "")).not.toContain("\n");
    expect(readMergoraConfig(project.root)?.project.framework).toBe("next-app");
  });

  it("is deterministic and idempotent", () => {
    const project = fixture();
    const first = planInit({ projectRoot: project.root });
    applyInit({ projectRoot: project.root }, first.planDigest);
    const config = readFileSync(resolve(project.root, "mergora.json"));
    const manifest = readFileSync(resolve(project.root, ".mergora/manifest.json"));
    const second = planInit({ projectRoot: project.root });

    expect(second.writesRequired).toBe(false);
    expect(second.edits.every(({ action }) => action === "no-op")).toBe(true);
    applyInit({ projectRoot: project.root }, second.planDigest);
    expect(readFileSync(resolve(project.root, "mergora.json"))).toEqual(config);
    expect(readFileSync(resolve(project.root, ".mergora/manifest.json"))).toEqual(manifest);
  });

  it("fails a stale reviewed plan before writing", () => {
    const project = fixture();
    const plan = planInit({ projectRoot: project.root });
    writeFileSync(resolve(project.root, ".gitignore"), "consumer-change\n", "utf8");

    expect(() => applyInit({ projectRoot: project.root }, plan.planDigest)).toThrow(
      /plan changed before apply/u,
    );
    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(false);
  });

  it("never deletes a pre-existing predictable temporary filename", () => {
    const project = fixture();
    const plan = planInit({ projectRoot: project.root });
    const userFile = resolve(
      project.root,
      `mergora.json.mergora-init-${plan.planDigest.slice(-12)}.tmp`,
    );
    writeFileSync(userFile, "consumer-owned\n");
    applyInit({ projectRoot: project.root }, plan.planDigest);
    expect(readFileSync(userFile, "utf8")).toBe("consumer-owned\n");
  });

  it("reports portable local info, status, and doctor results", () => {
    const project = fixture();
    const before = doctorProject(project.root);
    expect(before.healthy).toBe(false);
    expect(before.checks.some(({ code }) => code === "CONFIG_MISSING")).toBe(true);

    applyInit({ projectRoot: project.root });
    const info = projectInfo(project.root);
    const status = projectStatus(project.root);
    const doctor = doctorProject(project.root);
    expect(info.projectRoot).toBe(".");
    expect(JSON.stringify(info)).not.toContain(project.root);
    expect(status.manifest).toBe("v1");
    expect(status.items).toEqual([]);
    expect(doctor.healthy).toBe(true);
    expect(JSON.stringify(doctor)).not.toContain(project.root);
  });
});

describe("project discovery failures", () => {
  it("requires an explicit framework when Next router roots are ambiguous", () => {
    const project = fixture();
    mkdirSync(resolve(project.root, "src/pages"), { recursive: true });
    expect(() => inspectProject(project.root)).toThrow(/Both Next App and Pages Router roots/u);
    expect(inspectProject(project.root, { framework: "next-app" }).framework).toBe("next-app");
  });

  it("requires explicit selection when CSS entries or aliases are ambiguous", () => {
    const project = fixture();
    mkdirSync(resolve(project.root, "src/styles"), { recursive: true });
    writeFileSync(resolve(project.root, "src/styles/globals.css"), '@import "tailwindcss";\n');
    expect(() => inspectProject(project.root)).toThrow(/Multiple global CSS candidates/u);

    const other = fixture({
      tsconfigText: `${JSON.stringify(
        {
          compilerOptions: { paths: { "@/*": ["src/*"], "~/*": ["src/*"] } },
        },
        null,
        2,
      )}\n`,
    });
    expect(() => inspectProject(other.root)).toThrow(/Multiple source aliases/u);
    expect(inspectProject(other.root, { aliasPrefix: "@" }).aliasPrefix).toBe("@");
  });

  it("reads JSONC aliases without rewriting comments, trailing commas, or string punctuation", () => {
    const tsconfigText = `{
  // Consumer-owned compiler configuration.
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*",], // Keep this trailing comma.
    },
    "pluginNote": "literal // text, /* text */, and }, punctuation",
  },
  "include": ["src",],
}
`;
    const project = fixture({ tsconfigText });
    const before = readFileSync(resolve(project.root, "tsconfig.json"));

    expect(inspectProject(project.root).aliasPrefix).toBe("@");
    applyInit({ projectRoot: project.root });
    expect(readFileSync(resolve(project.root, "tsconfig.json"))).toEqual(before);
  });

  it("accepts an explicitly relative source alias without deprecated baseUrl", () => {
    const project = fixture({
      tsconfigText: '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n',
    });

    expect(inspectProject(project.root).aliasPrefix).toBe("@");
  });

  it("rejects missing, invalid, and unbacked alias selections", () => {
    const missing = fixture({ tsconfigText: '{ "compilerOptions": { "strict": true } }\n' });
    expect(() => inspectProject(missing.root)).toThrow(/does not declare a source path alias/u);

    const configured = fixture();
    expect(() => inspectProject(configured.root, { aliasPrefix: "src" })).toThrow(
      /must start with @ or ~/u,
    );
    expect(() => inspectProject(configured.root, { aliasPrefix: "~" })).toThrow(
      /is not backed by the source aliases/u,
    );
  });

  it("rejects package-manager contradictions and unsupported root layouts", () => {
    const project = fixture();
    writeFileSync(resolve(project.root, "package-lock.json"), "{}\n");
    expect(() => inspectProject(project.root)).toThrow(/Conflicting authoritative/u);

    const rootSource = fixture({ framework: "vite-react" });
    rmSync(resolve(rootSource.root, "src"), { recursive: true, force: true });
    mkdirSync(resolve(rootSource.root, "app"));
    expect(() => inspectProject(rootSource.root)).toThrow(/named source root/u);
  });

  it("ignores an unrelated ancestor lockfile without a proven workspace boundary", () => {
    const outer = mkdtempSync(resolve(tmpdir(), "mergora-unrelated-ancestor-"));
    temporaryDirectories.push(outer);
    const project = createProjectFixture({ parentDirectory: outer, manager: "pnpm" });
    rmSync(resolve(project.root, "pnpm-lock.yaml"));
    writeFileSync(resolve(outer, "package-lock.json"), "{}\n");

    const inspection = inspectProject(project.root);
    expect(inspection.packageManager).toBe("pnpm");
    expect(inspection.packageManagerEvidence).toEqual(["package.json:packageManager"]);
  });

  it("rejects dirty configuration rather than silently ignoring fields", () => {
    const project = fixture();
    applyInit({ projectRoot: project.root });
    const config = JSON.parse(
      readFileSync(resolve(project.root, "mergora.json"), "utf8"),
    ) as Record<string, unknown>;
    config.unexpected = true;
    writeFileSync(resolve(project.root, "mergora.json"), JSON.stringify(config), "utf8");
    expect(() => readMergoraConfig(project.root)).toThrow(/missing or unknown fields/u);
  });
});

describe("dynamic compatibility add", () => {
  it("plans and installs transitive source closure", () => {
    const project = fixture();
    const plan = planP1SourceInstall({
      projectRoot: project.root,
      itemIds: ["provider"],
      registryDirectory,
    });
    expect(plan.items).toEqual(["direction", "slot", "provider"]);
    expect(plan.transitiveItems).toEqual(["direction", "slot"]);
    expect(plan.files.length).toBeGreaterThanOrEqual(12);
    expect(existsSync(resolve(project.root, "src/components/provider"))).toBe(false);

    const result = installP1Source({
      projectRoot: project.root,
      itemIds: ["provider"],
      registryDirectory,
    });
    expect(result.items).toEqual(plan.items);
    expect(existsSync(resolve(project.root, "src/components/provider/provider.tsx"))).toBe(true);
    expect(existsSync(resolve(project.root, "src/components/direction/direction.tsx"))).toBe(true);
    expect(existsSync(resolve(project.root, "src/components/slot/slot.tsx"))).toBe(true);
  });

  it("preserves CRLF package formatting while adding a compatible dependency", () => {
    const packageText =
      '{\r\n    "name": "format-fixture",\r\n    "private": true,\r\n    "packageManager": "pnpm@11.14.0",\r\n    "dependencies": {\r\n        "next": "16.2.10",\r\n        "react": "19.2.7",\r\n        "tailwindcss": "4.3.3"\r\n    }\r\n}\r\n';
    const project = fixture({ packageText, newline: "\r\n" });
    installP1Source({
      projectRoot: project.root,
      itemIds: ["dialog"],
      registryDirectory,
    });
    const after = readFileSync(resolve(project.root, "package.json"), "utf8");
    expect(after).toContain('    "private": true,\r\n');
    expect(after).toContain('        "react-aria-components": "1.19.0"');
    expect(after.replaceAll("\r\n", "")).not.toContain("\n");
    expect(JSON.parse(after)).toMatchObject({
      dependencies: { "react-aria-components": "1.19.0" },
    });
  });

  it("does not mistake dependency-like text inside a JSON string for the root field", () => {
    const packageText = `${JSON.stringify(
      {
        name: "string-fixture",
        description: 'example text containing "dependencies": { but no field',
        private: true,
        packageManager: "pnpm@11.14.0",
        dependencies: {
          next: "16.2.10",
          react: "19.2.7",
          tailwindcss: "4.3.3",
        },
      },
      null,
      2,
    )}\n`;
    const project = fixture({ packageText });
    installP1Source({ projectRoot: project.root, itemIds: ["dialog"], registryDirectory });
    const after = JSON.parse(readFileSync(resolve(project.root, "package.json"), "utf8")) as {
      description: string;
      dependencies: Record<string, string>;
    };
    expect(after.description).toContain('"dependencies": {');
    expect(after.dependencies["react-aria-components"]).toBe("1.19.0");
  });

  it("rejects duplicate top-level JSON keys before any source write", () => {
    const packageText = `{
  "name": "duplicate-fixture",
  "packageManager": "pnpm@11.14.0",
  "dependencies": { "next": "16.2.10", "react": "19.2.7", "tailwindcss": "4.3.3" },
  "dependencies": { "next": "16.2.10", "react": "19.2.7", "tailwindcss": "4.3.3" }
}\n`;
    const project = fixture({ packageText });
    expect(() =>
      installP1Source({ projectRoot: project.root, itemIds: ["dialog"], registryDirectory }),
    ).toThrow(/repeats top-level field/u);
    expect(existsSync(resolve(project.root, "src/components/dialog"))).toBe(false);
  });

  it("is idempotent and preserves compatible existing ranges", () => {
    const project = fixture();
    const packageDocument = JSON.parse(project.packageText) as Record<string, unknown>;
    (packageDocument.dependencies as Record<string, string>)["react-aria-components"] = "^1.19.0";
    writeFileSync(
      resolve(project.root, "package.json"),
      `${JSON.stringify(packageDocument, null, 2)}\n`,
    );
    const before = readFileSync(resolve(project.root, "package.json"));
    installP1Source({ projectRoot: project.root, itemIds: ["dialog"], registryDirectory });
    expect(readFileSync(resolve(project.root, "package.json"))).toEqual(before);
    const second = planP1SourceInstall({
      projectRoot: project.root,
      itemIds: ["dialog"],
      registryDirectory,
    });
    expect(second.files.every(({ status }) => status === "unchanged")).toBe(true);
    expect(second.dependenciesAdded).toEqual({});
    expect(second.writesRequired).toBe(false);
  });

  it("preflights all targets and leaves package bytes unchanged on collision", () => {
    const project = fixture();
    const target = resolve(project.root, "src/components/dialog");
    mkdirSync(target, { recursive: true });
    writeFileSync(resolve(target, "dialog.tsx"), "// local source\n");
    const packageBefore = readFileSync(resolve(project.root, "package.json"));
    expect(() =>
      installP1Source({ projectRoot: project.root, itemIds: ["dialog"], registryDirectory }),
    ).toThrow(/Refusing to overwrite locally modified source/u);
    expect(readFileSync(resolve(project.root, "package.json"))).toEqual(packageBefore);
    expect(existsSync(resolve(project.root, ".mergora/p1-manifest.json"))).toBe(false);
  });

  it("preserves unrelated files matching the former predictable add temp suffix", () => {
    const project = fixture();
    const plan = planP1SourceInstall({
      projectRoot: project.root,
      itemIds: ["dialog"],
      registryDirectory,
    });
    const userFile = resolve(
      project.root,
      `package.json.mergora-add-${plan.planDigest.slice(-12)}.tmp`,
    );
    writeFileSync(userFile, "consumer-owned\n");
    installP1Source({ projectRoot: project.root, itemIds: ["dialog"], registryDirectory });
    expect(readFileSync(userFile, "utf8")).toBe("consumer-owned\n");
  });
});
