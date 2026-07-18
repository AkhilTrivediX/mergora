import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  type Dirent,
  type Stats,
} from "node:fs";
import { dirname, resolve } from "node:path";

import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  canonicalJson,
  CLI_VERSION,
  CliError,
  resolveInside,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import { readMergoraConfig } from "./configuration.js";
import {
  basePath,
  digestOrNull,
  readManifest,
  readProjectFile,
  type ProvenanceManifest,
} from "./source-operations.js";

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const TRANSACTION_ID = /^[0-9]{8}T[0-9]{6}(?:\.[0-9]{3})?Z-[0-9a-f]{32}$/u;
const TERMINAL_TRANSACTION_STATES = new Set([
  "committed",
  "rolled-back",
  "conflicted",
  "abandoned",
]);
const ACTIVE_TRANSACTION_STATES = new Set([
  "planning",
  "awaiting-consent",
  "staged",
  "validated",
  "committing",
  "post-validating",
]);
const CLEAN_CATEGORIES = ["bases", "cache", "conflicts", "transactions"] as const;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_SCAN_BYTES = 512 * 1024 * 1024;
const MAX_SCAN_NODES = 32_768;
const MAX_RETENTION = 10_000;

type Digest = `sha256:${string}`;
export type CleanCategory = (typeof CLEAN_CATEGORIES)[number];

export interface VerifiedCacheEntryV1 {
  readonly schemaVersion: 1;
  readonly artifactKind: "mergora-verified-cache-entry";
  readonly key: string;
  readonly artifact: "artifact";
  readonly digest: Digest;
  readonly bytes: number;
}

export interface CleanOptions {
  readonly projectRoot: string;
  readonly cache?: boolean | undefined;
  readonly transactions?: boolean | undefined;
  readonly bases?: boolean | undefined;
  readonly conflicts?: boolean | undefined;
  /** Number of newest terminal transactions to preserve. Defaults to committed project policy. */
  readonly retainTransactions?: number | undefined;
}

export interface CleanCandidate {
  readonly category: CleanCategory;
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly bytes: number;
  readonly files: number;
  readonly preconditionDigest: Digest;
  readonly reason: string;
}

export interface CleanPlan {
  readonly schemaVersion: 1;
  readonly command: "clean";
  readonly cliVersion: typeof CLI_VERSION;
  readonly projectRoot: ".";
  readonly configDigest: Digest;
  readonly manifestPreconditionDigest: Digest;
  readonly retention: { readonly terminalTransactions: number };
  readonly selectedCategories: readonly CleanCategory[];
  readonly candidates: Readonly<Record<CleanCategory, readonly CleanCandidate[]>>;
  readonly selected: readonly CleanCandidate[];
  readonly preserved: {
    readonly referencedBases: number;
    readonly retainedTerminalTransactions: number;
    readonly activeTransactions: readonly string[];
    readonly activeConflicts: readonly string[];
  };
  readonly blockedReasons: readonly string[];
  readonly writesRequired: boolean;
  readonly estimatedReclaimBytes: number;
  readonly rollbackAvailable: false;
  readonly journalStrategy: "intent-before-atomic-move-then-unlink";
  readonly warnings: readonly string[];
  readonly planDigest: Digest;
}

export interface CleanResult {
  readonly mode: "local-clean";
  readonly status: "no-op" | "cleaned";
  readonly planDigest: Digest;
  readonly deleted: readonly string[];
  readonly reclaimedBytes: number;
  readonly journal: string | null;
  readonly rollbackAvailable: false;
}

interface SnapshotFile {
  readonly path: string;
  readonly digest: Digest;
  readonly bytes: number;
  readonly content: Buffer;
}

interface TreeSnapshot {
  readonly root: string;
  readonly kind: "file" | "directory";
  readonly files: readonly SnapshotFile[];
  readonly directories: readonly string[];
  readonly bytes: number;
  readonly digest: Digest;
}

interface InternalCandidate {
  readonly public: CleanCandidate;
  readonly snapshot: TreeSnapshot;
}

interface ScanBudget {
  nodes: number;
  bytes: number;
}

interface InternalCleanPlan {
  readonly root: string;
  readonly options: CleanOptions;
  readonly plan: CleanPlan;
  readonly selected: readonly InternalCandidate[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function isBoundedStringArray(value: unknown, maximum = 8192): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every((entry) => typeof entry === "string" && entry.length <= 4096)
  );
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right, "en-US"));
  const wanted = [...expected].sort((left, right) => left.localeCompare(right, "en-US"));
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new CliError(`${label} has missing or unknown fields.`, {
      code: "CLEAN_METADATA_INVALID",
      exitCode: 8,
    });
  }
}

function accountNode(budget: ScanBudget, bytes = 0): void {
  budget.nodes += 1;
  budget.bytes += bytes;
  if (budget.nodes > MAX_SCAN_NODES || budget.bytes > MAX_SCAN_BYTES) {
    throw new CliError("Cleanup inspection exceeds its bounded traversal policy.", {
      code: "CLEAN_SCAN_LIMIT_EXCEEDED",
      exitCode: 8,
    });
  }
}

