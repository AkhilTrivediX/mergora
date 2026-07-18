import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertHonestGeneratedArtifact,
  assertPortableGeneratedPath,
  assertShadcnSourceItem,
  canonicalJson,
  createGenerationSnapshot,
  runWorkspaceGeneration,
  syncGeneratedFiles,
} from "../../tooling/registry-builder/src/index.ts";
import {
  assertCanonicalSourceImports,
  assertPortableSourcePath,
  buildSourceTransformPlan,
  createSourceTransformationSnapshot,
  discoverCanonicalSourceDescriptors,
  transformConsumerSource,
  transformPackageSource,
  type CanonicalSourceDescriptor,
} from "../../tooling/source-transformer/src/index.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const temporaryRoots: string[] = [];

function temporaryWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "mergora-generation-test-"));
  temporaryRoots.push(root);
  return root;
}

function testSource(
  id: string,
  entryPath = `registry/source/components/${id}/${id}.tsx`,
  itemDependencies: readonly string[] = [],
): CanonicalSourceDescriptor {
  const root = entryPath.slice(0, entryPath.lastIndexOf("/"));
  return {
    id,
    entryPath,
    declaredImports: [],
    itemDependencies,
    outputRole: "component",
    runtimeFiles: [entryPath],
    stylePath: `${root}/${id}.css`,
    runtimeDependencies: [],
    metadataPath: `${root}/metadata.json`,
    contractPath: `${root}/contract.json`,
    storyPath: null,
    apiPath: null,
    documentationPath: `${root}/README.md`,
    publicExports: [],
    visibleStatus: "unreleased",
  };
}

function jsonArtifacts(
  files: readonly { readonly path: string; readonly content: string }[],
): Map<string, unknown> {
  return new Map(
    files
      .filter((file) => file.path.endsWith(".json"))
      .map((file) => [file.path, JSON.parse(file.content)]),
  );
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    const resolvedTemporaryRoot = resolve(tmpdir());
    const resolvedTarget = resolve(root);
    if (
      !resolvedTarget.startsWith(
        `${resolvedTemporaryRoot}${process.platform === "win32" ? "\\" : "/"}`,
      )
    ) {
      throw new Error(`Refusing to remove non-temporary test directory ${resolvedTarget}.`);
    }
    rmSync(resolvedTarget, { recursive: true, force: true });
  }
});

