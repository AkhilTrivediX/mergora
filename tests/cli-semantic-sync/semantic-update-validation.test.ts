import { readFileSync, readdirSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyInit, applySourceAdd, planSourceAdd } from "../../packages/cli/src/index.ts";
import {
  applySemanticUpdate,
  immutableUpdateItemDigest,
  immutableUpdateRegistryIdentityDigest,
  immutableUpdateReleaseDigest,
  planSemanticUpdate,
  type ImmutableUpdateFile,
  type ImmutableUpdateItem,
  type ImmutableUpdateRegistry,
  type ImmutableUpdateRelease,
} from "../../packages/cli/src/semantic-update.ts";
import { basePath, type ProvenanceManifest } from "../../packages/cli/src/source-operations.ts";
import { sha256 } from "../../packages/cli/src/contracts.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

type MutableRemoteFile = {
  -readonly [Key in keyof ImmutableUpdateFile]: ImmutableUpdateFile[Key];
};

function fixture() {
  const project = createProjectFixture({ directoryPrefix: "mergora-semantic-validator-" });
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root });
  const add = {
    projectRoot: project.root,
    itemIds: ["button"],
    registryDirectory,
    noInstall: true,
  };
  applySourceAdd(add, planSourceAdd(add).planDigest);
  return project;
}

function manifest(root: string): ProvenanceManifest {
  return JSON.parse(
    readFileSync(resolve(root, ".mergora/manifest.json"), "utf8"),
  ) as ProvenanceManifest;
}

function releaseFor(
  root: string,
  mutate: (files: MutableRemoteFile[]) => void,
): ImmutableUpdateRelease {
  const installed = manifest(root).items["official:button"]!;
  const files: MutableRemoteFile[] = installed.files.map((file) => {
    const bytes = readFileSync(resolve(root, basePath(file.base)));
    const binary = !(file.mediaType.startsWith("text/") || file.mediaType.includes("json"));
    return {
      logicalPath: file.logicalPath,
      role: file.role,
      mediaType: file.mediaType,
      encoding: binary ? "base64" : "utf8",
      content: bytes.toString(binary ? "base64" : "utf8"),
      digest: sha256(bytes),
      executable: false,
    };
  });
  mutate(files);
  for (const file of files) {
    file.digest = sha256(Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8"));
  }
  const itemWithoutDigest: Omit<ImmutableUpdateItem, "payloadDigest"> = {
    itemId: "button",
    kind: installed.kind,
    resolved: "0.0.1",
    payloadUrl: "https://fixture.invalid/releases/0.0.1/items/button.json",
    renderedWithTransformContextDigest: installed.transformContextDigest,
    files,
    registryDependencies: installed.registryDependencies,
    dependencies: installed.dependencies,
    contractVersion: "0.0.1",
    lastMigration: null,
  };
  const item: ImmutableUpdateItem = {
    ...itemWithoutDigest,
    payloadDigest: immutableUpdateItemDigest(itemWithoutDigest),
  };
  const identity = {
    id: "official",
    protocol: "mergora-v1" as const,
    origin: "https://fixture.invalid/registry/v1",
    trust: "local-development" as const,
  };
  const registry: ImmutableUpdateRegistry = {
    ...identity,
    identityDigest: immutableUpdateRegistryIdentityDigest(identity),
    source: "verified-cache",
    evidenceTier: "not-supplied",
  };
  const releaseWithoutDigest: Omit<ImmutableUpdateRelease, "manifestDigest"> = {
    schemaVersion: 1,
    registry,
    release: "0.0.1",
    items: [item],
  };
  return {
    ...releaseWithoutDigest,
    manifestDigest: immutableUpdateReleaseDigest(releaseWithoutDigest),
  };
}

function mutateFile(
  files: MutableRemoteFile[],
  suffix: string,
  mutate: (text: string) => string,
): void {
  const file = files.find(({ logicalPath }) => logicalPath.endsWith(suffix));
  if (file === undefined || file.encoding !== "utf8") throw new Error(`Missing ${suffix} fixture.`);
  file.content = mutate(file.content);
}

function inventoryWithoutTransactions(root: string): Readonly<Record<string, string>> {
  const output: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const key = relative(root, path).replaceAll("\\", "/");
      if (key === ".mergora/transactions" || key.startsWith(".mergora/transactions/")) continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) output[key] = sha256(readFileSync(path));
    }
  };
  visit(root);
  return output;
}

