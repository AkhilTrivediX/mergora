import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyInit, planInit } from "../../packages/cli/src/configuration.ts";
import { CliError } from "../../packages/cli/src/contracts.ts";
import { applySourceAdd, planSourceAdd } from "../../packages/cli/src/source-operations.ts";
import {
  applyVendor,
  planVendor,
  verifyVendor,
  type VendorOptions,
} from "../../packages/cli/src/vendor.ts";
import { validateSchemaDocument } from "../../registry/schemas/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const schemaDirectory = resolve(workspaceRoot, "registry/schemas");
const temporaryDirectories: string[] = [];

interface ManifestFile {
  readonly logicalPath: string;
  readonly base: `sha256:${string}`;
}

interface ManifestItem {
  readonly payload: { readonly digest: `sha256:${string}` };
  readonly contractVersion: string;
  readonly files: readonly ManifestFile[];
}

interface FixtureResult {
  readonly root: string;
  readonly options: VendorOptions;
}

function fixture(itemIds: readonly string[] = ["button"]): FixtureResult {
  const project = createProjectFixture();
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
  const addOptions = { projectRoot: project.root, itemIds, registryDirectory };
  applySourceAdd(addOptions, planSourceAdd(addOptions).planDigest);
  return {
    root: project.root,
    options: {
      projectRoot: project.root,
      itemIds: [itemIds.at(-1)!],
      registryDirectory,
      schemaDirectory,
    },
  };
}

function jsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function manifestItem(root: string, id: string): ManifestItem {
  const manifest = jsonFile(resolve(root, ".mergora/manifest.json")) as {
    readonly items: Readonly<Record<string, ManifestItem>>;
  };
  return manifest.items[id]!;
}

function bundleFileSnapshot(
  root: string,
): Readonly<Record<string, { bytes: string; mtime: number }>> {
  const vendorRoot = resolve(root, ".mergora/vendor/v1");
  const result: Record<string, { bytes: string; mtime: number }> = {};
  const walk = (directory: string, prefix = ""): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path, relative);
      else {
        result[relative] = {
          bytes: readFileSync(path).toString("base64"),
          mtime: statSync(path).mtimeMs,
        };
      }
    }
  };
  walk(vendorRoot);
  return result;
}

