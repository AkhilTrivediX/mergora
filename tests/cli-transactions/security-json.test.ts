import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyInit,
  applySourceAdd,
  canonicalJson,
  executeTransaction,
  planSourceAdd,
  sha256,
} from "../../packages/cli/src/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

function fixture() {
  const project = createProjectFixture();
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root });
  return project;
}

function transactionIds(root: string): readonly string[] {
  const directory = resolve(root, ".mergora/transactions");
  return existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map(({ name }) => name)
        .sort((left, right) => left.localeCompare(right, "en-US"))
    : [];
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("canonical JSON and private runtime data", () => {
  it("uses strict compact RFC 8785-compatible JSON bytes", () => {
    expect(canonicalJson({ z: 1, a: { y: -0, x: "café" }, array: [true, null] })).toBe(
      '{"a":{"x":"café","y":0},"array":[true,null],"z":1}',
    );
    expect(canonicalJson({ value: Number("333333333.33333329") })).toBe(
      '{"value":333333333.3333333}',
    );
    expect(() => canonicalJson({ missing: undefined })).toThrow(/unsupported undefined/u);
    expect(() => canonicalJson({ invalid: Number.NaN })).toThrow(/finite/u);
    const sparse = Array.from({ length: 2 }) as unknown[];
    sparse[1] = "value";
    delete sparse[0];
    expect(() => canonicalJson(sparse)).toThrow(/hole/u);
    expect(() => canonicalJson({ invalid: "\ud800" })).toThrow(/lone surrogate/u);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cyclic/u);
  });

  it("hashes semantic manifest data with JCS while keeping a deterministic pretty file", () => {
    const project = fixture();
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
    const plan = planSourceAdd({
      projectRoot: project.root,
      itemIds: ["button"],
      registryDirectory,
    });
    expect(plan.manifestPreconditionDigest).toBe(sha256(canonicalJson(manifest)));
    expect(readFileSync(manifestPath, "utf8")).toMatch(/^\{\n {2}"\$schema"/u);
  });

  it("stores no absolute root, secret, query, environment value, PID, or timestamp in provenance", () => {
    const project = fixture();
    const secret = "mergora-super-secret-value";
    const query = "private-query-value";
    const options = {
      projectRoot: project.root,
      itemIds: ["button"],
      registryDirectory,
      commandArguments: [
        "add",
        "button",
        "--cwd",
        project.root,
        `--token=${secret}`,
        `https://example.invalid/item?token=${query}`,
        process.env.PATH ?? "environment-value",
      ],
    };
    const result = applySourceAdd(options, planSourceAdd(options).planDigest);
    const id = result.transaction.transactionId!;
    const recordText = readFileSync(
      resolve(project.root, ".mergora/transactions", id, "transaction.json"),
      "utf8",
    );
    const record = JSON.parse(recordText) as {
      command: { redactedArguments: readonly string[] };
    };
    const manifestText = readFileSync(resolve(project.root, ".mergora/manifest.json"), "utf8");
    expect(recordText).not.toContain(project.root);
    expect(recordText).not.toContain(secret);
    expect(recordText).not.toContain(query);
    expect(recordText).not.toContain(process.env.PATH ?? "environment-value");
    expect(record.command.redactedArguments).toEqual([
      "<argument>",
      "<argument>",
      "--<redacted>",
      "<argument>",
      "--<redacted>",
      "<argument>",
      "<argument>",
    ]);
    expect(manifestText).not.toContain(project.root);
    expect(manifestText).not.toMatch(/"(?:pid|startedAt|recordedAt|generatedAt|timestamp)"/u);
    expect(manifestText).not.toContain("?");
  });
});

describe("transaction security boundaries", () => {
  it("uses an exclusive lock and never breaks an unclassified lock implicitly", () => {
    const project = fixture();
    const transactionsBefore = transactionIds(project.root);
    const lockPath = resolve(project.root, ".mergora/.lock");
    const lock = '{"schemaVersion":1,"transactionId":"foreign","pid":1}\n';
    writeFileSync(lockPath, lock);
    const options = { projectRoot: project.root, itemIds: ["button"], registryDirectory };
    const plan = planSourceAdd(options);
    expect(() => applySourceAdd(options, plan.planDigest)).toThrow(/holds the project lock/u);
    expect(readFileSync(lockPath, "utf8")).toBe(lock);
    expect(transactionIds(project.root)).toEqual(transactionsBefore);
  });

  it("rejects registry traversal, Windows device targets, portable collisions, and URL secrets", () => {
    const maliciousRoot = mkdtempSync(resolve(tmpdir(), "mergora-malicious-registry-"));
    temporaryDirectories.push(maliciousRoot);
    const items = resolve(maliciousRoot, "items");
    mkdirSync(items);
    const payload = JSON.parse(
      readFileSync(resolve(registryDirectory, "native-source-items/button.json"), "utf8"),
    ) as { files: Array<{ targetPath: string }> };
    payload.files[0]!.targetPath = "../outside.ts";
    writeFileSync(resolve(items, "button.json"), JSON.stringify(payload));
    const maliciousProject = fixture();
    expect(() =>
      planSourceAdd({
        projectRoot: maliciousProject.root,
        itemIds: ["button"],
        registryDirectory: maliciousRoot,
      }),
    ).toThrow(/portable|unsafe|path segment/u);
    expect(existsSync(resolve(maliciousProject.root, "outside.ts"))).toBe(false);

    expect(() =>
      planSourceAdd({
        projectRoot: maliciousProject.root,
        itemIds: ["button"],
        registryDirectory,
        targetDirectory: "src/CON",
      }),
    ).toThrow(/unsafe path segment/u);

    expect(() =>
      planSourceAdd({
        projectRoot: maliciousProject.root,
        itemIds: ["button"],
        registryDirectory,
        targetDirectory: ".mergora/transactions",
      }),
    ).toThrow(/transaction\/provenance data/u);

    const plan = planSourceAdd({
      projectRoot: maliciousProject.root,
      itemIds: ["button"],
      registryDirectory,
    });
    expect(() =>
      executeTransaction({
        root: maliciousProject.root,
        plan,
        mutations: [
          { target: "src/Case.ts", content: Buffer.from("a"), beforeDigest: null },
          { target: "src/case.ts", content: Buffer.from("b"), beforeDigest: null },
        ],
      }),
    ).toThrow(/repeats portable target/u);
    expect(() =>
      executeTransaction({
        root: maliciousProject.root,
        plan,
        mutations: [],
        registryPayloads: [
          {
            registry: "official",
            release: "1.0.0",
            url: "https://example.invalid/item.json?token=secret",
            digest: `sha256:${"a".repeat(64)}`,
          },
        ],
      }),
    ).toThrow(/without credentials, query parameters, or fragments/u);
  });

  it("refuses a source-parent junction introduced after planning without writing through it", () => {
    const project = fixture();
    const transactionsBefore = transactionIds(project.root);
    const outside = resolve(project.root, "outside-target");
    const junction = resolve(project.root, "src/components");
    mkdirSync(outside);
    const options = { projectRoot: project.root, itemIds: ["button"], registryDirectory };
    const plan = planSourceAdd(options);
    symlinkSync(outside, junction, process.platform === "win32" ? "junction" : "dir");
    try {
      expect(() => applySourceAdd(options, plan.planDigest)).toThrow(/symbolic link|unsafe/u);
      expect(existsSync(resolve(outside, "mergora/button/button.tsx"))).toBe(false);
      expect(transactionIds(project.root)).toEqual(transactionsBefore);
    } finally {
      unlinkSync(junction);
    }
  });

  it("rejects duplicate dependency objects before creating a transaction", () => {
    const project = fixture();
    const transactionsBefore = transactionIds(project.root);
    writeFileSync(
      resolve(project.root, "package.json"),
      `{
  "name": "duplicate",
  "packageManager": "pnpm@11.14.0",
  "dependencies": { "next": "16.2.10", "react": "19.2.7", "tailwindcss": "4.3.3" },
  "dependencies": { "next": "16.2.10", "react": "19.2.7", "tailwindcss": "4.3.3" }
}\n`,
    );
    expect(() =>
      planSourceAdd({
        projectRoot: project.root,
        itemIds: ["dialog"],
        registryDirectory,
      }),
    ).toThrow(/repeats top-level field/u);
    expect(transactionIds(project.root)).toEqual(transactionsBefore);
  });
});