function transactionIds(root: string): readonly string[] {
  return readdirSync(resolve(root, ".mergora/transactions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name)
    .sort();
}

function transactionRecord(
  root: string,
  id: string,
): {
  readonly state: string;
  readonly validations: readonly { readonly id: string; readonly state: string }[];
} {
  return JSON.parse(
    readFileSync(resolve(root, ".mergora/transactions", id, "transaction.json"), "utf8"),
  ) as ReturnType<typeof transactionRecord>;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Semantic Update transaction validation", () => {
  it("derives assurance labels from callbacks and executes every callback in both views", async () => {
    const project = fixture();
    const release = releaseFor(project.root, (files) => {
      mutateFile(files, "button-css.d.ts", (text) => `${text}declare module "*.validator";\n`);
    });
    const options = { projectRoot: project.root, release, noInstall: true };
    const plan = planSemanticUpdate(options);

    expect(plan.validationSuite).toEqual([
      "schema",
      "digest",
      "path",
      "collision",
      "parse",
      "type-imports",
      "ownership",
      "dependency",
      "tokens",
      "accessibility-contract",
      "project-configured",
    ]);
    const result = await applySemanticUpdate(options, plan.planDigest);
    expect(result.status).toBe("committed");
    if (result.status !== "committed") throw new Error("Expected a committed semantic update.");
    const id = result.transaction.transactionId!;
    const record = transactionRecord(project.root, id);
    const semanticValidations = record.validations
      .filter(
        ({ id: validationId }) =>
          validationId.startsWith("staged-overlay-semantic-") ||
          validationId.startsWith("post-commit-semantic-"),
      )
      .map(({ id: validationId, state }) => ({ id: validationId, state }));
    expect(semanticValidations).toEqual([
      { id: "staged-overlay-semantic-contract-integrity", state: "pass" },
      { id: "staged-overlay-semantic-media-parse", state: "pass" },
      { id: "staged-overlay-semantic-project-config", state: "pass" },
      { id: "staged-overlay-semantic-token-integrity", state: "pass" },
      { id: "staged-overlay-semantic-type-imports", state: "pass" },
      { id: "post-commit-semantic-contract-integrity", state: "pass" },
      { id: "post-commit-semantic-media-parse", state: "pass" },
      { id: "post-commit-semantic-project-config", state: "pass" },
      { id: "post-commit-semantic-token-integrity", state: "pass" },
      { id: "post-commit-semantic-type-imports", state: "pass" },
    ]);
  });

  it("rejects a new self-contained TypeScript type error before authoritative writes", async () => {
    const project = fixture();
    const release = releaseFor(project.root, (files) => {
      mutateFile(
        files,
        "button-state.ts",
        (text) => `${text}\nconst semanticValidatorTypeError: number = "not-a-number";\n`,
      );
    });
    const before = inventoryWithoutTransactions(project.root);
    const previousIds = new Set(transactionIds(project.root));
    const options = { projectRoot: project.root, release, noInstall: true };
    const plan = planSemanticUpdate(options);

    await expect(applySemanticUpdate(options, plan.planDigest)).rejects.toMatchObject({
      code: "TRANSACTION_STAGED_VALIDATION_FAILED",
    });
    expect(inventoryWithoutTransactions(project.root)).toEqual(before);
    const [failedId] = transactionIds(project.root).filter((id) => !previousIds.has(id));
    const record = transactionRecord(project.root, failedId!);
    expect(record.state).toBe("rolled-back");
    expect(record.validations).toContainEqual({
      id: "staged-overlay-semantic-type-imports",
      state: "fail",
      summary: expect.any(String),
    });
    expect(record.validations.some(({ id }) => id.startsWith("post-commit-"))).toBe(false);
  });

  it("rejects a newly missing local import before authoritative writes", async () => {
    const project = fixture();
    const release = releaseFor(project.root, (files) => {
      mutateFile(
        files,
        "button-state.ts",
        (text) => `import "./missing-semantic-validator";\n${text}`,
      );
    });
    const before = inventoryWithoutTransactions(project.root);
    const options = { projectRoot: project.root, release, noInstall: true };
    const plan = planSemanticUpdate(options);

    await expect(applySemanticUpdate(options, plan.planDigest)).rejects.toMatchObject({
      code: "TRANSACTION_STAGED_VALIDATION_FAILED",
      target: expect.stringMatching(/button-state\.ts$/u),
    });
    expect(inventoryWithoutTransactions(project.root)).toEqual(before);
  });

  it("rejects a malformed CSS token reference in the staged overlay", async () => {
    const project = fixture();
    const release = releaseFor(project.root, (files) => {
      mutateFile(
        files,
        "button.css",
        (text) => `${text}\n.mrg-token-validator { color: var(); }\n`,
      );
    });
    const before = inventoryWithoutTransactions(project.root);
    const previousIds = new Set(transactionIds(project.root));
    const options = { projectRoot: project.root, release, noInstall: true };
    const plan = planSemanticUpdate(options);

    await expect(applySemanticUpdate(options, plan.planDigest)).rejects.toMatchObject({
      code: "TRANSACTION_STAGED_VALIDATION_FAILED",
    });
    expect(inventoryWithoutTransactions(project.root)).toEqual(before);
    const [failedId] = transactionIds(project.root).filter((id) => !previousIds.has(id));
    expect(transactionRecord(project.root, failedId!).validations).toContainEqual({
      id: "staged-overlay-semantic-token-integrity",
      state: "fail",
      summary: expect.any(String),
    });
  });
});
