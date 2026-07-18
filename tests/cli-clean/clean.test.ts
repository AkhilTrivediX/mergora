import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyInit, applySourceAdd, planSourceAdd } from "../../packages/cli/src/index.ts";
import { applyClean, planClean, type VerifiedCacheEntryV1 } from "../../packages/cli/src/clean.ts";
import { canonicalJson, sha256 } from "../../packages/cli/src/contracts.ts";
import { basePath, type ProvenanceManifest } from "../../packages/cli/src/source-operations.ts";
import { createProjectFixture, type ProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];
const linkedDirectories: string[] = [];

interface CleanFixture extends ProjectFixture {
  readonly initTransactionIds: readonly string[];
  readonly transactionId: string | null;
}

function transactionIds(root: string): readonly string[] {
  const directory = resolve(root, ".mergora/transactions");
  return existsSync(directory)
    ? readdirSync(directory).sort((left, right) => left.localeCompare(right, "en-US"))
    : [];
}

function transactionPaths(transactionIds: readonly string[]): readonly string[] {
  return transactionIds
    .map((transactionId) => `.mergora/transactions/${transactionId}`)
    .sort((left, right) => left.localeCompare(right, "en-US"));
}

function fixture(withSource = true): CleanFixture {
  const project = createProjectFixture({ directoryPrefix: "mergora-clean-" });
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root });
  const initTransactionIds = transactionIds(project.root);
  expect(initTransactionIds).toHaveLength(1);
  if (!withSource) return { ...project, initTransactionIds, transactionId: null };
  const options = {
    projectRoot: project.root,
    itemIds: ["button"],
    registryDirectory,
    noInstall: true,
  };
  const result = applySourceAdd(options, planSourceAdd(options).planDigest);
  expect(result.transaction.state).toBe("committed");
  expect(result.transaction.transactionId).toBeTypeOf("string");
  return { ...project, initTransactionIds, transactionId: result.transaction.transactionId! };
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function manifest(root: string): ProvenanceManifest {
  return json<ProvenanceManifest>(resolve(root, ".mergora/manifest.json"));
}

function cacheEntry(root: string, key: string, content = `artifact:${key}\n`): string {
  const directory = resolve(root, ".mergora/cache/entries", key);
  mkdirSync(directory, { recursive: true });
  const artifact = Buffer.from(content);
  const metadata: VerifiedCacheEntryV1 = {
    schemaVersion: 1,
    artifactKind: "mergora-verified-cache-entry",
    key,
    artifact: "artifact",
    digest: sha256(artifact),
    bytes: artifact.byteLength,
  };
  writeFileSync(resolve(directory, "artifact"), artifact);
  writeFileSync(resolve(directory, "cache-entry.json"), canonicalJson(metadata));
  return `.mergora/cache/entries/${key}`;
}

function immutableBase(
  root: string,
  content: string,
): { readonly digest: string; readonly path: string } {
  const bytes = Buffer.from(content);
  const digest = sha256(bytes);
  const path = basePath(digest);
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), bytes);
  return { digest, path };
}

function inventory(root: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name, "en-US"),
    )) {
      const path = resolve(directory, entry.name);
      const key = relative(root, path).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        result[`${key}/`] = "directory";
        visit(path);
      } else if (entry.isFile()) result[key] = sha256(readFileSync(path));
      else result[key] = "non-regular";
    }
  };
  visit(root);
  return result;
}

function protectedBytes(root: string): Readonly<Record<string, Buffer>> {
  const document = manifest(root);
  const targets = Object.values(document.items).flatMap((item) =>
    item.files.map(({ target }) => target),
  );
  const paths = [
    "package.json",
    "mergora.json",
    ".mergora/manifest.json",
    ".npmrc",
    ".mergora/vendor/fixture/credentials.json",
    ...targets,
  ];
  return Object.fromEntries(paths.map((path) => [path, readFileSync(resolve(root, path))]));
}

function assertProtectedBytes(root: string, expected: Readonly<Record<string, Buffer>>): void {
  for (const [path, bytes] of Object.entries(expected)) {
    expect(readFileSync(resolve(root, path)), path).toEqual(bytes);
  }
}