function transactionCount(root: string): number {
  const directory = resolve(root, ".mergora/transactions");
  return existsSync(directory) ? readdirSync(directory).length : 0;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("offline vendoring", () => {
  it("keeps source execution independent from the mutable shared dist registry", () => {
    const source = readFileSync(resolve(workspaceRoot, "packages/cli/src/vendor.ts"), "utf8");
    expect(source).not.toContain('resolve(moduleDirectory, "../dist/registry")');
    expect(source).toContain('resolve(moduleDirectory, "../../../registry/generated")');
  });

  it("plans an explicit transitive graph deterministically without claiming a release", () => {
    const project = fixture(["provider"]);
    const first = planVendor(project.options);
    const second = planVendor(project.options);

    expect(second).toEqual(first);
    expect(validateSchemaDocument("operation-plan", first).errors).toEqual([]);
    expect(Object.keys(first)).not.toContain("vendor");
    expect(first.command).toBe("vendor");
    expect(first.registries).toEqual([]);
    expect(first.items.map(({ id }) => id)).toEqual([
      "official:direction",
      "official:slot",
      "official:provider",
    ]);
    expect(first.warnings.join(" ")).toContain("not an official release mirror");
    expect(
      first.fileOperations.filter(({ operation }) => operation !== "no-op").at(-1)?.target,
    ).toBe(".mergora/vendor/v1/vendor-manifest.json");
  });

  it("requires the reviewed digest and commits a canonical manifest last", () => {
    const project = fixture();
    const plan = planVendor(project.options);

    expect(() => applyVendor(project.options, "sha256:stale")).toThrowError(
      expect.objectContaining({ code: "PLAN_PRECONDITION_STALE" }),
    );
    expect(existsSync(resolve(project.root, ".mergora/vendor"))).toBe(false);

    const result = applyVendor(project.options, plan.planDigest);
    expect(result.transaction.state).toBe("committed");
    expect(result.verification).toMatchObject({
      state: "valid",
      provenanceState: "unreleased-local",
      releaseClaim: "none",
      networkUsed: false,
      writePerformed: false,
    });

    const vendorRoot = resolve(project.root, ".mergora/vendor/v1");
    const raw = readFileSync(resolve(vendorRoot, "vendor-manifest.json"), "utf8");
    expect(raw).toBe(JSON.stringify(JSON.parse(raw)));
    expect(raw).not.toContain(project.root);
    const manifest = JSON.parse(raw) as {
      readonly provenance: {
        readonly state: string;
        readonly officialRelease: unknown;
        readonly releaseManifest: unknown;
      };
      readonly passports: readonly unknown[];
      readonly omissions: { readonly passports: readonly string[] };
    };
    expect(manifest.provenance).toMatchObject({
      state: "unreleased-local",
      officialRelease: null,
      releaseManifest: null,
    });
    expect(manifest.passports).toEqual([]);
    expect(manifest.omissions.passports).toEqual(["official:button"]);

    const sums = readFileSync(resolve(vendorRoot, "SHA256SUMS"), "utf8");
    expect(sums).not.toContain("vendor-manifest.json");
    expect(sums).not.toContain("SHA256SUMS");
  });

  it("reruns as a deterministic no-op without creating a transaction", () => {
    const project = fixture();
    const initial = planVendor(project.options);
    applyVendor(project.options, initial.planDigest);
    const beforeTransactions = transactionCount(project.root);

    const firstRerun = planVendor(project.options);
    const secondRerun = planVendor(project.options);
    expect(secondRerun).toEqual(firstRerun);
    expect(firstRerun.fileOperations.every(({ operation }) => operation === "no-op")).toBe(true);

    const result = applyVendor(project.options, firstRerun.planDigest);
    expect(result.transaction.state).toBe("no-op");
    expect(result.transaction.transactionId).toBeNull();
    expect(transactionCount(project.root)).toBe(beforeTransactions);
  });

  it("vendors every installed item when --all-installed is selected", () => {
    const project = fixture(["provider"]);
    const options: VendorOptions = {
      ...project.options,
      itemIds: undefined,
      allInstalled: true,
    };
    const plan = planVendor(options);
    const result = applyVendor(options, plan.planDigest);

    expect(result.items).toEqual(["official:direction", "official:slot", "official:provider"]);
    expect(result.verification.items).toEqual(result.items);
    const graph = jsonFile(resolve(project.root, ".mergora/vendor/v1/dependency-graph.json")) as {
      readonly nodes: readonly { readonly id: string; readonly dependencies: readonly string[] }[];
    };
    expect(graph.nodes.at(-1)).toEqual({
      id: "official:provider",
      installedDirect: true,
      selectedDirect: true,
      dependencies: ["official:direction", "official:slot"],
    });
  });

  it("includes only an exact installed executable Contract snapshot", () => {
    const project = fixture();
    const installed = manifestItem(project.root, "official:button");
    const target = resolve(project.root, ".mergora/contracts/official--button.json");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          contractVersion: installed.contractVersion,
          contractId: "button-static",
          registryId: "official",
          itemId: "button",
          payloadDigest: installed.payload.digest,
          conformanceClaim: "automated-evidence-only",
          limitations: ["This unreleased snapshot supplies static automated evidence only."],
          assertions: [
            {
              id: "source-exists",
              mode: "static",
              evidenceType: "static-source",
              target: { kind: "owned-file", logicalPath: installed.files[0]!.logicalPath },
              expectedBehavior: "The installed source target exists.",
              severity: "S1",
              remediationUrl: "https://mergora.vercel.app/components/button/",
              adapter: { kind: "file-exists", version: "1.0.0" },
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const plan = planVendor(project.options);
    applyVendor(project.options, plan.planDigest);
    const manifest = jsonFile(resolve(project.root, ".mergora/vendor/v1/vendor-manifest.json")) as {
      readonly contracts: readonly { readonly item: string }[];
      readonly omissions: { readonly contracts: readonly string[] };
    };
    expect(manifest.contracts).toEqual([
      expect.objectContaining({ item: "official:button", contractVersion: "1.0.0-unreleased" }),
    ]);
    expect(manifest.omissions.contracts).toEqual([]);
    expect(verifyVendor({ projectRoot: project.root }).state).toBe("valid");
  });

  it("verifies without network or writes and rejects one-byte tampering", () => {
    const project = fixture();
    const plan = planVendor(project.options);
    applyVendor(project.options, plan.planDigest);
    const before = bundleFileSnapshot(project.root);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network access attempted");
    }) as typeof fetch;
    try {
      const verification = verifyVendor({ projectRoot: project.root });
      expect(verification.networkUsed).toBe(false);
      expect(verification.writePerformed).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(bundleFileSnapshot(project.root)).toEqual(before);

    const payload = resolve(project.root, ".mergora/vendor/v1/items/official/button.json");
    writeFileSync(payload, Buffer.concat([readFileSync(payload), Buffer.from(" ")]));
    expect(() => verifyVendor({ projectRoot: project.root })).toThrowError(
      expect.objectContaining({ code: "VENDOR_DIGEST_MISMATCH" }),
    );
    expect(() => planVendor(project.options)).toThrowError(
      expect.objectContaining({ code: "VENDOR_DIGEST_MISMATCH" }),
    );
  });

  it("rejects missing immutable bases and partial pre-existing bundles before staging", () => {
    const missingBase = fixture();
    const installed = manifestItem(missingBase.root, "official:button");
    const digest = installed.files[0]!.base.slice("sha256:".length);
    rmSync(
      resolve(
        missingBase.root,
        `.mergora/bases/sha256/${digest.slice(0, 2)}/${digest.slice(2)}.blob`,
      ),
    );
    expect(() => planVendor(missingBase.options)).toThrowError(
      expect.objectContaining({ code: "VENDOR_INPUT_MISSING" }),
    );
    expect(existsSync(resolve(missingBase.root, ".mergora/vendor"))).toBe(false);

    const partial = fixture();
    const partialTarget = resolve(partial.root, ".mergora/vendor/v1/items/orphan.json");
    mkdirSync(dirname(partialTarget), { recursive: true });
    writeFileSync(partialTarget, "{}", "utf8");
    expect(() => planVendor(partial.options)).toThrowError(
      expect.objectContaining({ code: "VENDOR_TAMPERED" }),
    );
  });

  it("returns stable CLI errors for invalid selection combinations", () => {
    const project = fixture();
    expect(() =>
      planVendor({ ...project.options, allInstalled: true, itemIds: ["button"] }),
    ).toThrowError(expect.objectContaining({ code: "VENDOR_INVALID_OPTION" }));
    expect(() => planVendor({ ...project.options, itemIds: [] })).toThrowError(
      expect.objectContaining({ code: "VENDOR_INVALID_OPTION" }),
    );
    expect(() => planVendor({ ...project.options, itemIds: ["dialog"] })).toThrowError(
      expect.objectContaining({ code: "VENDOR_ITEM_MISSING" }),
    );
    try {
      planVendor({ ...project.options, itemIds: [] });
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
    }
  });
});
