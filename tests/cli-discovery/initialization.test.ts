import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyInit,
  doctorProject,
  inspectProject,
  planInit,
  projectInfo,
  projectStatus,
  readMergoraConfig,
} from "../../packages/cli/src/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

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

    const initPlan = planInit({ projectRoot: project.root });
    applyInit({ projectRoot: project.root }, initPlan.planDigest);
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
    const initPlan = planInit({ projectRoot: project.root });
    applyInit({ projectRoot: project.root }, initPlan.planDigest);
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
    const initPlan = planInit({ projectRoot: project.root });
    applyInit({ projectRoot: project.root }, initPlan.planDigest);
    const config = JSON.parse(
      readFileSync(resolve(project.root, "mergora.json"), "utf8"),
    ) as Record<string, unknown>;
    config.unexpected = true;
    writeFileSync(resolve(project.root, "mergora.json"), JSON.stringify(config), "utf8");
    expect(() => readMergoraConfig(project.root)).toThrow(/missing or unknown fields/u);
  });
});