afterEach(() => {
  for (const link of linkedDirectories.splice(0).reverse()) {
    try {
      unlinkSync(link);
    } catch {
      // Never let fixture cleanup follow a test junction.
    }
  }
  for (const directory of temporaryDirectories.splice(0).reverse()) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("cleanup planning and exact apply", () => {
  it("is deterministic and byte-for-byte read-only without explicit category flags", () => {
    const project = fixture();
    const cached = cacheEntry(project.root, "registry-a");
    const unused = immutableBase(project.root, "unreferenced immutable base\n");
    const before = inventory(project.root);
    const options = { projectRoot: project.root, retainTransactions: 0 };

    const first = planClean(options);
    expect(planClean(options)).toEqual(first);
    expect(first.selectedCategories).toEqual([]);
    expect(first.selected).toEqual([]);
    expect(first.writesRequired).toBe(false);
    expect(first.candidates.cache.map(({ path }) => path)).toContain(cached);
    expect(first.candidates.bases.map(({ path }) => path)).toContain(unused.path);
    expect(
      first.candidates.transactions
        .map(({ path }) => path)
        .sort((left, right) => left.localeCompare(right, "en-US")),
    ).toEqual(transactionPaths([...project.initTransactionIds, project.transactionId!]));
    expect(inventory(project.root)).toEqual(before);

    expect(applyClean(options, first.planDigest)).toMatchObject({
      status: "no-op",
      deleted: [],
      journal: null,
      rollbackAvailable: false,
    });
    expect(inventory(project.root)).toEqual(before);
  });

  it("deletes only each explicitly selected category and never live, manifest, vendor, or credentials", () => {
    const project = fixture();
    const cached = cacheEntry(project.root, "registry-b");
    const unused = immutableBase(project.root, "second unreferenced immutable base\n");
    mkdirSync(resolve(project.root, ".mergora/vendor/fixture"), { recursive: true });
    writeFileSync(resolve(project.root, ".mergora/vendor/fixture/credentials.json"), "secret\n");
    writeFileSync(resolve(project.root, ".npmrc"), "//registry.invalid/:_authToken=secret\n");
    const protectedSnapshot = protectedBytes(project.root);

    const cacheOptions = {
      projectRoot: project.root,
      cache: true,
      retainTransactions: 0,
    };
    const cachePlan = planClean(cacheOptions);
    expect(cachePlan.selectedCategories).toEqual(["cache"]);
    expect(cachePlan.selected.every(({ category }) => category === "cache")).toBe(true);
    const cacheResult = applyClean(cacheOptions, cachePlan.planDigest);
    expect(cacheResult.deleted).toEqual([cached]);
    expect(cacheResult.journal).toMatch(/^\.mergora\/tmp\/clean-[a-f0-9]{64}\/journal\.ndjson$/u);
    expect(cacheResult.rollbackAvailable).toBe(false);
    expect(existsSync(resolve(project.root, cached))).toBe(false);
    expect(existsSync(resolve(project.root, unused.path))).toBe(true);
    expect(
      existsSync(resolve(project.root, `.mergora/transactions/${project.transactionId}`)),
    ).toBe(true);
    assertProtectedBytes(project.root, protectedSnapshot);

    const baseOptions = { projectRoot: project.root, bases: true, retainTransactions: 0 };
    const basePlan = planClean(baseOptions);
    expect(basePlan.selectedCategories).toEqual(["bases"]);
    expect(applyClean(baseOptions, basePlan.planDigest).deleted).toEqual([unused.path]);
    expect(existsSync(resolve(project.root, unused.path))).toBe(false);
    expect(
      existsSync(resolve(project.root, `.mergora/transactions/${project.transactionId}`)),
    ).toBe(true);
    assertProtectedBytes(project.root, protectedSnapshot);

    const transactionOptions = {
      projectRoot: project.root,
      transactions: true,
      retainTransactions: 0,
    };
    const transactionPlan = planClean(transactionOptions);
    expect(transactionPlan.selectedCategories).toEqual(["transactions"]);
    expect(
      [...applyClean(transactionOptions, transactionPlan.planDigest).deleted].sort((left, right) =>
        left.localeCompare(right, "en-US"),
      ),
    ).toEqual(transactionPaths([...project.initTransactionIds, project.transactionId!]));
    for (const transactionId of [...project.initTransactionIds, project.transactionId!]) {
      expect(existsSync(resolve(project.root, `.mergora/transactions/${transactionId}`))).toBe(
        false,
      );
    }
    assertProtectedBytes(project.root, protectedSnapshot);
  });

  it("never offers or removes a manifest-referenced immutable base", () => {
    const project = fixture();
    const referenced = new Set(
      Object.values(manifest(project.root).items).flatMap((item) =>
        item.files.map(({ base }) => basePath(base)),
      ),
    );
    const unused = immutableBase(project.root, "only this unreferenced base is collectible\n");
    const options = { projectRoot: project.root, bases: true };
    const plan = planClean(options);

    expect(plan.preserved.referencedBases).toBe(referenced.size);
    expect(plan.candidates.bases.map(({ path }) => path)).toEqual([unused.path]);
    expect(plan.candidates.bases.every(({ path }) => !referenced.has(path))).toBe(true);
    applyClean(options, plan.planDigest);
    for (const path of referenced) expect(existsSync(resolve(project.root, path))).toBe(true);
  });

  it("preserves and blocks around an active transaction", () => {
    const project = fixture();
    const transactionRoot = resolve(project.root, ".mergora/transactions", project.transactionId!);
    const transactionPath = resolve(transactionRoot, "transaction.json");
    const transaction = json<Record<string, unknown>>(transactionPath);
    transaction.state = "planning";
    writeFileSync(transactionPath, `${JSON.stringify(transaction, null, 2)}\n`);
    const cached = cacheEntry(project.root, "blocked-cache");
    const options = {
      projectRoot: project.root,
      cache: true,
      transactions: true,
      retainTransactions: 0,
    };
    const plan = planClean(options);

    expect(plan.preserved.activeTransactions).toEqual([project.transactionId]);
    expect(
      plan.candidates.transactions
        .map(({ path }) => path)
        .sort((left, right) => left.localeCompare(right, "en-US")),
    ).toEqual(transactionPaths(project.initTransactionIds));
    expect(plan.blockedReasons).toEqual([expect.stringMatching(/recovered before cleanup/iu)]);
    expect(() => applyClean(options, plan.planDigest)).toThrow(/recovered before cleanup/iu);
    expect(existsSync(transactionRoot)).toBe(true);
    for (const transactionId of project.initTransactionIds) {
      expect(existsSync(resolve(project.root, `.mergora/transactions/${transactionId}`))).toBe(
        true,
      );
    }
    expect(existsSync(resolve(project.root, cached))).toBe(true);
  });

  it("refuses a stale reviewed digest before deleting any newly changed inventory", () => {
    const project = fixture(false);
    const first = cacheEntry(project.root, "first-cache");
    const options = { projectRoot: project.root, cache: true };
    const reviewed = planClean(options);
    const second = cacheEntry(project.root, "second-cache");

    expect(() => applyClean(options, reviewed.planDigest)).toThrow(
      /plan changed|fresh exact plan/iu,
    );
    expect(existsSync(resolve(project.root, first))).toBe(true);
    expect(existsSync(resolve(project.root, second))).toBe(true);
  });

  it("fails closed when a reviewed candidate is tampered", () => {
    const project = fixture(false);
    const cached = cacheEntry(project.root, "tamper-cache");
    const options = { projectRoot: project.root, cache: true };
    const reviewed = planClean(options);
    writeFileSync(resolve(project.root, cached, "artifact"), "changed after review\n");

    expect(() => applyClean(options, reviewed.planDigest)).toThrow(/integrity|tamper/iu);
    expect(existsSync(resolve(project.root, cached))).toBe(true);
    expect(existsSync(resolve(project.root, ".mergora/.lock"))).toBe(false);
  });
});

describe("cleanup hostile filesystem rejection", () => {
  it("rejects linked cache roots without reading or deleting their targets", () => {
    const project = fixture(false);
    const outside = mkdtempSync(resolve(tmpdir(), "mergora-clean-outside-"));
    temporaryDirectories.push(outside);
    mkdirSync(resolve(outside, "entries"));
    writeFileSync(resolve(outside, "secret"), "must remain outside\n");
    const link = resolve(project.root, ".mergora/cache");
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    linkedDirectories.push(link);

    expect(() => planClean({ projectRoot: project.root, cache: true })).toThrow(/symbolic|link/iu);
    expect(readFileSync(resolve(outside, "secret"), "utf8")).toBe("must remain outside\n");
  });

  it("rejects encoded path escapes, oversized artifacts, and malformed cache metadata", () => {
    const escaped = fixture(false);
    cacheEntry(escaped.root, "%2e%2e");
    expect(() => planClean({ projectRoot: escaped.root, cache: true })).toThrow(
      /portable|path|segment/iu,
    );

    const oversized = fixture(false);
    const largePath = cacheEntry(oversized.root, "oversized-cache");
    truncateSync(resolve(oversized.root, largePath, "artifact"), 64 * 1024 * 1024 + 1);
    expect(() => planClean({ projectRoot: oversized.root, cache: true })).toThrow(
      /oversized|byte limit|unsafe/iu,
    );

    const malformed = fixture(false);
    const malformedPath = cacheEntry(malformed.root, "malformed-cache");
    writeFileSync(resolve(malformed.root, malformedPath, "unexpected"), "unknown\n");
    expect(() => planClean({ projectRoot: malformed.root, cache: true })).toThrow(
      /unknown files|invalid/iu,
    );
  });

  it.skipIf(process.platform === "win32")(
    "rejects cache entries that collide under portable case folding",
    () => {
      const project = fixture(false);
      cacheEntry(project.root, "Case-Collision");
      cacheEntry(project.root, "case-collision");
      expect(() => planClean({ projectRoot: project.root, cache: true })).toThrow(/collision/iu);
    },
  );
});