function safeMetadata(root: string, relativePath: string): Stats | null {
  assertPortableRelativePath(relativePath, "Cleanup path");
  assertNoSymlinkAncestors(root, relativePath);
  const path = resolveInside(root, relativePath, "Cleanup path");
  try {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) {
      throw new CliError(`Cleanup path ${relativePath} is a symbolic link.`, {
        code: "CLEAN_PATH_UNSAFE",
        exitCode: 5,
        target: relativePath,
      });
    }
    return metadata;
  } catch (error) {
    if (error instanceof CliError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function safeRead(root: string, relativePath: string, budget?: ScanBudget): Buffer {
  const metadata = safeMetadata(root, relativePath);
  if (metadata === null || !metadata.isFile() || metadata.size > MAX_FILE_BYTES) {
    throw new CliError(`Cleanup file ${relativePath} is missing, oversized, or not regular.`, {
      code: "CLEAN_PATH_UNSAFE",
      exitCode: 5,
      target: relativePath,
    });
  }
  const path = resolveInside(root, relativePath, "Cleanup file");
  let descriptor: number | null = null;
  try {
    descriptor = openSync(
      path,
      process.platform === "win32" ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const opened = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      !current.isFile() ||
      opened.dev !== current.dev ||
      opened.ino !== current.ino ||
      opened.size !== current.size
    ) {
      throw new CliError(`Cleanup file ${relativePath} changed during inspection.`, {
        code: "CLEAN_PATH_UNSAFE",
        exitCode: 5,
        target: relativePath,
      });
    }
    const bytes = readFileSync(descriptor);
    if (budget !== undefined) accountNode(budget, bytes.byteLength);
    return bytes;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function directoryEntries(root: string, relativePath: string): Dirent<string>[] {
  const metadata = safeMetadata(root, relativePath);
  if (metadata === null || !metadata.isDirectory()) {
    throw new CliError(`Cleanup directory ${relativePath} is unavailable or unsafe.`, {
      code: "CLEAN_PATH_UNSAFE",
      exitCode: 5,
      target: relativePath,
    });
  }
  return readdirSync(resolveInside(root, relativePath, "Cleanup directory"), {
    withFileTypes: true,
  });
}

function snapshotTree(root: string, relativeRoot: string, budget: ScanBudget): TreeSnapshot {
  const metadata = safeMetadata(root, relativeRoot);
  if (metadata === null) {
    throw new CliError(`Cleanup candidate ${relativeRoot} disappeared.`, {
      code: "CLEAN_PRECONDITION_STALE",
      exitCode: 8,
      target: relativeRoot,
    });
  }
  if (metadata.isFile()) {
    const content = safeRead(root, relativeRoot, budget);
    const file: SnapshotFile = {
      path: relativeRoot,
      digest: sha256(content),
      bytes: content.byteLength,
      content,
    };
    return {
      root: relativeRoot,
      kind: "file",
      files: [file],
      directories: [],
      bytes: content.byteLength,
      digest: sha256(
        canonicalJson([{ path: relativeRoot, digest: file.digest, bytes: file.bytes }]),
      ),
    };
  }
  if (!metadata.isDirectory()) {
    throw new CliError(`Cleanup candidate ${relativeRoot} has a forbidden filesystem type.`, {
      code: "CLEAN_PATH_UNSAFE",
      exitCode: 5,
      target: relativeRoot,
    });
  }
  accountNode(budget);
  const files: SnapshotFile[] = [];
  const directories: string[] = [relativeRoot];
  const portablePaths = new Set<string>([relativeRoot.normalize("NFC").toLocaleLowerCase("en-US")]);
  const visit = (directory: string): void => {
    const entries = directoryEntries(root, directory).sort((left, right) =>
      left.name.localeCompare(right.name, "en-US"),
    );
    for (const entry of entries) {
      const relativePath = `${directory}/${entry.name}`;
      assertPortableRelativePath(relativePath, "Cleanup tree path");
      const portable = relativePath.normalize("NFC").toLocaleLowerCase("en-US");
      if (portablePaths.has(portable) || entry.isSymbolicLink()) {
        throw new CliError(`Cleanup tree ${relativeRoot} has a portable-path collision or link.`, {
          code: "CLEAN_PATH_COLLISION",
          exitCode: 5,
          target: relativePath,
        });
      }
      portablePaths.add(portable);
      if (entry.isDirectory()) {
        accountNode(budget);
        directories.push(relativePath);
        visit(relativePath);
      } else if (entry.isFile()) {
        const content = safeRead(root, relativePath, budget);
        files.push({
          path: relativePath,
          digest: sha256(content),
          bytes: content.byteLength,
          content,
        });
      } else {
        throw new CliError(`Cleanup tree ${relativeRoot} has a forbidden filesystem entry.`, {
          code: "CLEAN_PATH_UNSAFE",
          exitCode: 5,
          target: relativePath,
        });
      }
    }
  };
  visit(relativeRoot);
  files.sort((left, right) => left.path.localeCompare(right.path, "en-US"));
  directories.sort((left, right) => left.localeCompare(right, "en-US"));
  const bytes = files.reduce((total, file) => total + file.bytes, 0);
  return {
    root: relativeRoot,
    kind: "directory",
    files,
    directories,
    bytes,
    digest: sha256(
      canonicalJson({
        directories,
        files: files.map(({ path, digest: fileDigest, bytes: fileBytes }) => ({
          path,
          digest: fileDigest,
          bytes: fileBytes,
        })),
      }),
    ),
  };
}

function fileFromSnapshot(snapshot: TreeSnapshot, relativePath: string): Buffer {
  const file = snapshot.files.find(({ path }) => path === relativePath);
  if (file === undefined) {
    throw new CliError(`Cleanup metadata file ${relativePath} is missing.`, {
      code: "CLEAN_METADATA_INVALID",
      exitCode: 8,
      target: relativePath,
    });
  }
  return file.content;
}

function parseJson(bytes: Buffer, label: string): unknown {
  if (bytes.byteLength > MAX_JSON_BYTES) {
    throw new CliError(`${label} exceeds the cleanup metadata byte limit.`, {
      code: "CLEAN_METADATA_INVALID",
      exitCode: 8,
    });
  }
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new CliError(`${label} is not valid JSON.`, {
      code: "CLEAN_METADATA_INVALID",
      exitCode: 8,
    });
  }
}

function candidate(
  category: CleanCategory,
  snapshot: TreeSnapshot,
  reason: string,
): InternalCandidate {
  return {
    snapshot,
    public: {
      category,
      path: snapshot.root,
      kind: snapshot.kind,
      bytes: snapshot.bytes,
      files: snapshot.files.length,
      preconditionDigest: snapshot.digest,
      reason,
    },
  };
}

function scanCache(root: string, budget: ScanBudget): readonly InternalCandidate[] {
  const cacheRoot = ".mergora/cache";
  const rootMetadata = safeMetadata(root, cacheRoot);
  if (rootMetadata === null) return [];
  if (!rootMetadata.isDirectory()) {
    throw new CliError("Mergora cache root is unsafe.", {
      code: "CLEAN_PATH_UNSAFE",
      exitCode: 5,
      target: cacheRoot,
    });
  }
  const rootEntries = directoryEntries(root, cacheRoot);
  if (rootEntries.some((entry) => entry.name !== "entries" || !entry.isDirectory())) {
    throw new CliError("Mergora cache contains an unknown or unsafe root entry.", {
      code: "CLEAN_CACHE_INVALID",
      exitCode: 8,
      target: cacheRoot,
    });
  }
  const entriesRoot = `${cacheRoot}/entries`;
  if (safeMetadata(root, entriesRoot) === null) return [];
  const result: InternalCandidate[] = [];
  const portableEntryNames = new Set<string>();
  for (const entry of directoryEntries(root, entriesRoot).sort((left, right) =>
    left.name.localeCompare(right.name, "en-US"),
  )) {
    const path = `${entriesRoot}/${entry.name}`;
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new CliError(`Cache entry ${path} is unsafe.`, {
        code: "CLEAN_CACHE_INVALID",
        exitCode: 8,
        target: path,
      });
    }
    assertPortableRelativePath(path, "Cache entry");
    const portableEntryName = entry.name.normalize("NFC").toLocaleLowerCase("en-US");
    if (portableEntryNames.has(portableEntryName)) {
      throw new CliError("Mergora cache contains a portable-path collision.", {
        code: "CLEAN_PATH_COLLISION",
        exitCode: 5,
        target: path,
      });
    }
    portableEntryNames.add(portableEntryName);
    const snapshot = snapshotTree(root, path, budget);
    const relativeFiles = snapshot.files.map(({ path: filePath }) =>
      filePath.slice(`${path}/`.length),
    );
    if (JSON.stringify(relativeFiles) !== JSON.stringify(["artifact", "cache-entry.json"])) {
      throw new CliError(`Cache entry ${entry.name} has unknown files.`, {
        code: "CLEAN_CACHE_INVALID",
        exitCode: 8,
        target: path,
      });
    }
    const raw = parseJson(
      fileFromSnapshot(snapshot, `${path}/cache-entry.json`),
      `Cache entry ${entry.name}`,
    );
    if (!isRecord(raw)) {
      throw new CliError(`Cache entry ${entry.name} metadata is invalid.`, {
        code: "CLEAN_CACHE_INVALID",
        exitCode: 8,
        target: path,
      });
    }
    exactKeys(
      raw,
      ["schemaVersion", "artifactKind", "key", "artifact", "digest", "bytes"],
      `Cache entry ${entry.name}`,
    );
    const artifact = fileFromSnapshot(snapshot, `${path}/artifact`);
    if (
      raw.schemaVersion !== 1 ||
      raw.artifactKind !== "mergora-verified-cache-entry" ||
      raw.key !== entry.name ||
      raw.artifact !== "artifact" ||
      typeof raw.digest !== "string" ||
      !DIGEST.test(raw.digest) ||
      !Number.isSafeInteger(raw.bytes) ||
      Number(raw.bytes) < 0 ||
      raw.digest !== sha256(artifact) ||
      raw.bytes !== artifact.byteLength
    ) {
      throw new CliError(`Cache entry ${entry.name} failed integrity verification.`, {
        code: "CLEAN_CACHE_TAMPERED",
        exitCode: 8,
        target: path,
      });
    }
    result.push(candidate("cache", snapshot, "Verified ordinary registry cache entry."));
  }
  return result;
}

function referencedBaseDigests(manifest: ProvenanceManifest): ReadonlySet<Digest> {
  return new Set(
    Object.values(manifest.items).flatMap((item) => item.files.map(({ base }) => base)),
  );
}

function scanBases(
  root: string,
  manifest: ProvenanceManifest,
  budget: ScanBudget,
): { readonly candidates: readonly InternalCandidate[]; readonly referenced: number } {
  const referenced = referencedBaseDigests(manifest);
  for (const baseDigest of referenced) {
    const bytes = readProjectFile(root, basePath(baseDigest));
    if (bytes === null || sha256(bytes) !== baseDigest) {
      throw new CliError(
        `Referenced immutable base ${basePath(baseDigest)} is missing or corrupt.`,
        {
          code: "CLEAN_REFERENCED_BASE_INVALID",
          exitCode: 8,
          target: basePath(baseDigest),
        },
      );
    }
  }
  const baseRoot = ".mergora/bases/sha256";
  const metadata = safeMetadata(root, baseRoot);
  if (metadata === null) return { candidates: [], referenced: referenced.size };
  if (!metadata.isDirectory()) {
    throw new CliError("Immutable base root is unsafe.", {
      code: "CLEAN_PATH_UNSAFE",
      exitCode: 5,
      target: baseRoot,
    });
  }
  const candidates: InternalCandidate[] = [];
  for (const shard of directoryEntries(root, baseRoot).sort((left, right) =>
    left.name.localeCompare(right.name, "en-US"),
  )) {
    const shardPath = `${baseRoot}/${shard.name}`;
    if (!/^[a-f0-9]{2}$/u.test(shard.name) || !shard.isDirectory() || shard.isSymbolicLink()) {
      throw new CliError(`Immutable base shard ${shardPath} is malformed.`, {
        code: "CLEAN_BASE_STORE_INVALID",
        exitCode: 8,
        target: shardPath,
      });
    }
    for (const entry of directoryEntries(root, shardPath).sort((left, right) =>
      left.name.localeCompare(right.name, "en-US"),
    )) {
      const path = `${shardPath}/${entry.name}`;
      const match = /^([a-f0-9]{62})\.blob$/u.exec(entry.name);
      if (match === null || !entry.isFile() || entry.isSymbolicLink()) {
        throw new CliError(`Immutable base entry ${path} is malformed.`, {
          code: "CLEAN_BASE_STORE_INVALID",
          exitCode: 8,
          target: path,
        });
      }
      const expected = `sha256:${shard.name}${match[1]}` as Digest;
      const snapshot = snapshotTree(root, path, budget);
      if (snapshot.files[0]!.digest !== expected) {
        throw new CliError(`Immutable base entry ${path} failed digest verification.`, {
          code: "CLEAN_BASE_STORE_INVALID",
          exitCode: 8,
          target: path,
        });
      }
      if (!referenced.has(expected)) {
        candidates.push(
          candidate("bases", snapshot, "Verified content-addressed base is unreferenced."),
        );
      }
    }
  }
  return { candidates, referenced: referenced.size };
}

interface TransactionInspection {
  readonly id: string;
  readonly state: string;
  readonly snapshot: TreeSnapshot;
}

function validatePlanBytes(bytes: Buffer, expectedDigest: string, label: string): void {
  const raw = parseJson(bytes, label);
  if (!isRecord(raw) || typeof raw.planDigest !== "string" || !DIGEST.test(raw.planDigest)) {
    throw new CliError(`${label} lacks a valid plan digest.`, {
      code: "CLEAN_TRANSACTION_TAMPERED",
      exitCode: 8,
    });
  }
  const { planDigest, ...semantic } = raw;
  if (planDigest !== expectedDigest || sha256(canonicalJson(semantic)) !== planDigest) {
    throw new CliError(`${label} failed plan digest verification.`, {
      code: "CLEAN_TRANSACTION_TAMPERED",
      exitCode: 8,
    });
  }
}

function exactKeysWithOptional(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    actual.some((key) => !allowed.has(key))
  ) {
    throw new CliError(`${label} has missing or unknown fields.`, {
      code: "CLEAN_METADATA_INVALID",
      exitCode: 8,
    });
  }
}

function validateTransactionJournal(id: string, state: string, snapshot: TreeSnapshot): void {
  const path = `${snapshot.root}/journal.json`;
  const raw = parseJson(fileFromSnapshot(snapshot, path), `Transaction ${id} journal`);
  if (!isRecord(raw)) {
    throw new CliError(`Transaction ${id} journal is invalid.`, {
      code: "CLEAN_TRANSACTION_TAMPERED",
      exitCode: 8,
      target: path,
    });
  }
  exactKeys(
    raw,
    ["schemaVersion", "transactionId", "state", "entries"],
    `Transaction ${id} journal`,
  );
  if (
    raw.schemaVersion !== 1 ||
    raw.transactionId !== id ||
    typeof raw.state !== "string" ||
    (!TERMINAL_TRANSACTION_STATES.has(raw.state) && !ACTIVE_TRANSACTION_STATES.has(raw.state)) ||
    !Array.isArray(raw.entries) ||
    raw.entries.length > 65_536 ||
    (TERMINAL_TRANSACTION_STATES.has(state) && raw.state !== state)
  ) {
    throw new CliError(`Transaction ${id} journal is invalid.`, {
      code: "CLEAN_TRANSACTION_TAMPERED",
      exitCode: 8,
      target: path,
    });
  }
  const checkpoints = new Set([
    "inspection-complete",
    "plan-complete",
    "consent-recorded",
    "lock-acquired",
    "stage-written",
    "validation-complete",
    "backup-written",
    "commit-target",
    "manifest-committed",
    "dependencies-complete",
    "post-validation-complete",
    "rollback-target",
    "finalized",
  ]);
  for (const [index, rawEntry] of raw.entries.entries()) {
    if (!isRecord(rawEntry)) {
      throw new CliError(`Transaction ${id} journal is invalid.`, {
        code: "CLEAN_TRANSACTION_TAMPERED",
        exitCode: 8,
        target: path,
      });
    }
    exactKeysWithOptional(
      rawEntry,
      ["sequence", "recordedAt", "state", "checkpoint", "recordDigest"],
      ["target", "preconditionDigest", "postconditionDigest"],
      `Transaction ${id} journal entry`,
    );
    if (
      rawEntry.sequence !== index ||
      typeof rawEntry.recordedAt !== "string" ||
      typeof rawEntry.state !== "string" ||
      (!TERMINAL_TRANSACTION_STATES.has(rawEntry.state) &&
        !ACTIVE_TRANSACTION_STATES.has(rawEntry.state)) ||
      typeof rawEntry.checkpoint !== "string" ||
      !checkpoints.has(rawEntry.checkpoint) ||
      typeof rawEntry.recordDigest !== "string" ||
      !DIGEST.test(rawEntry.recordDigest) ||
      !(
        rawEntry.preconditionDigest === undefined ||
        (typeof rawEntry.preconditionDigest === "string" &&
          DIGEST.test(rawEntry.preconditionDigest))
      ) ||
      !(
        rawEntry.postconditionDigest === undefined ||
        (typeof rawEntry.postconditionDigest === "string" &&
          DIGEST.test(rawEntry.postconditionDigest))
      )
    ) {
      throw new CliError(`Transaction ${id} journal is invalid.`, {
        code: "CLEAN_TRANSACTION_TAMPERED",
        exitCode: 8,
        target: path,
      });
    }
    try {
      if (new Date(rawEntry.recordedAt).toISOString() !== rawEntry.recordedAt) throw new Error();
      if (rawEntry.target !== undefined) {
        if (typeof rawEntry.target !== "string") throw new Error();
        assertPortableRelativePath(rawEntry.target, "Cleanup transaction journal target");
      }
    } catch {
      throw new CliError(`Transaction ${id} journal is invalid.`, {
        code: "CLEAN_TRANSACTION_TAMPERED",
        exitCode: 8,
        target: path,
      });
    }
    const { recordDigest, ...semantic } = rawEntry;
    if (sha256(canonicalJson(semantic)) !== recordDigest) {
      throw new CliError(`Transaction ${id} journal digest is invalid.`, {
        code: "CLEAN_TRANSACTION_TAMPERED",
        exitCode: 8,
        target: path,
      });
    }
  }
}

function inspectStandardTransaction(id: string, snapshot: TreeSnapshot): TransactionInspection {
  const root = snapshot.root;
  const raw = parseJson(
    fileFromSnapshot(snapshot, `${root}/transaction.json`),
    `Transaction ${id}`,
  );
  if (!isRecord(raw)) {
    throw new CliError(`Transaction ${id} metadata is invalid.`, {
      code: "CLEAN_TRANSACTION_INVALID",
      exitCode: 8,
      target: root,
    });
  }
  exactKeys(
    raw,
    [
      "schemaVersion",
      "transactionId",
      "state",
      "plan",
      "preconditions",
      "registryPayloads",
      "staged",
      "backups",
      "conflicts",
      "consents",
      "resolutions",
      "validations",
      "command",
      "packageManager",
    ],
    `Transaction ${id}`,
  );
  if (
    raw.schemaVersion !== 1 ||
    raw.transactionId !== id ||
    typeof raw.state !== "string" ||
    (!TERMINAL_TRANSACTION_STATES.has(raw.state) && !ACTIVE_TRANSACTION_STATES.has(raw.state)) ||
    !isRecord(raw.plan) ||
    !isRecord(raw.preconditions) ||
    !Array.isArray(raw.registryPayloads) ||
    !Array.isArray(raw.staged) ||
    !Array.isArray(raw.backups) ||
    !Array.isArray(raw.conflicts) ||
    !Array.isArray(raw.consents) ||
    !Array.isArray(raw.resolutions) ||
    !Array.isArray(raw.validations) ||
    !isRecord(raw.command) ||
    !isRecord(raw.packageManager)
  ) {
    throw new CliError(`Transaction ${id} metadata is malformed.`, {
      code: "CLEAN_TRANSACTION_INVALID",
      exitCode: 8,
      target: root,
    });
  }
  exactKeys(raw.plan, ["path", "digest"], `Transaction ${id} plan reference`);
  if (
    raw.plan.path !== `${root}/plan.json` ||
    typeof raw.plan.digest !== "string" ||
    !DIGEST.test(raw.plan.digest)
  ) {
    throw new CliError(`Transaction ${id} plan reference is malformed.`, {
      code: "CLEAN_TRANSACTION_INVALID",
      exitCode: 8,
      target: root,
    });
  }
  validatePlanBytes(
    fileFromSnapshot(snapshot, `${root}/plan.json`),
    raw.plan.digest,
    `Transaction ${id} plan`,
  );
  validateTransactionJournal(id, raw.state, snapshot);
  const expectedFiles = new Set<string>([
    `${root}/journal.json`,
    `${root}/plan.json`,
    `${root}/transaction.json`,
  ]);
  const recordedTargets = new Set<string>();
  const recordedArtifactPaths = new Set<string>();
  for (const stagedValue of raw.staged) {
    if (!isRecord(stagedValue)) {
      throw new CliError(`Transaction ${id} staged metadata is malformed.`, {
        code: "CLEAN_TRANSACTION_INVALID",
        exitCode: 8,
        target: root,
      });
    }
    exactKeys(
      stagedValue,
      ["target", "stagePath", "digest", "operation"],
      `Transaction ${id} staged metadata`,
    );
    if (typeof stagedValue.target !== "string" || typeof stagedValue.stagePath !== "string") {
      throw new CliError(`Transaction ${id} staged metadata is malformed.`, {
        code: "CLEAN_TRANSACTION_INVALID",
        exitCode: 8,
        target: root,
      });
    }
    assertPortableRelativePath(stagedValue.target, "Cleanup transaction target");
    const validStagePaths = new Set([
      `${root}/stage/${stagedValue.target}`,
      `${root}/post/${stagedValue.target}`,
    ]);
    const portableTarget = stagedValue.target.normalize("NFC").toLocaleLowerCase("en-US");
    const portableArtifact = stagedValue.stagePath.normalize("NFC").toLocaleLowerCase("en-US");
    if (
      !validStagePaths.has(stagedValue.stagePath) ||
      recordedTargets.has(portableTarget) ||
      recordedArtifactPaths.has(portableArtifact) ||
      !(
        (stagedValue.operation === "delete" && stagedValue.digest === null) ||
        (stagedValue.operation === "write" &&
          typeof stagedValue.digest === "string" &&
          DIGEST.test(stagedValue.digest))
      )
    ) {
      throw new CliError(`Transaction ${id} staged metadata is malformed.`, {
        code: "CLEAN_TRANSACTION_INVALID",
        exitCode: 8,
        target: root,
      });
    }
    recordedTargets.add(portableTarget);
    recordedArtifactPaths.add(portableArtifact);
    if (stagedValue.digest !== null) {
      expectedFiles.add(stagedValue.stagePath);
      if (sha256(fileFromSnapshot(snapshot, stagedValue.stagePath)) !== stagedValue.digest) {
        throw new CliError(`Transaction ${id} staged artifact is corrupt.`, {
          code: "CLEAN_TRANSACTION_TAMPERED",
          exitCode: 8,
          target: stagedValue.stagePath,
        });
      }
    }
  }
  const backupTargets = new Set<string>();
  for (const backupValue of raw.backups) {
    if (!isRecord(backupValue)) {
      throw new CliError(`Transaction ${id} backup metadata is malformed.`, {
        code: "CLEAN_TRANSACTION_INVALID",
        exitCode: 8,
        target: root,
      });
    }
    exactKeys(backupValue, ["target", "backupPath", "digest"], `Transaction ${id} backup metadata`);
    if (typeof backupValue.target !== "string" || typeof backupValue.backupPath !== "string") {
      throw new CliError(`Transaction ${id} backup metadata is malformed.`, {
        code: "CLEAN_TRANSACTION_INVALID",
        exitCode: 8,
        target: root,
      });
    }
    assertPortableRelativePath(backupValue.target, "Cleanup transaction backup target");
    const portableTarget = backupValue.target.normalize("NFC").toLocaleLowerCase("en-US");
    if (
      backupValue.backupPath !== `${root}/backup/${backupValue.target}` ||
      backupTargets.has(portableTarget) ||
      !(
        backupValue.digest === null ||
        (typeof backupValue.digest === "string" && DIGEST.test(backupValue.digest))
      )
    ) {
      throw new CliError(`Transaction ${id} backup metadata is malformed.`, {
        code: "CLEAN_TRANSACTION_INVALID",
        exitCode: 8,
        target: root,
      });
    }
    backupTargets.add(portableTarget);
    if (backupValue.digest !== null) {
      expectedFiles.add(backupValue.backupPath);
      if (sha256(fileFromSnapshot(snapshot, backupValue.backupPath)) !== backupValue.digest) {
        throw new CliError(`Transaction ${id} backup artifact is corrupt.`, {
          code: "CLEAN_TRANSACTION_TAMPERED",
          exitCode: 8,
          target: backupValue.backupPath,
        });
      }
    }
  }
  const actualFiles = snapshot.files
    .map(({ path }) => path)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const wantedFiles = [...expectedFiles].sort((left, right) => left.localeCompare(right, "en-US"));
  const wantedDirectories = new Set(expectedDirectories(root, expectedFiles));
  for (const directory of [`${root}/backup`, `${root}/post`, `${root}/stage`]) {
    wantedDirectories.add(directory);
  }
  const actualDirectories = [...snapshot.directories].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  if (
    JSON.stringify(actualFiles) !== JSON.stringify(wantedFiles) ||
    JSON.stringify(actualDirectories) !==
      JSON.stringify(
        [...wantedDirectories].sort((left, right) => left.localeCompare(right, "en-US")),
      )
  ) {
    throw new CliError(`Transaction ${id} contains an unknown or missing artifact.`, {
      code: "CLEAN_TRANSACTION_INVALID",
      exitCode: 8,
      target: root,
    });
  }
  return { id, state: raw.state, snapshot };
}

function digestMatchesPresence(
  present: unknown,
  digestValue: unknown,
): digestValue is Digest | null {
  return (
    (present === true && typeof digestValue === "string" && DIGEST.test(digestValue)) ||
    (present === false && digestValue === null)
  );
}

function conflictSnapshotBytes(
  snapshot: TreeSnapshot,
  id: string,
  key: string,
  view: "base" | "local" | "remote" | "proposed",
  present: boolean,
  expected: Digest | null,
): Buffer | null {
  const path = `${snapshot.root}/snapshots/${key}/${view}`;
  const bytes = fileFromSnapshot(snapshot, path);
  if (!present) {
    if (bytes.byteLength !== 0 || expected !== null) {
      throw new CliError(`Conflict ${id} ${view} snapshot is corrupt.`, {
        code: "CLEAN_CONFLICT_TAMPERED",
        exitCode: 8,
        target: path,
      });
    }
    return null;
  }
  if (sha256(bytes) !== expected) {
    throw new CliError(`Conflict ${id} ${view} snapshot failed digest verification.`, {
      code: "CLEAN_CONFLICT_TAMPERED",
      exitCode: 8,
      target: path,
    });
  }
  return bytes;
}

function expectedConflictReadme(id: string, targets: readonly string[]): Buffer {
  return Buffer.from(
    [
      "# Mergora Semantic Sync conflict",
      "",
      "The live project, provenance manifest, package metadata, and base store are unchanged.",
      "These files may contain private project source. They are local-only and must not be uploaded without review.",
      "",
      "Conflicted targets:",
      "",
      targets.map((target) => `- \`${target}\``).join("\n"),
      "",
      "Inspect unresolved units:",
      "",
      `    mergora resolve ${id} --list`,
      "",
      "Choose a path-specific resolution with `--take-local`, `--take-upstream`, or edit that target's `proposed` file and use `--resolved`. Then run `--apply`.",
      "There is intentionally no force-overwrite or operation-wide take-upstream choice.",
      "",
    ].join("\n"),
  );
}

function expectedDirectories(root: string, files: ReadonlySet<string>): readonly string[] {
  const directories = new Set<string>([root]);
  for (const file of files) {
    let current = file;
    while (current !== root) {
      const separator = current.lastIndexOf("/");
      if (separator < root.length) break;
      current = current.slice(0, separator);
      directories.add(current);
    }
  }
  return [...directories].sort((left, right) => left.localeCompare(right, "en-US"));
}

function inspectConflictBundle(input: {
  readonly root: string;
  readonly id: string;
  readonly snapshot: TreeSnapshot;
  readonly configDigest: Digest;
  readonly manifestDigest: Digest;
}): "active" | "stale" {
  const statePath = `${input.snapshot.root}/conflict-state.json`;
  const stateBytes = fileFromSnapshot(input.snapshot, statePath);
  const stateDigest = fileFromSnapshot(
    input.snapshot,
    `${input.snapshot.root}/conflict-state.sha256`,
  )
    .toString("utf8")
    .trim();
  if (!DIGEST.test(stateDigest) || sha256(stateBytes) !== stateDigest) {
    throw new CliError(`Conflict ${input.id} state failed digest verification.`, {
      code: "CLEAN_CONFLICT_TAMPERED",
      exitCode: 8,
      target: statePath,
    });
  }
  const state = parseJson(stateBytes, `Conflict ${input.id} state`);
  if (!isRecord(state)) {
    throw new CliError(`Conflict ${input.id} state is malformed.`, {
      code: "CLEAN_CONFLICT_INVALID",
      exitCode: 8,
      target: statePath,
    });
  }
  exactKeys(
    state,
    [
      "schemaVersion",
      "artifactKind",
      "transactionId",
      "state",
      "originalPlanDigest",
      "configPreconditionDigest",
      "manifestPreconditionDigest",
      "nextManifestDigest",
      "package",
      "registryPayloads",
      "selectedItems",
      "entries",
      "committedTransactionId",
    ],
    `Conflict ${input.id} state`,
  );
  if (
    state.schemaVersion !== 1 ||
    state.artifactKind !== "mergora-semantic-update-conflict" ||
    state.transactionId !== input.id ||
    !["conflicted", "resolved"].includes(String(state.state)) ||
    typeof state.originalPlanDigest !== "string" ||
    !DIGEST.test(state.originalPlanDigest) ||
    typeof state.configPreconditionDigest !== "string" ||
    !DIGEST.test(state.configPreconditionDigest) ||
    typeof state.manifestPreconditionDigest !== "string" ||
    !DIGEST.test(state.manifestPreconditionDigest) ||
    typeof state.nextManifestDigest !== "string" ||
    !DIGEST.test(state.nextManifestDigest) ||
    !isRecord(state.package) ||
    !Array.isArray(state.registryPayloads) ||
    state.registryPayloads.length > 8192 ||
    !isBoundedStringArray(state.selectedItems) ||
    !(
      state.committedTransactionId === null ||
      (typeof state.committedTransactionId === "string" &&
        TRANSACTION_ID.test(state.committedTransactionId))
    ) ||
    !Array.isArray(state.entries) ||
    state.entries.length === 0 ||
    state.entries.length > 8192
  ) {
    throw new CliError(`Conflict ${input.id} state is malformed.`, {
      code: "CLEAN_CONFLICT_INVALID",
      exitCode: 8,
      target: statePath,
    });
  }
  exactKeys(
    state.package,
    ["localDigest", "proposedDigest", "changed", "packageManager", "noInstall"],
    `Conflict ${input.id} package state`,
  );
  if (
    typeof state.package.changed !== "boolean" ||
    !["npm", "pnpm", "yarn", "bun"].includes(String(state.package.packageManager)) ||
    typeof state.package.noInstall !== "boolean"
  ) {
    throw new CliError(`Conflict ${input.id} package state is malformed.`, {
      code: "CLEAN_CONFLICT_INVALID",
      exitCode: 8,
      target: statePath,
    });
  }
  for (const payload of state.registryPayloads) {
    if (!isRecord(payload)) {
      throw new CliError(`Conflict ${input.id} registry evidence is malformed.`, {
        code: "CLEAN_CONFLICT_INVALID",
        exitCode: 8,
        target: statePath,
      });
    }
    exactKeys(
      payload,
      ["registry", "release", "url", "digest"],
      `Conflict ${input.id} registry evidence`,
    );
    if (
      typeof payload.registry !== "string" ||
      typeof payload.release !== "string" ||
      typeof payload.url !== "string" ||
      typeof payload.digest !== "string" ||
      !DIGEST.test(payload.digest)
    ) {
      throw new CliError(`Conflict ${input.id} registry evidence is malformed.`, {
        code: "CLEAN_CONFLICT_INVALID",
        exitCode: 8,
        target: statePath,
      });
    }
  }
  validatePlanBytes(
    fileFromSnapshot(input.snapshot, `${input.snapshot.root}/plan.json`),
    state.originalPlanDigest,
    `Conflict ${input.id} plan`,
  );
  if (
    sha256(fileFromSnapshot(input.snapshot, `${input.snapshot.root}/next-manifest.json`)) !==
      state.nextManifestDigest ||
    typeof state.package.localDigest !== "string" ||
    !DIGEST.test(state.package.localDigest) ||
    typeof state.package.proposedDigest !== "string" ||
    !DIGEST.test(state.package.proposedDigest) ||
    sha256(fileFromSnapshot(input.snapshot, `${input.snapshot.root}/package-local`)) !==
      state.package.localDigest ||
    sha256(fileFromSnapshot(input.snapshot, `${input.snapshot.root}/package-proposed`)) !==
      state.package.proposedDigest
  ) {
    throw new CliError(`Conflict ${input.id} immutable metadata is corrupt.`, {
      code: "CLEAN_CONFLICT_TAMPERED",
      exitCode: 8,
      target: input.snapshot.root,
    });
  }
  let liveMatches =
    state.state === "conflicted" &&
    state.configPreconditionDigest === input.configDigest &&
    state.manifestPreconditionDigest === input.manifestDigest &&
    digestOrNull(readProjectFile(input.root, "package.json")) === state.package.localDigest;
  const targets = new Set<string>();
  const keys = new Set<string>();
  const expectedFiles = new Set<string>([
    `${input.snapshot.root}/README.md`,
    `${input.snapshot.root}/conflict-state.json`,
    `${input.snapshot.root}/conflict-state.sha256`,
    `${input.snapshot.root}/next-manifest.json`,
    `${input.snapshot.root}/package-local`,
    `${input.snapshot.root}/package-proposed`,
    `${input.snapshot.root}/plan.json`,
  ]);
  const conflictedTargets: string[] = [];
  for (const rawEntry of state.entries) {
    if (!isRecord(rawEntry)) {
      throw new CliError(`Conflict ${input.id} has malformed entry metadata.`, {
        code: "CLEAN_CONFLICT_INVALID",
        exitCode: 8,
        target: input.snapshot.root,
      });
    }
    exactKeys(
      rawEntry,
      [
        "key",
        "target",
        "owner",
        "logicalPath",
        "role",
        "mediaType",
        "originalStatus",
        "baseDigest",
        "localDigest",
        "remoteDigest",
        "originalProposedDigest",
        "basePresent",
        "localPresent",
        "remotePresent",
        "originalProposedPresent",
        "conflictMetadataDigest",
        "conflicts",
        "appliedRemoteKeys",
        "preservedLocalKeys",
        "resolution",
        "currentProposedDigest",
        "currentProposedPresent",
      ],
      `Conflict ${input.id} entry`,
    );
    if (
      typeof rawEntry.key !== "string" ||
      typeof rawEntry.target !== "string" ||
      typeof rawEntry.owner !== "string" ||
      typeof rawEntry.logicalPath !== "string" ||
      typeof rawEntry.role !== "string" ||
      typeof rawEntry.mediaType !== "string" ||
      typeof rawEntry.originalStatus !== "string" ||
      ![
        "no-op",
        "add",
        "adopt",
        "fast-forward",
        "keep-local",
        "local-delete",
        "delete",
        "binary-replace",
        "semantic-merge",
        "move",
        "conflict",
      ].includes(rawEntry.originalStatus) ||
      (typeof rawEntry.conflictMetadataDigest !== "string" &&
        rawEntry.conflictMetadataDigest !== null) ||
      !Array.isArray(rawEntry.conflicts) ||
      rawEntry.conflicts.length > 8192 ||
      !isBoundedStringArray(rawEntry.appliedRemoteKeys) ||
      !isBoundedStringArray(rawEntry.preservedLocalKeys) ||
      !["unresolved", "take-local", "take-upstream", "manual"].includes(
        String(rawEntry.resolution),
      ) ||
      !digestMatchesPresence(rawEntry.basePresent, rawEntry.baseDigest) ||
      !digestMatchesPresence(rawEntry.localPresent, rawEntry.localDigest) ||
      !digestMatchesPresence(rawEntry.remotePresent, rawEntry.remoteDigest) ||
      !digestMatchesPresence(rawEntry.originalProposedPresent, rawEntry.originalProposedDigest) ||
      !digestMatchesPresence(rawEntry.currentProposedPresent, rawEntry.currentProposedDigest)
    ) {
      throw new CliError(`Conflict ${input.id} has malformed entry metadata.`, {
        code: "CLEAN_CONFLICT_INVALID",
        exitCode: 8,
        target: input.snapshot.root,
      });
    }
    assertPortableRelativePath(rawEntry.target, "Conflict cleanup target");
    assertPortableRelativePath(rawEntry.logicalPath, "Conflict cleanup logical path");
    if (
      rawEntry.key !==
      `target-${sha256(rawEntry.target).slice("sha256:".length, "sha256:".length + 32)}`
    ) {
      throw new CliError(`Conflict ${input.id} has an unsafe portable target key.`, {
        code: "CLEAN_CONFLICT_INVALID",
        exitCode: 8,
        target: input.snapshot.root,
      });
    }
    const portableTarget = rawEntry.target.normalize("NFC").toLocaleLowerCase("en-US");
    if (targets.has(portableTarget) || keys.has(rawEntry.key)) {
      throw new CliError(`Conflict ${input.id} repeats a portable target.`, {
        code: "CLEAN_PATH_COLLISION",
        exitCode: 8,
        target: input.snapshot.root,
      });
    }
    targets.add(portableTarget);
    keys.add(rawEntry.key);
    for (const conflict of rawEntry.conflicts) {
      if (!isRecord(conflict)) {
        throw new CliError(`Conflict ${input.id} contains malformed semantic evidence.`, {
          code: "CLEAN_CONFLICT_INVALID",
          exitCode: 8,
          target: input.snapshot.root,
        });
      }
      exactKeys(
        conflict,
        ["id", "reason", "base", "local", "remote", "detail"],
        `Conflict ${input.id} semantic evidence`,
      );
      if (
        typeof conflict.id !== "string" ||
        typeof conflict.reason !== "string" ||
        !(conflict.base === null || typeof conflict.base === "string") ||
        !(conflict.local === null || typeof conflict.local === "string") ||
        !(conflict.remote === null || typeof conflict.remote === "string") ||
        typeof conflict.detail !== "string"
      ) {
        throw new CliError(`Conflict ${input.id} contains malformed semantic evidence.`, {
          code: "CLEAN_CONFLICT_INVALID",
          exitCode: 8,
          target: input.snapshot.root,
        });
      }
    }
    const snapshotViews: readonly [
      "base" | "local" | "remote" | "proposed",
      boolean,
      Digest | null,
    ][] = [
      ["base", rawEntry.basePresent === true, rawEntry.baseDigest],
      ["local", rawEntry.localPresent === true, rawEntry.localDigest],
      ["remote", rawEntry.remotePresent === true, rawEntry.remoteDigest],
      ["proposed", rawEntry.originalProposedPresent === true, rawEntry.originalProposedDigest],
    ];
    for (const [view, present, expected] of snapshotViews) {
      expectedFiles.add(`${input.snapshot.root}/snapshots/${rawEntry.key}/${view}`);
      conflictSnapshotBytes(input.snapshot, input.id, rawEntry.key, view, present, expected);
    }
    if (rawEntry.originalStatus === "conflict") {
      conflictedTargets.push(rawEntry.target);
      for (const view of ["base", "local", "remote", "proposed", "conflict.json"]) {
        expectedFiles.add(`${input.snapshot.root}/conflicts/${rawEntry.key}/${view}`);
      }
      if (rawEntry.conflicts.length === 0) {
        throw new CliError(`Conflict ${input.id} lacks per-target semantic evidence.`, {
          code: "CLEAN_CONFLICT_INVALID",
          exitCode: 8,
          target: input.snapshot.root,
        });
      }
      if (
        typeof rawEntry.conflictMetadataDigest !== "string" ||
        !DIGEST.test(rawEntry.conflictMetadataDigest) ||
        sha256(
          fileFromSnapshot(
            input.snapshot,
            `${input.snapshot.root}/conflicts/${rawEntry.key}/conflict.json`,
          ),
        ) !== rawEntry.conflictMetadataDigest
      ) {
        throw new CliError(`Conflict ${input.id} per-target metadata is corrupt.`, {
          code: "CLEAN_CONFLICT_TAMPERED",
          exitCode: 8,
          target: input.snapshot.root,
        });
      }
      const proposal = fileFromSnapshot(
        input.snapshot,
        `${input.snapshot.root}/conflicts/${rawEntry.key}/proposed`,
      );
      if (
        (rawEntry.currentProposedPresent && sha256(proposal) !== rawEntry.currentProposedDigest) ||
        (!rawEntry.currentProposedPresent && proposal.byteLength !== 0)
      ) {
        throw new CliError(`Conflict ${input.id} current proposal is unrecorded or corrupt.`, {
          code: "CLEAN_CONFLICT_TAMPERED",
          exitCode: 8,
          target: input.snapshot.root,
        });
      }
      for (const view of ["base", "local", "remote"] as const) {
        const conflictBytes = fileFromSnapshot(
          input.snapshot,
          `${input.snapshot.root}/conflicts/${rawEntry.key}/${view}`,
        );
        const immutableBytes = fileFromSnapshot(
          input.snapshot,
          `${input.snapshot.root}/snapshots/${rawEntry.key}/${view}`,
        );
        if (!conflictBytes.equals(immutableBytes)) {
          throw new CliError(`Conflict ${input.id} per-target ${view} copy is corrupt.`, {
            code: "CLEAN_CONFLICT_TAMPERED",
            exitCode: 8,
            target: input.snapshot.root,
          });
        }
      }
    } else if (
      rawEntry.conflictMetadataDigest !== null ||
      rawEntry.conflicts.length !== 0 ||
      rawEntry.currentProposedDigest !== rawEntry.originalProposedDigest ||
      rawEntry.currentProposedPresent !== rawEntry.originalProposedPresent
    ) {
      throw new CliError(`Conflict ${input.id} has inconsistent non-conflict metadata.`, {
        code: "CLEAN_CONFLICT_INVALID",
        exitCode: 8,
        target: input.snapshot.root,
      });
    }
    if (digestOrNull(readProjectFile(input.root, rawEntry.target)) !== rawEntry.localDigest) {
      liveMatches = false;
    }
    if (rawEntry.baseDigest !== null) {
      const base = readProjectFile(input.root, basePath(rawEntry.baseDigest));
      if (base === null || sha256(base) !== rawEntry.baseDigest) liveMatches = false;
    }
  }
  if (
    !fileFromSnapshot(input.snapshot, `${input.snapshot.root}/README.md`).equals(
      expectedConflictReadme(input.id, conflictedTargets),
    )
  ) {
    throw new CliError(`Conflict ${input.id} README is unrecorded or corrupt.`, {
      code: "CLEAN_CONFLICT_TAMPERED",
      exitCode: 8,
      target: input.snapshot.root,
    });
  }
  const actualFiles = input.snapshot.files
    .map(({ path }) => path)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const wantedFiles = [...expectedFiles].sort((left, right) => left.localeCompare(right, "en-US"));
  const actualDirectories = [...input.snapshot.directories].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  if (
    JSON.stringify(actualFiles) !== JSON.stringify(wantedFiles) ||
    JSON.stringify(actualDirectories) !==
      JSON.stringify(expectedDirectories(input.snapshot.root, expectedFiles))
  ) {
    throw new CliError(`Conflict ${input.id} contains an unknown or missing artifact.`, {
      code: "CLEAN_CONFLICT_INVALID",
      exitCode: 8,
      target: input.snapshot.root,
    });
  }
  return liveMatches ? "active" : "stale";
}

function scanTransactions(input: {
  readonly root: string;
  readonly configDigest: Digest;
  readonly manifestDigest: Digest;
  readonly retention: number;
  readonly budget: ScanBudget;
}): {
  readonly transactions: readonly InternalCandidate[];
  readonly conflicts: readonly InternalCandidate[];
  readonly retainedTerminal: number;
  readonly activeTransactions: readonly string[];
  readonly activeConflicts: readonly string[];
} {
  const rootPath = ".mergora/transactions";
  const metadata = safeMetadata(input.root, rootPath);
  if (metadata === null) {
    return {
      transactions: [],
      conflicts: [],
      retainedTerminal: 0,
      activeTransactions: [],
      activeConflicts: [],
    };
  }
  if (!metadata.isDirectory()) {
    throw new CliError("Mergora transaction root is unsafe.", {
      code: "CLEAN_PATH_UNSAFE",
      exitCode: 5,
      target: rootPath,
    });
  }
  const terminal: TransactionInspection[] = [];
  const activeTransactions: string[] = [];
  const conflicts: InternalCandidate[] = [];
  const activeConflicts: string[] = [];
  for (const entry of directoryEntries(input.root, rootPath).sort((left, right) =>
    left.name.localeCompare(right.name, "en-US"),
  )) {
    const path = `${rootPath}/${entry.name}`;
    if (!TRANSACTION_ID.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) {
      throw new CliError(`Transaction entry ${path} is malformed or unsafe.`, {
        code: "CLEAN_TRANSACTION_INVALID",
        exitCode: 8,
        target: path,
      });
    }
    const snapshot = snapshotTree(input.root, path, input.budget);
    const hasTransaction = snapshot.files.some(
      ({ path: filePath }) => filePath === `${path}/transaction.json`,
    );
    const hasConflict = snapshot.files.some(
      ({ path: filePath }) => filePath === `${path}/conflict-state.json`,
    );
    if (hasTransaction === hasConflict) {
      throw new CliError(`Transaction entry ${path} has ambiguous or missing metadata.`, {
        code: "CLEAN_TRANSACTION_INVALID",
        exitCode: 8,
        target: path,
      });
    }
    if (hasTransaction) {
      const inspected = inspectStandardTransaction(entry.name, snapshot);
      if (TERMINAL_TRANSACTION_STATES.has(inspected.state)) terminal.push(inspected);
      else activeTransactions.push(entry.name);
    } else {
      const state = inspectConflictBundle({
        root: input.root,
        id: entry.name,
        snapshot,
        configDigest: input.configDigest,
        manifestDigest: input.manifestDigest,
      });
      if (state === "active") activeConflicts.push(entry.name);
      else {
        conflicts.push(
          candidate(
            "conflicts",
            snapshot,
            "Verified conflict bundle is resolved or its exact live preconditions are stale.",
          ),
        );
      }
    }
  }
  terminal.sort((left, right) => right.id.localeCompare(left.id, "en-US"));
  const retained = terminal.slice(0, input.retention);
  const removable = terminal
    .slice(input.retention)
    .map(({ snapshot }) =>
      candidate(
        "transactions",
        snapshot,
        `Terminal transaction is beyond the newest ${input.retention} retained record${input.retention === 1 ? "" : "s"}.`,
      ),
    );
  return {
    transactions: removable,
    conflicts,
    retainedTerminal: retained.length,
    activeTransactions: activeTransactions.sort((left, right) =>
      left.localeCompare(right, "en-US"),
    ),
    activeConflicts: activeConflicts.sort((left, right) => left.localeCompare(right, "en-US")),
  };
}

function selectedCategories(options: CleanOptions): readonly CleanCategory[] {
  return CLEAN_CATEGORIES.filter((category) => options[category] === true);
}

function lockDigest(root: string, ignoreLock: boolean): Digest | null {
  if (ignoreLock) return null;
  const metadata = safeMetadata(root, ".mergora/.lock");
  if (metadata === null) return null;
  if (!metadata.isFile() || metadata.size > MAX_JSON_BYTES) {
    throw new CliError("Mergora transaction lock is unsafe.", {
      code: "CLEAN_PATH_UNSAFE",
      exitCode: 5,
      target: ".mergora/.lock",
    });
  }
  return sha256(safeRead(root, ".mergora/.lock"));
}

function buildCleanInternal(options: CleanOptions, ignoreOwnLock = false): InternalCleanPlan {
  const root = validatedProjectRoot(options.projectRoot);
  const config = readMergoraConfig(root);
  if (config === null) {
    throw new CliError("Mergora is not initialized; run mergora init first.", {
      code: "CONFIG_MISSING",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const manifest = readManifest(root);
  const configDigest = sha256(canonicalJson(config));
  const manifestDigest = sha256(canonicalJson(manifest.value));
  const retention = options.retainTransactions ?? config.policy.retainSuccessfulTransactions;
  if (!Number.isSafeInteger(retention) || retention < 0 || retention > MAX_RETENTION) {
    throw new CliError(`Transaction retention must be an integer from 0 to ${MAX_RETENTION}.`, {
      code: "CLEAN_RETENTION_INVALID",
      exitCode: 2,
    });
  }
  const budget: ScanBudget = { nodes: 0, bytes: 0 };
  const cache = scanCache(root, budget);
  const bases = scanBases(root, manifest.value, budget);
  const transactions = scanTransactions({
    root,
    configDigest,
    manifestDigest,
    retention,
    budget,
  });
  const categories: Record<CleanCategory, readonly InternalCandidate[]> = {
    bases: bases.candidates,
    cache,
    conflicts: transactions.conflicts,
    transactions: transactions.transactions,
  };
  for (const category of CLEAN_CATEGORIES) {
    categories[category] = [...categories[category]].sort((left, right) =>
      left.public.path.localeCompare(right.public.path, "en-US"),
    );
  }
  const selectedCategoryList = selectedCategories(options);
  const selected = selectedCategoryList.flatMap((category) => categories[category]);
  const currentLock = lockDigest(root, ignoreOwnLock);
  const blockedReasons = [
    ...(currentLock === null
      ? []
      : ["An active or stale .mergora/.lock must be handled by recover before cleanup."]),
    ...(transactions.activeTransactions.length === 0
      ? []
      : [
          `Incomplete transaction ${transactions.activeTransactions[0]} must be recovered before cleanup.`,
        ]),
  ];
  const semantic = {
    schemaVersion: 1 as const,
    command: "clean" as const,
    cliVersion: CLI_VERSION,
    projectRoot: "." as const,
    configDigest,
    manifestPreconditionDigest: manifestDigest,
    retention: { terminalTransactions: retention },
    selectedCategories: selectedCategoryList,
    candidates: Object.fromEntries(
      CLEAN_CATEGORIES.map((category) => [
        category,
        categories[category].map(({ public: publicCandidate }) => publicCandidate),
      ]),
    ) as unknown as Readonly<Record<CleanCategory, readonly CleanCandidate[]>>,
    selected: selected.map(({ public: publicCandidate }) => publicCandidate),
    preserved: {
      referencedBases: bases.referenced,
      retainedTerminalTransactions: transactions.retainedTerminal,
      activeTransactions: transactions.activeTransactions,
      activeConflicts: transactions.activeConflicts,
    },
    blockedReasons,
    writesRequired: selected.length > 0,
    estimatedReclaimBytes: selected.reduce(
      (total, { public: publicCandidate }) => total + publicCandidate.bytes,
      0,
    ),
    rollbackAvailable: false as const,
    journalStrategy: "intent-before-atomic-move-then-unlink" as const,
    warnings: [
      "Cleanup is local-only and never includes live source, mergora.json, the current manifest, referenced bases, vendor bundles, credentials, or active conflicts.",
      ...(selected.length === 0
        ? ["Read-only report: select each desired category explicitly before apply."]
        : [
            "Cleanup has no rollback claim. An append-only local journal records intent before each atomic move and final unlink.",
          ]),
    ],
  };
  const plan: CleanPlan = { ...semantic, planDigest: sha256(canonicalJson(semantic)) };
  return { root, options, plan, selected };
}

export function planClean(options: CleanOptions): CleanPlan {
  return buildCleanInternal(options).plan;
}

interface CleanLock {
  readonly nonce: string;
  readonly transactionId: string;
}

function runtimeTransactionId(): string {
  const iso = new Date().toISOString();
  const sortable = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 23)}Z`;
  return `${sortable}-${randomBytes(16).toString("hex")}`;
}

function acquireCleanLock(root: string): CleanLock {
  assertNoSymlinkAncestors(root, ".mergora/.lock");
  const path = resolveInside(root, ".mergora/.lock", "Cleanup project lock");
  const nonce = randomBytes(16).toString("hex");
  const transactionId = runtimeTransactionId();
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new CliError("Another Mergora operation holds the project lock.", {
        code: "CLEAN_PROJECT_LOCKED",
        exitCode: 8,
        target: ".mergora/.lock",
      });
    }
    throw error;
  }
  try {
    writeFileSync(
      descriptor,
      canonicalJson({
        schemaVersion: 1,
        transactionId,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        nonce,
      }),
    );
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return { nonce, transactionId };
}

function releaseCleanLock(root: string, lock: CleanLock): void {
  const bytes = safeRead(root, ".mergora/.lock");
  const raw = parseJson(bytes, "Cleanup project lock");
  if (!isRecord(raw) || raw.transactionId !== lock.transactionId || raw.nonce !== lock.nonce) {
    throw new CliError("Cleanup project lock ownership changed unexpectedly.", {
      code: "CLEAN_PROJECT_LOCK_LOST",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  unlinkSync(resolveInside(root, ".mergora/.lock", "Cleanup project lock"));
}

function ensureDirectory(root: string, relativePath: string): void {
  const segments = assertPortableRelativePath(relativePath, "Cleanup journal directory");
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const metadata = lstatSync(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new CliError(`Cleanup journal directory ${relativePath} is unsafe.`, {
          code: "CLEAN_PATH_UNSAFE",
          exitCode: 5,
          target: relativePath,
        });
      }
    } catch (error) {
      if (error instanceof CliError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      mkdirSync(current, { mode: 0o700 });
    }
  }
}

function writeExclusive(root: string, relativePath: string, bytes: Uint8Array): void {
  assertPortableRelativePath(relativePath, "Cleanup journal file");
  ensureDirectory(root, dirname(relativePath).replaceAll("\\", "/"));
  assertNoSymlinkAncestors(root, relativePath);
  const path = resolveInside(root, relativePath, "Cleanup journal file");
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function appendJournal(root: string, relativePath: string, value: unknown): void {
  assertNoSymlinkAncestors(root, relativePath);
  const path = resolveInside(root, relativePath, "Cleanup journal");
  const descriptor = openSync(path, constants.O_APPEND | constants.O_WRONLY);
  try {
    writeFileSync(descriptor, `${canonicalJson(value)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function assertCandidateScope(candidateValue: CleanCandidate): void {
  const valid =
    (candidateValue.category === "cache" &&
      candidateValue.path.startsWith(".mergora/cache/entries/")) ||
    (candidateValue.category === "bases" &&
      /^\.mergora\/bases\/sha256\/[a-f0-9]{2}\/[a-f0-9]{62}\.blob$/u.test(candidateValue.path)) ||
    ((candidateValue.category === "transactions" || candidateValue.category === "conflicts") &&
      /^\.mergora\/transactions\/[0-9]{8}T[0-9]{6}(?:\.[0-9]{3})?Z-[a-f0-9]{32}$/u.test(
        candidateValue.path,
      ));
  if (!valid) {
    throw new CliError(`Cleanup candidate ${candidateValue.path} is outside its category scope.`, {
      code: "CLEAN_PATH_UNSAFE",
      exitCode: 5,
      target: candidateValue.path,
    });
  }
}

function verifyCandidate(root: string, candidateValue: InternalCandidate): TreeSnapshot {
  assertCandidateScope(candidateValue.public);
  const fresh = snapshotTree(root, candidateValue.public.path, { nodes: 0, bytes: 0 });
  if (
    fresh.digest !== candidateValue.public.preconditionDigest ||
    fresh.bytes !== candidateValue.public.bytes ||
    fresh.files.length !== candidateValue.public.files
  ) {
    throw new CliError(`Cleanup candidate ${candidateValue.public.path} changed after planning.`, {
      code: "CLEAN_PRECONDITION_STALE",
      exitCode: 8,
      target: candidateValue.public.path,
    });
  }
  return fresh;
}

function mappedMovedPath(snapshot: TreeSnapshot, movedRoot: string, originalPath: string): string {
  if (originalPath === snapshot.root) return movedRoot;
  if (!originalPath.startsWith(`${snapshot.root}/`)) {
    throw new CliError("Cleanup snapshot path escapes its candidate root.", {
      code: "CLEAN_PATH_UNSAFE",
      exitCode: 5,
    });
  }
  return `${movedRoot}/${originalPath.slice(snapshot.root.length + 1)}`;
}

function deleteMovedSnapshot(root: string, snapshot: TreeSnapshot, movedRoot: string): void {
  for (const file of snapshot.files) {
    const moved = mappedMovedPath(snapshot, movedRoot, file.path);
    const bytes = safeRead(root, moved);
    if (sha256(bytes) !== file.digest || bytes.byteLength !== file.bytes) {
      throw new CliError(`Cleanup trash artifact ${moved} failed digest verification.`, {
        code: "CLEAN_TRASH_TAMPERED",
        exitCode: 8,
        target: moved,
      });
    }
    unlinkSync(resolveInside(root, moved, "Cleanup trash artifact"));
  }
  for (const directory of [...snapshot.directories].sort((left, right) => {
    const depth = right.split("/").length - left.split("/").length;
    return depth === 0 ? right.localeCompare(left, "en-US") : depth;
  })) {
    const moved = mappedMovedPath(snapshot, movedRoot, directory);
    rmdirSync(resolveInside(root, moved, "Cleanup trash directory"));
  }
}

export function applyClean(options: CleanOptions, expectedPlanDigest: string): CleanResult {
  if (typeof expectedPlanDigest !== "string" || !DIGEST.test(expectedPlanDigest)) {
    throw new CliError("Cleanup apply requires the exact reviewed plan digest.", {
      code: "CLEAN_PLAN_DIGEST_REQUIRED",
      exitCode: 2,
    });
  }
  const internal = buildCleanInternal(options);
  if (internal.plan.planDigest !== expectedPlanDigest) {
    throw new CliError("Cleanup plan changed before apply; review a fresh exact plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  if (internal.plan.blockedReasons.length > 0 && internal.plan.writesRequired) {
    throw new CliError(internal.plan.blockedReasons[0]!, {
      code: "CLEAN_BLOCKED_ACTIVE_STATE",
      exitCode: 8,
      target: ".mergora",
    });
  }
  if (internal.selected.length === 0) {
    return {
      mode: "local-clean",
      status: "no-op",
      planDigest: internal.plan.planDigest,
      deleted: [],
      reclaimedBytes: 0,
      journal: null,
      rollbackAvailable: false,
    };
  }
  let lock: CleanLock | null = null;
  let primaryError: unknown = null;
  let result: CleanResult | null = null;
  const journalRoot = `.mergora/tmp/clean-${internal.plan.planDigest.slice("sha256:".length)}`;
  const journalPath = `${journalRoot}/journal.ndjson`;
  try {
    lock = acquireCleanLock(internal.root);
    const rechecked = buildCleanInternal(options, true);
    if (rechecked.plan.planDigest !== internal.plan.planDigest) {
      throw new CliError("Cleanup candidates changed while acquiring the project lock.", {
        code: "CLEAN_PRECONDITION_STALE",
        exitCode: 8,
      });
    }
    if (safeMetadata(internal.root, journalRoot) !== null) {
      throw new CliError("A cleanup journal already exists for this exact plan.", {
        code: "CLEAN_JOURNAL_EXISTS",
        exitCode: 8,
        target: journalRoot,
      });
    }
    ensureDirectory(internal.root, `${journalRoot}/trash`);
    writeExclusive(
      internal.root,
      journalPath,
      Buffer.from(
        `${canonicalJson({
          schemaVersion: 1,
          artifactKind: "mergora-clean-journal",
          planDigest: internal.plan.planDigest,
          rollbackAvailable: false,
          candidates: internal.plan.selected.map(({ category, path, preconditionDigest }) => ({
            category,
            path,
            preconditionDigest,
          })),
        })}\n`,
      ),
    );
    const deleted: string[] = [];
    let reclaimedBytes = 0;
    for (const [index, selected] of rechecked.selected.entries()) {
      const snapshot = verifyCandidate(internal.root, selected);
      const trashName = `item-${String(index).padStart(6, "0")}-${sha256(selected.public.path).slice("sha256:".length, "sha256:".length + 16)}`;
      const movedRoot = `${journalRoot}/trash/${trashName}`;
      appendJournal(internal.root, journalPath, {
        event: "delete-intent",
        category: selected.public.category,
        path: selected.public.path,
        preconditionDigest: selected.public.preconditionDigest,
        trash: movedRoot,
      });
      renameSync(
        resolveInside(internal.root, selected.public.path, "Cleanup candidate"),
        resolveInside(internal.root, movedRoot, "Cleanup trash target"),
      );
      appendJournal(internal.root, journalPath, {
        event: "moved",
        path: selected.public.path,
        trash: movedRoot,
      });
      deleteMovedSnapshot(internal.root, snapshot, movedRoot);
      appendJournal(internal.root, journalPath, {
        event: "deleted",
        path: selected.public.path,
        bytes: selected.public.bytes,
      });
      deleted.push(selected.public.path);
      reclaimedBytes += selected.public.bytes;
    }
    appendJournal(internal.root, journalPath, {
      event: "complete",
      deleted,
      reclaimedBytes,
    });
    result = {
      mode: "local-clean",
      status: "cleaned",
      planDigest: internal.plan.planDigest,
      deleted,
      reclaimedBytes,
      journal: journalPath,
      rollbackAvailable: false,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    if (lock !== null) {
      try {
        releaseCleanLock(internal.root, lock);
      } catch (releaseError) {
        if (primaryError === null) primaryError = releaseError;
      }
    }
  }
  if (primaryError !== null) throw primaryError;
  if (result === null) {
    throw new CliError("Cleanup ended without a result.", {
      code: "CLEAN_INTERNAL_ERROR",
      exitCode: 1,
    });
  }
  return result;
}