describe("deterministic generation graph", () => {
  it("produces byte-identical snapshots repeatedly", async () => {
    const first = await createGenerationSnapshot(workspaceRoot);
    const second = await createGenerationSnapshot(workspaceRoot);
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThanOrEqual(41);
    expect(first.map((file) => file.path)).toEqual([...first.map((file) => file.path)].sort());
    expect(first.every((file) => file.content.endsWith("\n") && !file.content.includes("\r"))).toBe(
      true,
    );
    expect(first.every((file) => file.content === file.content.normalize("NFKC"))).toBe(true);
  });

  it("matches every committed generated artifact in check mode", async () => {
    const result = await runWorkspaceGeneration(workspaceRoot, "check");
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("contains no timestamp, machine path, release identity, digest field, or fabricated pass", async () => {
    const files = await createGenerationSnapshot(workspaceRoot);
    const combined = files.map((file) => file.content).join("\n");
    expect(combined).not.toContain(workspaceRoot);
    expect(combined).not.toMatch(/\b20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/u);
    expect(combined).not.toMatch(
      /"(?:generatedAt|releaseCommit|sourceDigest|evidenceDigest|payloadDigest|digest)":/u,
    );
    expect(combined).not.toContain('"state":"pass"');
    expect(combined).not.toContain('"publishedMaturity":"stable"');
    expect(combined).not.toContain('"implementationStatus":"implemented"');
  });

  it("exposes every discovered source without making a release claim", async () => {
    const files = await createGenerationSnapshot(workspaceRoot);
    const byPath = jsonArtifacts(files);
    const source = createSourceTransformationSnapshot(workspaceRoot, [
      ...(await import("../../registry/definitions/index.ts")).catalogDefinitions,
    ]);
    const sourceRows = source.sources.map((item) => [
      item.id,
      "source-present-unreleased",
      item.visibleStatus,
    ]);
    const catalog = byPath.get("registry/generated/catalog.json") as {
      publicationStatus: string;
      inventory: {
        definitions: number;
        implementationStatus: { sourcePresentUnreleased: number; unimplemented: number };
      };
      items: {
        id: string;
        implementationStatus: string;
        sourceAvailable: boolean;
        visibleStatus: string | null;
        publishedMaturity: unknown;
      }[];
    };
    const index = byPath.get("registry/generated/index-plan.json") as {
      publishable: boolean;
      registryIdentity: unknown;
      release: unknown;
      items: {
        id: string;
        version: unknown;
        payload: unknown;
        sourcePayload: string | null;
        visibleStatus: string | null;
      }[];
    };

    expect(catalog.publicationStatus).toBe("blocked-unreleased");
    expect(catalog.inventory).toEqual({
      catalogItems: 168,
      definitions: 178,
      implementationStatus: {
        sourcePresentUnreleased: source.sources.length,
        unimplemented: 178 - source.sources.length,
      },
      kits: 10,
      layers: { component: 113, foundation: 22, kit: 10, system: 33 },
      targetMaturity: { beta: 2, deprecated: 0, experimental: 1, stable: 175 },
      trust: { community: 0, core: 177, labs: 1 },
    });
    expect(
      catalog.items
        .filter((item) => item.sourceAvailable)
        .map((item) => [item.id, item.implementationStatus, item.visibleStatus]),
    ).toEqual(sourceRows);
    expect(catalog.items.every((item) => item.publishedMaturity === null)).toBe(true);
    expect(index).toMatchObject({ publishable: false, registryIdentity: null, release: null });
    expect(index.items.every((item) => item.version === null && item.payload === null)).toBe(true);
    expect(
      index.items.filter((item) => item.sourcePayload !== null).map((item) => item.id),
    ).toEqual(source.sources.map((item) => item.id));
    expect(index.items.find((item) => item.id === "data-grid")?.visibleStatus).toBe("experimental");
  });

  it("generates source, package, docs, API, contract, story, and Passport associations", async () => {
    const files = await createGenerationSnapshot(workspaceRoot);
    const byPath = jsonArtifacts(files);
    const sourcePlan = byPath.get("registry/generated/source-transform-plan.json") as {
      representativeExtensionPoints: { id: string; expectedEntryPath: string; status: string }[];
      items: {
        id: string;
        implementationStatus: string;
        transformStatus: string;
        emittedFiles: string[];
      }[];
    };
    const packagePlan = byPath.get("registry/generated/package-export-plan.json") as {
      exports: {
        itemId: string;
        implementationStatus: string;
        exportStatus: string;
        emittedExport: unknown;
      }[];
    };
    const docs = byPath.get("content/generated/docs-index.json") as {
      items: { id: string; sourceAvailable: boolean; evidenceAvailable: boolean }[];
    };
    const api = byPath.get("content/generated/api-index.json") as {
      entries: { id: string; status: string; exports: string[] }[];
    };
    const passports = byPath.get("registry/generated/passport-skeletons.json") as {
      items: {
        itemId: string;
        publishable: boolean;
        implementationStatus: string;
        overall: { state: string };
        missingInputs: string[];
      }[];
    };

    expect(sourcePlan.representativeExtensionPoints.map((entry) => entry.id)).toEqual([
      "button",
      "dialog",
      "combobox",
      "data-grid",
    ]);
    expect(
      sourcePlan.representativeExtensionPoints.every(
        (entry) => entry.status === "source-present-unreleased",
      ),
    ).toBe(true);
    const sourceIds = sourcePlan.items
      .filter((item) => item.implementationStatus === "source-present-unreleased")
      .map((item) => item.id);
    for (const id of sourceIds) {
      expect(sourcePlan.items.find((item) => item.id === id)).toMatchObject({
        implementationStatus: "source-present-unreleased",
        transformStatus: "generated-unreleased",
      });
      expect(sourcePlan.items.find((item) => item.id === id)?.emittedFiles.length).toBeGreaterThan(
        2,
      );
      expect(packagePlan.exports.find((entry) => entry.itemId === id)).toMatchObject({
        implementationStatus: "source-present-unreleased",
        exportStatus: "generated-unreleased",
      });
      expect(
        packagePlan.exports.find((entry) => entry.itemId === id)?.emittedExport,
      ).not.toBeNull();
      expect(docs.items.find((item) => item.id === id)).toMatchObject({
        sourceAvailable: true,
        evidenceAvailable: false,
      });
      expect(api.entries.find((entry) => entry.id === id)).toMatchObject({
        status: "source-present-unreleased",
      });
      expect(api.entries.find((entry) => entry.id === id)?.exports.length).toBeGreaterThan(0);
      expect(passports.items.find((item) => item.itemId === id)).toMatchObject({
        publishable: false,
        implementationStatus: "source-present-unreleased",
        overall: { state: "blocked" },
      });
      expect(passports.items.find((item) => item.itemId === id)?.missingInputs).not.toContain(
        "canonical-source",
      );
    }
  });
});

describe("package and source parity", () => {
  it("derives every UI package implementation byte from normalized canonical source", async () => {
    const generated = new Map(
      (await createGenerationSnapshot(workspaceRoot)).map((file) => [file.path, file.content]),
    );
    const source = createSourceTransformationSnapshot(workspaceRoot, [
      ...(await import("../../registry/definitions/index.ts")).catalogDefinitions,
    ]);

    for (const item of source.sources) {
      for (const file of item.normalizedFiles) {
        expect(generated.get(file.packagePath)).toBe(
          transformPackageSource(file.content, file.sourcePath),
        );
      }
    }
    expect(
      [...generated.keys()].filter((path) => path.startsWith("packages/ui/src/generated/")),
    ).toHaveLength(source.sources.reduce((total, item) => total + item.normalizedFiles.length, 0));
  });

  it("generates root and discovered subpath exports with CSS side-effect preservation", async () => {
    const files = await createGenerationSnapshot(workspaceRoot);
    const source = createSourceTransformationSnapshot(workspaceRoot, [
      ...(await import("../../registry/definitions/index.ts")).catalogDefinitions,
    ]);
    const manifest = JSON.parse(
      files.find((file) => file.path === "packages/ui/package.json")!.content,
    ) as {
      sideEffects: string[];
      exports: Record<string, unknown>;
      dependencies: Record<string, string>;
      mergora: { distributionStatus: string; publishedMaturity: unknown };
    };
    expect(manifest.sideEffects).toEqual(["**/*.css"]);
    expect(Object.keys(manifest.exports)).toEqual([
      ".",
      ...source.sources.flatMap((item) => [`./${item.id}`, `./${item.id}.css`]),
      "./package.json",
    ]);
    expect(manifest.dependencies).toMatchObject({
      "@tanstack/react-table": "catalog:",
      "react-aria-components": "catalog:",
    });
    expect(manifest.mergora).toMatchObject({
      distributionStatus: "unreleased",
      publishedMaturity: null,
    });
    const packageOutput = files
      .filter((file) => file.path.startsWith("packages/ui/src/generated/"))
      .map((file) => file.content)
      .join("\n");
    expect(packageOutput).not.toMatch(/\b(?:from|import)\s*["'][^"']+\.(?:ts|tsx)["']/u);
  });

  it("keeps native and shadcn source payloads on the deterministic consumer transform", async () => {
    const files = await createGenerationSnapshot(workspaceRoot);
    const byPath = jsonArtifacts(files);
    const source = createSourceTransformationSnapshot(workspaceRoot, [
      ...(await import("../../registry/definitions/index.ts")).catalogDefinitions,
    ]);
    for (const id of source.sources.map((item) => item.id)) {
      const native = byPath.get(`registry/generated/native-source-items/${id}.json`) as {
        publicationStatus: string;
        visibleStatus: string;
        release: unknown;
        registryDependencies: string[];
        files: { logicalPath: string; content: string; executable: boolean }[];
        associations: { contract: string; documentation: string };
      };
      const shadcn = byPath.get(`registry/generated/shadcn/${id}.json`);
      assertShadcnSourceItem(shadcn);
      expect(native).toMatchObject({ publicationStatus: "unreleased", release: null });
      expect(native.files.every((file) => file.executable === false)).toBe(true);
      expect(native.associations.contract).toMatch(/contract/u);
      expect(native.associations.documentation).toMatch(/README\.md$/u);
      expect(shadcn.files.map((file) => file.content)).toEqual(
        native.files.map((file) => file.content),
      );
      const canonical = source.sources.find((item) => item.id === id)!;
      expect(native.registryDependencies).toEqual([...canonical.itemDependencies].sort());
      expect(shadcn.registryDependencies).toEqual([...canonical.itemDependencies].sort());
      expect(native.files.map((file) => file.content)).toEqual(
        canonical.normalizedFiles.map((file) =>
          transformConsumerSource(file.content, file.sourcePath),
        ),
      );
      expect(native.files.map((file) => file.content).join("\n")).not.toMatch(
        /\b(?:from|import)\s*["']\.{1,2}\/[^"']+\.(?:js|ts|tsx)["']/u,
      );
    }
    const dataGrid = byPath.get("registry/generated/shadcn/data-grid.json") as {
      docs: string;
    };
    expect(dataGrid.docs).toMatch(/^Experimental/u);
    expect(dataGrid.docs).toMatch(/Risk Class 3 contract has not passed/u);
  });

  it("has built CSS inputs without unresolved local font or image assets", async () => {
    const source = createSourceTransformationSnapshot(workspaceRoot, [
      ...(await import("../../registry/definitions/index.ts")).catalogDefinitions,
    ]);
    for (const cssFile of source.sources.flatMap((item) =>
      item.normalizedFiles.filter((file) => file.mediaType === "text/css"),
    )) {
      const cssPath = resolve(workspaceRoot, ...cssFile.sourcePath.split("/"));
      const css = readFileSync(cssPath, "utf8");
      const references = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gu)].map(
        (match) => match[1]!,
      );
      for (const reference of references) {
        if (/^(?:data:|https?:)/u.test(reference)) continue;
        expect(existsSync(resolve(dirname(cssPath), reference))).toBe(true);
      }
    }
  });
});

describe("write/check drift protocol", () => {
  const expected = [
    { path: "registry/generated/a.json", content: '{"a":1}\n' },
    { path: "content/generated/b.json", content: '{"b":2}\n' },
  ] as const;

  it("writes once, verifies without mutation, and reports byte drift", () => {
    const root = temporaryWorkspace();
    expect(syncGeneratedFiles(root, expected, "write").ok).toBe(true);
    expect(syncGeneratedFiles(root, expected, "check")).toMatchObject({ ok: true, issues: [] });

    const drifted = join(root, "registry", "generated", "a.json");
    writeFileSync(drifted, '{"manual":true}\n', "utf8");
    const result = syncGeneratedFiles(root, expected, "check");
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: "drift",
      path: "registry/generated/a.json",
      message: "Generated file registry/generated/a.json differs from canonical output.",
    });
    expect(readFileSync(drifted, "utf8")).toBe('{"manual":true}\n');
  });

  it("reports missing and generator-orphaned files", () => {
    const root = temporaryWorkspace();
    mkdirSync(join(root, "registry", "generated"), { recursive: true });
    writeFileSync(join(root, "registry", "generated", "orphan.json"), "{}\n", "utf8");
    const result = syncGeneratedFiles(root, expected, "check");
    expect(result.issues.map((issue) => issue.code).sort()).toEqual([
      "missing",
      "missing",
      "unexpected",
    ]);
  });

  it("tracks generated UI output without treating hand-authored package config as a generated root", () => {
    const root = temporaryWorkspace();
    mkdirSync(join(root, "packages", "ui", "src", "generated"), { recursive: true });
    writeFileSync(join(root, "packages", "ui", "tsconfig.json"), "{}\n", "utf8");
    const files = [
      { path: "packages/ui/package.json", content: "{}\n" },
      { path: "packages/ui/src/index.ts", content: "export {};\n" },
      { path: "packages/ui/src/generated/button/button.tsx", content: "export {};\n" },
    ];
    syncGeneratedFiles(root, files, "write");
    expect(syncGeneratedFiles(root, files, "check").issues).toEqual([]);
    expect(existsSync(join(root, "packages", "ui", "tsconfig.json"))).toBe(true);
  });
});

describe("canonical import and path defenses", () => {
  it("discovers Dialog once from its suffixed manifest and exact API companion", () => {
    const root = temporaryWorkspace();
    const sourceDirectory = resolve(workspaceRoot, "registry/source/components/dialog");
    const fixtureDirectory = resolve(root, "registry/source/components/dialog");
    mkdirSync(fixtureDirectory, { recursive: true });
    for (const file of readdirSync(sourceDirectory)) {
      writeFileSync(
        resolve(fixtureDirectory, file),
        readFileSync(resolve(sourceDirectory, file), "utf8"),
        "utf8",
      );
    }
    const dialogs = discoverCanonicalSourceDescriptors(root).filter(
      ({ descriptor }) => descriptor.id === "dialog",
    );
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toMatchObject({
      descriptorPath: "registry/source/components/dialog/dialog.source.json",
      descriptor: {
        apiPath: "registry/source/components/dialog/dialog.api.json",
        contractPath: "registry/source/components/dialog/dialog.contract.json",
        entryPath: "registry/source/components/dialog/index.ts",
        itemDependencies: ["layer-manager", "provider"],
        metadataPath: "registry/source/components/dialog/dialog.metadata.json",
        storyPath: "registry/source/components/dialog/dialog.stories.json",
      },
    });
    expect(dialogs[0]!.descriptor.runtimeFiles).toContain(
      "registry/source/components/dialog/model.ts",
    );
    expect(dialogs[0]!.descriptor.publicExports).toContain("Dialog");
    expect(dialogs[0]!.descriptor.publicExports).toContain("DialogModality");
  });

  it("discovers complete manifests deterministically with entry-scoped import declarations", () => {
    const root = temporaryWorkspace();
    const directory = resolve(root, "registry/source/components/demo");
    mkdirSync(directory, { recursive: true });
    const files: Record<string, string> = {
      "demo.source.json": `${JSON.stringify({
        declaredImports: ["./demo.css"],
        entryPath: "registry/source/components/demo/demo.tsx",
        id: "demo",
        itemDependencies: [],
        outputRole: "component",
      })}\n`,
      "demo.tsx":
        'import "./demo.css";\nexport interface DemoOptions { readonly enabled: boolean; }\nexport function Demo() { return null; }\nexport async function loadDemo() { return Demo; }\n',
      "index.ts": 'export { Demo } from "./demo.js";\n',
      "demo.css": ".demo { display: block; }\n",
      "demo-css.d.ts": 'declare module "*.css";\n',
      "demo.metadata.json": "{}\n",
      "demo.contract.json": "{}\n",
      "demo.stories.json": "{}\n",
      "demo.api.json": `${JSON.stringify({
        schemaVersion: 1,
        itemId: "demo",
        entryExport: "Demo",
        exports: [
          { kind: "component", name: "Demo" },
          { kind: "type", name: "DemoOptions" },
          { kind: "function", name: "loadDemo" },
        ],
      })}\n`,
      "README.md": "# Demo\n",
    };
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(resolve(directory, name), content, "utf8");
    }

    const first = discoverCanonicalSourceDescriptors(root);
    const second = discoverCanonicalSourceDescriptors(root);
    expect(second).toEqual(first);
    expect(first).toHaveLength(1);
    expect(first[0]?.descriptor).toMatchObject({
      id: "demo",
      declaredImports: ["./demo.css", "./demo.js"],
      runtimeDependencies: [],
      publicExports: ["Demo", "DemoOptions", "loadDemo"],
    });

    writeFileSync(
      resolve(directory, "demo.api.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        itemId: "demo",
        entryExport: "Demo",
        exports: [{ kind: "component", name: "Demo" }],
      })}\n`,
      "utf8",
    );
    expect(() => discoverCanonicalSourceDescriptors(root)).toThrow(
      /API companion .* export drift/u,
    );

    writeFileSync(resolve(directory, "demo.api.json"), files["demo.api.json"]!, "utf8");

    const wrongKind = JSON.parse(files["demo.api.json"]!) as {
      exports: { kind: string; name: string }[];
    };
    wrongKind.exports.find(({ name }) => name === "DemoOptions")!.kind = "component";
    writeFileSync(resolve(directory, "demo.api.json"), `${JSON.stringify(wrongKind)}\n`, "utf8");
    expect(() => discoverCanonicalSourceDescriptors(root)).toThrow(
      /must classify type-only export "DemoOptions" as a type/u,
    );

    writeFileSync(resolve(directory, "demo.api.json"), files["demo.api.json"]!, "utf8");

    writeFileSync(
      resolve(directory, "demo.source.json"),
      `${JSON.stringify({
        declaredImports: [],
        entryPath: "registry/source/components/demo/demo.tsx",
        id: "demo",
        itemDependencies: [],
        outputRole: "component",
      })}\n`,
      "utf8",
    );
    expect(() => discoverCanonicalSourceDescriptors(root)).toThrow(
      /entry import declaration drift/u,
    );

    writeFileSync(resolve(directory, "demo.source.json"), files["demo.source.json"]!, "utf8");
    writeFileSync(
      resolve(directory, "demo.tsx"),
      `${files["demo.tsx"]!}export default Demo;\n`,
      "utf8",
    );
    expect(() => discoverCanonicalSourceDescriptors(root)).toThrow(/must use named exports/u);
  });

  it("requires cross-item relative imports to name their source dependency", () => {
    const ownPath = "registry/source/components/alpha/alpha.ts";
    const dependencyPath = "registry/source/components/beta/beta.ts";
    const owners = new Map([
      [ownPath, "alpha"],
      [dependencyPath, "beta"],
    ]);
    const contents = new Map([[ownPath, 'export { Beta } from "../beta/beta.js";\n']]);
    const descriptor = {
      id: "alpha",
      declaredImports: ["../beta/beta.js"],
      runtimeDependencies: [] as readonly string[],
      runtimeFiles: [ownPath],
    };
    expect(() => assertCanonicalSourceImports(descriptor, contents, owners)).toThrow(
      /without declaring it as an item dependency/u,
    );
    expect(() =>
      assertCanonicalSourceImports({ ...descriptor, itemDependencies: ["beta"] }, contents, owners),
    ).not.toThrow();
  });

  it("uses stable recursive key ordering and Unicode normalization", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: "cafe\u0301" } })).toBe(
      '{"a":{"x":"caf\u00e9","y":2},"z":1}',
    );
  });

  it("rejects unsafe, absolute, traversal, reserved, and non-normalized paths", () => {
    const attacks = [
      "registry/generated/../outside.json",
      "registry/generated/%2e%2e/outside.json",
      "registry\\generated\\outside.json",
      "C:/workspace/registry/generated/outside.json",
      "/workspace/registry/generated/outside.json",
      "registry/generated/CON.json",
      "registry/generated/cafe\u0301.json",
      "other/generated/outside.json",
    ];
    attacks.forEach((path) => expect(() => assertPortableGeneratedPath(path)).toThrow());
    expect(() =>
      assertPortableGeneratedPath("packages/ui/src/generated/button/button.tsx"),
    ).not.toThrow();
    expect(() =>
      assertPortableGeneratedPath("packages/cli/src/generated-public-package-map.ts"),
    ).not.toThrow();
    expect(() => assertPortableGeneratedPath("packages/ui/tsconfig.json")).toThrow();
  });

  it("rejects case/Unicode collisions in generated and canonical source plans", () => {
    const root = temporaryWorkspace();
    expect(() =>
      syncGeneratedFiles(
        root,
        [
          { path: "registry/generated/a.json", content: "{}\n" },
          { path: "registry/generated/A.json", content: "{}\n" },
        ],
        "check",
      ),
    ).toThrow(/collides/u);

    expect(() =>
      buildSourceTransformPlan(
        [
          { id: "button", layer: "component", implementationStatus: "unimplemented" },
          { id: "dialog", layer: "component", implementationStatus: "unimplemented" },
        ],
        [
          testSource("button", "registry/source/ui/button.tsx"),
          testSource("dialog", "registry/source/ui/Button.tsx"),
        ],
      ),
    ).toThrow(/collides/u);
  });

  it("rejects traversal, unresolved item dependencies, and item cycles", () => {
    expect(() => assertPortableSourcePath("registry/source/ui/../../secrets.ts")).toThrow();
    expect(() => assertPortableSourcePath("C:/source/button.tsx")).toThrow();
    expect(() => assertPortableSourcePath("registry/source/ui/button.tsx")).not.toThrow();

    const definitions = [
      { id: "button", layer: "component", implementationStatus: "unimplemented" },
      { id: "dialog", layer: "component", implementationStatus: "unimplemented" },
    ] as const;
    expect(() =>
      buildSourceTransformPlan(definitions, [testSource("button", undefined, ["missing-item"])]),
    ).toThrow(/unknown item/u);
    expect(() =>
      buildSourceTransformPlan(definitions, [
        testSource("button", undefined, ["dialog"]),
        testSource("dialog", undefined, ["button"]),
      ]),
    ).toThrow(/cycle/u);
  });

  it("rejects undeclared packages, unresolved aliases/local files, dynamic imports, and file cycles", () => {
    const base = {
      id: "demo",
      declaredImports: ["left-pad"],
      runtimeDependencies: [] as readonly string[],
      runtimeFiles: ["registry/source/components/demo/demo.ts"],
    };
    expect(() =>
      assertCanonicalSourceImports(
        base,
        new Map([[base.runtimeFiles[0]!, 'import "left-pad";\n']]),
      ),
    ).toThrow(/undeclared package/u);

    expect(() =>
      assertCanonicalSourceImports(
        { ...base, declaredImports: ["@mergora-internal/missing"] },
        new Map([[base.runtimeFiles[0]!, 'import "@mergora-internal/missing";\n']]),
      ),
    ).toThrow(/unresolved internal alias/u);

    expect(() =>
      assertCanonicalSourceImports(
        { ...base, declaredImports: ["./missing.js"] },
        new Map([[base.runtimeFiles[0]!, 'import "./missing.js";\n']]),
      ),
    ).toThrow(/unresolved local import/u);

    expect(() =>
      assertCanonicalSourceImports(
        { ...base, declaredImports: [] },
        new Map([[base.runtimeFiles[0]!, 'void import("left-pad");\n']]),
      ),
    ).toThrow(/Dynamic import/u);

    const cyclicFiles = [
      "registry/source/components/demo/a.ts",
      "registry/source/components/demo/b.ts",
    ];
    expect(() =>
      assertCanonicalSourceImports(
        {
          id: "demo",
          declaredImports: ["./a.js", "./b.js"],
          runtimeDependencies: [],
          runtimeFiles: cyclicFiles,
        },
        new Map([
          [cyclicFiles[0]!, 'import "./b.js";\n'],
          [cyclicFiles[1]!, 'import "./a.js";\n'],
        ]),
      ),
    ).toThrow(/file import cycle/u);
  });

  it("fails closed on release, evidence, maturity, implementation, or secret claims", () => {
    expect(() => assertHonestGeneratedArtifact({ releaseCommit: "f".repeat(40) })).toThrow();
    expect(() => assertHonestGeneratedArtifact({ state: "pass" })).toThrow();
    expect(() => assertHonestGeneratedArtifact({ maturity: "stable" })).toThrow();
    expect(() => assertHonestGeneratedArtifact({ implementationStatus: "implemented" })).toThrow();
    expect(() =>
      assertHonestGeneratedArtifact({ implementationStatus: "source-present-unreleased" }),
    ).not.toThrow();
    expect(() => assertHonestGeneratedArtifact({ authToken: "secret" })).toThrow();
    expect(() => assertHonestGeneratedArtifact({ state: "\uff50\uff41\uff53\uff53" })).toThrow();
    expect(() =>
      assertHonestGeneratedArtifact({ "\uff44\uff49\uff47\uff45\uff53\uff54": "synthetic" }),
    ).toThrow();
  });
});
