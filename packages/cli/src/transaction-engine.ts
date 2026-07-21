import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  formatValidationErrors,
  validateSchemaDocument,
  type OperationPlanV1,
} from "mergora-schema";

import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  canonicalJson,
  CliError,
  portableSort,
  sha256,
} from "./contracts.js";
import type { PackageManager } from "./project-inspector.js";

export type TransactionState =
  | "planning"
  | "awaiting-consent"
  | "staged"
  | "validated"
  | "committing"
  | "post-validating"
  | "committed"
  | "rolled-back"
  | "conflicted"
  | "abandoned";

export interface OperationPlanFile {
  readonly operation:
    | "add"
    | "fast-forward"
    | "semantic-merge"
    | "keep-local"
    | "delete"
    | "local-delete"
    | "structured-patch"
    | "binary-replace"
    | "conflict"
    | "no-op";
  readonly target: string;
  readonly owner: string;
  readonly base: `sha256:${string}` | null;
  readonly local: `sha256:${string}` | null;
  readonly remote: `sha256:${string}` | null;
  readonly proposed: `sha256:${string}` | null;
  readonly mediaType: string;
  readonly risk: "ordinary" | "review-required" | "destructive" | "conflict" | "security-blocked";
  readonly reason: string;
}

export interface OperationPlanItem {
  readonly id: string;
  readonly direct: boolean;
  readonly requested: string;
  readonly fromVersion: string | null;
  readonly toVersion: string | null;
  readonly mode: "source" | "package";
}

export interface OperationPlanDependencyChange {
  readonly scope: "runtime" | "development";
  readonly package: string;
  readonly operation: "add" | "remove" | "change";
  readonly from: string | null;
  readonly to: string | null;
  readonly owners: readonly string[];
}

export type TransactionValidationLabel =
  | "schema"
  | "digest"
  | "path"
  | "collision"
  | "parse"
  | "type-imports"
  | "ownership"
  | "dependency"
  | "tokens"
  | "accessibility-contract"
  | "project-configured";

export interface OperationPlan {
  readonly schemaVersion: 1;
  readonly command:
    | "add"
    | "remove"
    | "recover"
    | "rollback"
    | "adopt"
    | "init"
    | "create"
    | "clean"
    | "update"
    | "resolve"
    | "doctor-fix"
    | "theme-apply"
    | "migrate"
    | "vendor"
    | "registry-enroll"
    | "registry-remove";
  readonly cliVersion: string;
  readonly projectRoot: ".";
  readonly configDigest: `sha256:${string}`;
  readonly manifestPreconditionDigest: `sha256:${string}` | null;
  readonly planDigest: `sha256:${string}`;
  readonly registries: readonly {
    readonly id: string;
    readonly identityDigest: `sha256:${string}`;
    readonly release: string;
    readonly manifestDigest: `sha256:${string}`;
    readonly source: "network" | "verified-cache" | "vendor" | "mirror";
    readonly trust: "official" | "enrolled" | "local-development";
    readonly evidenceTier: "complete" | "partial" | "not-supplied";
  }[];
  readonly items: readonly OperationPlanItem[];
  readonly fileOperations: readonly OperationPlanFile[];
  readonly dependencyChanges: readonly OperationPlanDependencyChange[];
  readonly structuredPatches: readonly {
    readonly id: string;
    readonly adapter:
      | "css-import"
      | "css-source"
      | "css-token-block"
      | "package-dependency"
      | "tsconfig-path"
      | "tsconfig-include"
      | "framework-config";
    readonly semanticKey: string;
    readonly target: string;
    readonly owner: string;
    readonly operation: "add" | "change" | "remove" | "no-op" | "conflict";
  }[];
  readonly migrations: readonly {
    readonly id: string;
    readonly adapter:
      | "rename-file"
      | "rename-export"
      | "rename-prop"
      | "rename-token"
      | "config-v1"
      | "mode-source-package-v1"
      | "manual-checklist";
    readonly phase: "remote" | "proposed";
  }[];
  readonly contractChanges: readonly {
    readonly item: string;
    readonly from: string | null;
    readonly to: string;
  }[];
  readonly warnings: readonly string[];
  readonly consentRequirements: readonly {
    readonly id: string;
    readonly flag: string;
    readonly reason: string;
  }[];
  readonly conflicts: readonly {
    readonly target: string;
    readonly kind:
      | "add-add"
      | "modify-modify"
      | "modify-delete"
      | "delete-modify"
      | "binary"
      | "ownership"
      | "structured-patch"
      | "parse"
      | "keep-region";
    readonly reason: string;
  }[];
  readonly estimatedBytes: { readonly download: number; readonly write: number };
  readonly validationSuite: readonly TransactionValidationLabel[];
  readonly rollbackAvailable: boolean;
}

export type OperationPlanWithoutDigest = Omit<OperationPlan, "planDigest">;

/**
 * Enforces the published, closed operation-plan v1 schema through the shared schema runtime.
 * This is the authority behind the built-in `schema` validation label.
 */
export function assertValidOperationPlanV1(value: unknown): asserts value is OperationPlanV1 {
  const result = validateSchemaDocument<OperationPlanV1>("operation-plan", value);
  if (result.ok) return;
  const safeErrors = result.errors.slice(0, 8).map(({ code, keyword }) => ({
    code,
    keyword,
    path: "",
    message: `Canonical operation-plan keyword ${keyword} failed.`,
  }));
  const details = formatValidationErrors(safeErrors).replaceAll("\n", "; ");
  throw new CliError(`Operation plan failed canonical v1 schema validation. ${details}`, {
    code: "OPERATION_PLAN_SCHEMA_INVALID",
    exitCode: 8,
  });
}

export function finalizeOperationPlan(plan: OperationPlanWithoutDigest): OperationPlan {
  const finalized = { ...plan, planDigest: sha256(canonicalJson(plan)) };
  assertValidOperationPlanV1(finalized);
  return finalized;
}

export interface TransactionMutation {
  readonly target: string;
  readonly content: Uint8Array | null;
  readonly beforeDigest: `sha256:${string}` | null;
  readonly manifest?: boolean | undefined;
}

export interface TransactionRegistryPayload {
  readonly registry: string;
  readonly release: string;
  readonly url: string;
  readonly digest: `sha256:${string}`;
}

export interface PackageManagerInvocation {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly cwd: string;
}

export type PackageManagerRunner = (invocation: PackageManagerInvocation) => {
  readonly status: number | null;
  readonly error?: Error | undefined;
};

export type TransactionFaultPoint =
  | "lock-acquired"
  | "transaction-created"
  | "stage-file"
  | "stage-complete"
  | "validation-complete"
  | "backup-file"
  | "backup-complete"
  | "commit-file"
  | "manifest-committed"
  | "package-manager-start"
  | "package-manager-complete"
  | "post-validation-complete"
  | "finalized";

export interface TransactionFaultContext {
  readonly transactionId: string;
  readonly target?: string | undefined;
}

export type TransactionFaultInjector = (
  point: TransactionFaultPoint,
  context: TransactionFaultContext,
) => void;

export type TransactionValidationPhase = "staged-overlay" | "post-commit";

export interface TransactionValidationIssue {
  readonly code: string;
  readonly target: string;
  readonly message: string;
}

export interface TransactionValidationResult {
  readonly state: "pass" | "fail";
  readonly summary: string;
  readonly issues?: readonly TransactionValidationIssue[] | undefined;
}

export interface TransactionValidationContext {
  readonly phase: TransactionValidationPhase;
  readonly projectRoot: string;
  readonly plan: OperationPlan;
  readonly mutationTargets: readonly string[];
  /** Reads the deterministic staged overlay in phase one and authoritative files in phase two. */
  readonly readFile: (target: string) => Buffer | null;
}

export interface TransactionValidator {
  readonly id: string;
  readonly label: TransactionValidationLabel;
  readonly validateStagedOverlay: (
    context: TransactionValidationContext,
  ) => TransactionValidationResult;
  readonly validatePostCommit: (
    context: TransactionValidationContext,
  ) => TransactionValidationResult;
}

export class TransactionInterruption extends CliError {
  public constructor(message = "The transaction was interrupted and requires recovery.") {
    super(message, { code: "TRANSACTION_INTERRUPTED", exitCode: 8 });
    this.name = "TransactionInterruption";
  }
}

interface StagedRecord {
  target: string;
  stagePath: string;
  digest: `sha256:${string}` | null;
  operation: "write" | "delete";
}

interface BackupRecord {
  readonly target: string;
  readonly backupPath: string;
  readonly digest: `sha256:${string}` | null;
}

interface TransactionRecord {
  schemaVersion: 1;
  transactionId: string;
  state: TransactionState;
  plan: { readonly path: string; readonly digest: `sha256:${string}` };
  preconditions: {
    readonly config: `sha256:${string}`;
    readonly manifest: `sha256:${string}` | null;
    readonly liveTargets: Record<string, `sha256:${string}` | null>;
  };
  registryPayloads: readonly TransactionRegistryPayload[];
  staged: StagedRecord[];
  backups: BackupRecord[];
  conflicts: readonly unknown[];
  consents: readonly {
    readonly id: string;
    readonly accepted: true;
    readonly flag: string;
    readonly planDigest: `sha256:${string}`;
  }[];
  resolutions: readonly unknown[];
  validations: { readonly id: string; readonly state: "pass" | "fail"; readonly summary: string }[];
  command: { readonly name: string; readonly redactedArguments: readonly string[] };
  packageManager: {
    readonly name: PackageManager | "none";
    invoked: boolean;
    exitCode: number | null;
  };
}

interface JournalEntry {
  readonly sequence: number;
  readonly recordedAt: string;
  readonly state: TransactionState;
  readonly checkpoint:
    | "inspection-complete"
    | "plan-complete"
    | "consent-recorded"
    | "lock-acquired"
    | "stage-written"
    | "validation-complete"
    | "backup-written"
    | "commit-target"
    | "manifest-committed"
    | "dependencies-complete"
    | "post-validation-complete"
    | "rollback-target"
    | "finalized";
  readonly target?: string | undefined;
  readonly preconditionDigest?: `sha256:${string}` | undefined;
  readonly postconditionDigest?: `sha256:${string}` | undefined;
  readonly recordDigest: `sha256:${string}`;
}

interface TransactionJournal {
  schemaVersion: 1;
  transactionId: string;
  state: TransactionState;
  entries: JournalEntry[];
}

interface LockHandle {
  readonly nonce: string;
  readonly transactionId: string;
}

export interface ExecuteTransactionOptions {
  readonly root: string;
  readonly plan: OperationPlan;
  readonly mutations: readonly TransactionMutation[];
  /** Exact consent IDs accepted for this finalized plan; an acceptance cannot be replayed on another plan. */
  readonly acceptedConsents: readonly {
    readonly id: string;
    readonly planDigest: OperationPlan["planDigest"];
  }[];
  readonly observedTargets?: Readonly<Record<string, `sha256:${string}` | null>> | undefined;
  readonly registryPayloads?: readonly TransactionRegistryPayload[] | undefined;
  readonly packageManager?: PackageManager | undefined;
  readonly packageManagerRequired?: boolean | undefined;
  readonly noInstall?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly commandArguments?: readonly string[] | undefined;
  readonly faultInjector?: TransactionFaultInjector | undefined;
  readonly validators?: readonly TransactionValidator[] | undefined;
}

export interface ValidateTransactionOverlayOptions {
  readonly root: string;
  readonly plan: OperationPlan;
  readonly mutations: readonly TransactionMutation[];
  readonly validators: readonly TransactionValidator[];
  readonly observedTargets?: Readonly<Record<string, `sha256:${string}` | null>> | undefined;
}

export interface TransactionResult {
  readonly transactionId: string | null;
  readonly state: "committed" | "no-op";
  readonly planDigest: `sha256:${string}`;
  readonly written: readonly string[];
  readonly deleted: readonly string[];
  readonly packageManager: {
    readonly name: PackageManager | "none";
    readonly invoked: boolean;
    readonly exitCode: number | null;
  };
  readonly recoveryCommand: string | null;
}

const TERMINAL_STATES = new Set<TransactionState>([
  "committed",
  "rolled-back",
  "conflicted",
  "abandoned",
]);
const TRANSACTION_STATES = new Set<TransactionState>([
  "planning",
  "awaiting-consent",
  "staged",
  "validated",
  "committing",
  "post-validating",
  "committed",
  "rolled-back",
  "conflicted",
  "abandoned",
]);
const TRANSACTION_ID_PATTERN = /^[0-9]{8}T[0-9]{6}(?:\.[0-9]{3})?Z-[0-9a-f]{32}$/u;
const MAX_TRANSACTION_VALIDATORS = 32;
const MAX_VALIDATION_READS = 8192;
const MAX_VALIDATION_FILE_BYTES = 16 * 1024 * 1024;
const MAX_VALIDATION_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_VALIDATION_ISSUES = 256;
const TRANSACTION_CONSENT_ID_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,255}$/u;
const TRANSACTION_CONSENT_FLAG_PATTERN =
  /^--[a-z0-9]+(?:-[a-z0-9]+)*(?:(?:=| )[A-Za-z0-9][A-Za-z0-9:._/-]*)?$/u;
const VALIDATION_LABEL_ORDER: readonly TransactionValidationLabel[] = [
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
];
/**
 * Labels implemented unconditionally by the transaction engine itself. `schema` covers the
 * operation-plan digest plus any mutated package and present provenance document shape;
 * `digest`, `path`, and `collision` cover the staged and committed mutation set; `ownership` and
 * `dependency` cover the target and dependency-owner graph whenever provenance is present. Every
 * other label must be backed by a command-owned validator registration before execution is
 * allowed.
 */
export const BUILT_IN_TRANSACTION_VALIDATIONS: readonly TransactionValidationLabel[] = [
  "schema",
  "digest",
  "path",
  "collision",
  "ownership",
  "dependency",
];
const VALIDATOR_REGISTRATION_PREFIX = "validator-registration-";

function validatorRegistrationId(validatorId: string): string {
  return `${VALIDATOR_REGISTRATION_PREFIX}${validatorId}`;
}

function validatorPhaseResultId(phase: TransactionValidationPhase, validatorId: string): string {
  return `${phase}-${validatorId}`;
}

function immutableCanonicalSnapshot<T>(value: T): T {
  const snapshot = JSON.parse(canonicalJson(value)) as T;
  const pending: unknown[] = [snapshot];
  let visited = 0;
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === null || typeof entry !== "object" || Object.isFrozen(entry)) continue;
    visited += 1;
    if (visited > 131_072) {
      throw new CliError("The transaction plan exceeds its deterministic object bound.", {
        code: "TRANSACTION_PLAN_INVALID",
        exitCode: 8,
      });
    }
    pending.push(...Object.values(entry));
    Object.freeze(entry);
  }
  return snapshot;
}

function immutableValidatorRegistrations(
  validators: readonly TransactionValidator[],
): readonly TransactionValidator[] {
  return Object.freeze(
    validators.map((validator) =>
      Object.freeze({
        id: validator.id,
        label: validator.label,
        validateStagedOverlay: validator.validateStagedOverlay,
        validatePostCommit: validator.validatePostCommit,
      }),
    ),
  );
}

function assertValidatorRegistrations(validators: readonly TransactionValidator[]): void {
  if (validators.length > MAX_TRANSACTION_VALIDATORS) {
    throw new CliError("The transaction registered too many validation callbacks.", {
      code: "TRANSACTION_VALIDATOR_INVALID",
      exitCode: 8,
    });
  }
  const identifiers = new Set<string>();
  for (const validator of validators) {
    if (
      !/^[a-z][a-z0-9-]{0,63}$/u.test(validator.id) ||
      identifiers.has(validator.id) ||
      !VALIDATION_LABEL_ORDER.includes(validator.label) ||
      typeof validator.validateStagedOverlay !== "function" ||
      typeof validator.validatePostCommit !== "function"
    ) {
      throw new CliError("A transaction validator registration is malformed or duplicated.", {
        code: "TRANSACTION_VALIDATOR_INVALID",
        exitCode: 8,
      });
    }
    identifiers.add(validator.id);
  }
}

function assertPlanValidatorBinding(
  plan: OperationPlan,
  validators: readonly TransactionValidator[],
): void {
  if (
    !Array.isArray(plan.validationSuite) ||
    new Set(plan.validationSuite).size !== plan.validationSuite.length ||
    plan.validationSuite.some((label) => !VALIDATION_LABEL_ORDER.includes(label))
  ) {
    throw new CliError("The reviewed transaction validation suite is malformed.", {
      code: "TRANSACTION_VALIDATOR_PLAN_MISMATCH",
      exitCode: 8,
    });
  }
  const reviewed = new Set(plan.validationSuite);
  const unexpected = validators.find(({ label }) => !reviewed.has(label));
  if (unexpected !== undefined) {
    throw new CliError(
      `Transaction validator ${unexpected.id} is absent from the reviewed validation suite.`,
      { code: "TRANSACTION_VALIDATOR_PLAN_MISMATCH", exitCode: 8 },
    );
  }
  const registeredLabels = new Set(validators.map(({ label }) => label));
  const missing = plan.validationSuite.find(
    (label) => !BUILT_IN_TRANSACTION_VALIDATIONS.includes(label) && !registeredLabels.has(label),
  );
  if (missing !== undefined) {
    throw new CliError(
      `Reviewed validation label ${missing} has no fixed validator registration.`,
      { code: "TRANSACTION_VALIDATOR_REQUIRED", exitCode: 8 },
    );
  }
}

export function validationSuiteForTransaction(
  validators: readonly TransactionValidator[] = [],
): readonly TransactionValidationLabel[] {
  assertValidatorRegistrations(validators);
  const labels = new Set<TransactionValidationLabel>([
    ...BUILT_IN_TRANSACTION_VALIDATIONS,
    ...validators.map(({ label }) => label),
  ]);
  return VALIDATION_LABEL_ORDER.filter((label) => labels.has(label));
}

const SAFE_RECORDED_FLAGS = new Set([
  "--dry-run",
  "--json",
  "--keep-files",
  "--no-format",
  "--no-install",
  "--non-interactive",
  "--offline",
  "--plan",
  "--yes",
]);

function transactionId(): string {
  const now = new Date();
  const iso = now.toISOString();
  const sortable = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 23)}Z`;
  return `${sortable}-${randomBytes(16).toString("hex")}`;
}

function portableTransactionRoot(id: string): string {
  return `.mergora/transactions/${id}`;
}

function safeLstat(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function ensureDirectory(root: string, relativePath: string): void {
  const segments = assertPortableRelativePath(relativePath, "Transaction directory");
  let current = root;
  let currentRelative = "";
  for (const segment of segments) {
    currentRelative = currentRelative === "" ? segment : `${currentRelative}/${segment}`;
    assertNoSymlinkAncestors(root, currentRelative);
    current = resolve(current, segment);
    const metadata = safeLstat(current);
    if (metadata === null) {
      mkdirSync(current, { mode: 0o700 });
      continue;
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new CliError(`Transaction directory ${JSON.stringify(currentRelative)} is unsafe.`, {
        code: "TRANSACTION_PATH_UNSAFE",
        exitCode: 5,
        target: currentRelative,
      });
    }
  }
}

function assertTargetsShareStageFilesystem(root: string, targets: readonly string[]): void {
  assertNoSymlinkAncestors(root, ".mergora");
  const stageMetadata = safeLstat(resolve(root, ".mergora"));
  if (stageMetadata === null || stageMetadata.isSymbolicLink() || !stageMetadata.isDirectory()) {
    throw new CliError("The Mergora staging root is unsafe.", {
      code: "TRANSACTION_PATH_UNSAFE",
      exitCode: 5,
      target: ".mergora",
    });
  }
  for (const target of portableSort(targets)) {
    const segments = assertPortableRelativePath(target, "Transaction target");
    let current = root;
    let currentMetadata = statSync(root);
    for (const segment of segments.slice(0, -1)) {
      current = resolve(current, segment);
      const metadata = safeLstat(current);
      if (metadata === null) break;
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new CliError(
          `Transaction target ${JSON.stringify(target)} has an unsafe parent directory.`,
          { code: "TRANSACTION_TARGET_UNSAFE", exitCode: 5, target },
        );
      }
      currentMetadata = metadata;
    }
    if (currentMetadata.dev !== stageMetadata.dev) {
      throw new CliError(
        `Transaction target ${JSON.stringify(target)} is not on the staging filesystem.`,
        { code: "TRANSACTION_FILESYSTEM_MISMATCH", exitCode: 8, target },
      );
    }
  }
}

function readProjectBytes(root: string, target: string, maximumBytes?: number): Buffer | null {
  assertPortableRelativePath(target, "Transaction target");
  assertNoSymlinkAncestors(root, target);
  const path = resolve(root, ...target.split("/"));
  const metadata = safeLstat(path);
  if (metadata === null) return null;
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new CliError(`Transaction target ${JSON.stringify(target)} is not a regular file.`, {
      code: "TRANSACTION_TARGET_UNSAFE",
      exitCode: 5,
      target,
    });
  }
  if (maximumBytes !== undefined && metadata.size > maximumBytes) {
    throw new CliError(`Transaction validation target ${JSON.stringify(target)} is oversized.`, {
      code: "TRANSACTION_VALIDATION_LIMIT_EXCEEDED",
      exitCode: 8,
      target,
    });
  }
  let descriptor: number | null = null;
  try {
    const flags =
      process.platform === "win32" ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NOFOLLOW;
    descriptor = openSync(path, flags);
    const opened = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      !current.isFile() ||
      opened.dev !== current.dev ||
      opened.ino !== current.ino
    ) {
      throw new CliError(
        `Transaction target ${JSON.stringify(target)} changed during no-follow inspection.`,
        {
          code: "TRANSACTION_TARGET_UNSAFE",
          exitCode: 5,
          target,
        },
      );
    }
    return readFileSync(descriptor);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function digestOrNull(value: Uint8Array | null): `sha256:${string}` | null {
  return value === null ? null : sha256(value);
}

function canonicalProjectJsonDigest(root: string, target: string): `sha256:${string}` | null {
  const bytes = readProjectBytes(root, target);
  if (bytes === null) return null;
  try {
    return sha256(canonicalJson(JSON.parse(bytes.toString("utf8")) as unknown));
  } catch {
    throw new CliError(`${target} is not valid canonicalizable JSON.`, {
      code: "PROJECT_JSON_INVALID",
      exitCode: 3,
      target,
    });
  }
}

function fsyncDirectory(path: string): void {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "EPERM" && code !== "EISDIR") throw error;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function renameWithRetry(from: string, to: string): void {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw error;
      if (attempt < 5)
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 * (attempt + 1));
    }
  }
  throw lastError;
}

function writeProjectBytes(
  root: string,
  target: string,
  content: Uint8Array,
  createMode = 0o644,
): void {
  assertPortableRelativePath(target, "Transaction target");
  const targetDirectory = target.includes("/") ? target.slice(0, target.lastIndexOf("/")) : "";
  if (targetDirectory !== "") ensureDirectory(root, targetDirectory);
  assertNoSymlinkAncestors(root, target);
  const path = resolve(root, ...target.split("/"));
  const existing = safeLstat(path);
  if (existing !== null && (existing.isSymbolicLink() || !existing.isFile())) {
    throw new CliError(`Refusing to replace unsafe transaction target ${JSON.stringify(target)}.`, {
      code: "TRANSACTION_TARGET_UNSAFE",
      exitCode: 5,
      target,
    });
  }
  const temporary = resolve(
    dirname(path),
    `${basename(path)}.mergora-${randomBytes(16).toString("hex")}.tmp`,
  );
  let descriptor: number | null = null;
  let pending = true;
  try {
    descriptor = openSync(temporary, "wx", existing === null ? createMode : existing.mode & 0o777);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    assertNoSymlinkAncestors(root, target);
    const current = safeLstat(path);
    if (
      (existing === null && current !== null) ||
      (existing !== null &&
        (current === null ||
          current.isSymbolicLink() ||
          !current.isFile() ||
          current.dev !== existing.dev ||
          current.ino !== existing.ino))
    ) {
      throw new CliError(
        `Transaction target ${JSON.stringify(target)} changed before atomic rename.`,
        {
          code: "TRANSACTION_TARGET_UNSAFE",
          exitCode: 5,
          target,
        },
      );
    }
    renameWithRetry(temporary, path);
    pending = false;
    fsyncDirectory(dirname(path));
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (pending && safeLstat(temporary) !== null) unlinkSync(temporary);
  }
}

function deleteProjectFile(root: string, target: string): void {
  assertNoSymlinkAncestors(root, target);
  const path = resolve(root, ...target.split("/"));
  const metadata = safeLstat(path);
  if (metadata === null) return;
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new CliError(`Refusing to delete unsafe transaction target ${JSON.stringify(target)}.`, {
      code: "TRANSACTION_TARGET_UNSAFE",
      exitCode: 5,
      target,
    });
  }
  assertNoSymlinkAncestors(root, target);
  const current = safeLstat(path);
  if (
    current === null ||
    current.isSymbolicLink() ||
    !current.isFile() ||
    current.dev !== metadata.dev ||
    current.ino !== metadata.ino
  ) {
    throw new CliError(`Transaction target ${JSON.stringify(target)} changed before deletion.`, {
      code: "TRANSACTION_TARGET_UNSAFE",
      exitCode: 5,
      target,
    });
  }
  unlinkSync(path);
  fsyncDirectory(dirname(path));
}

function redactArguments(arguments_: readonly string[]): readonly string[] {
  return arguments_.slice(0, 256).map((argument) => {
    if (!argument.startsWith("--")) return "<argument>";
    const equals = argument.indexOf("=");
    const flag = equals < 0 ? argument : argument.slice(0, equals);
    if (!SAFE_RECORDED_FLAGS.has(flag)) return "--<redacted>";
    return flag;
  });
}

interface LockRecord {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly pid: number;
  readonly startedAt: string;
  readonly nonce: string;
}

function parseLockBytes(bytes: Uint8Array): LockRecord {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    value = null;
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new CliError("The transaction lock record is invalid.", {
      code: "TRANSACTION_LOCK_STALE",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = ["nonce", "pid", "schemaVersion", "startedAt", "transactionId"];
  const startedAt = typeof record.startedAt === "string" ? record.startedAt : "";
  const validDate = (() => {
    try {
      return new Date(startedAt).toISOString() === startedAt;
    } catch {
      return false;
    }
  })();
  if (
    JSON.stringify(keys) !== JSON.stringify(expected) ||
    record.schemaVersion !== 1 ||
    typeof record.transactionId !== "string" ||
    !TRANSACTION_ID_PATTERN.test(record.transactionId) ||
    !Number.isInteger(record.pid) ||
    Number(record.pid) <= 0 ||
    !validDate ||
    typeof record.nonce !== "string" ||
    !/^[0-9a-f]{32}$/u.test(record.nonce)
  ) {
    throw new CliError("The transaction lock record is invalid.", {
      code: "TRANSACTION_LOCK_STALE",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  return record as unknown as LockRecord;
}

function lockPath(root: string): string {
  return resolve(root, ".mergora/.lock");
}

function acquireLock(root: string, id: string): LockHandle {
  ensureDirectory(root, ".mergora");
  assertNoSymlinkAncestors(root, ".mergora/.lock");
  const path = lockPath(root);
  const nonce = randomBytes(16).toString("hex");
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new CliError(
        "Another Mergora transaction holds the project lock; run mergora recover.",
        {
          code: "TRANSACTION_LOCKED",
          exitCode: 8,
          target: ".mergora/.lock",
        },
      );
    }
    throw error;
  }
  try {
    writeFileSync(
      descriptor,
      canonicalJson({
        schemaVersion: 1,
        transactionId: id,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        nonce,
      }),
    );
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  fsyncDirectory(resolve(root, ".mergora"));
  return { nonce, transactionId: id };
}

function releaseLock(root: string, lock: LockHandle): void {
  assertNoSymlinkAncestors(root, ".mergora/.lock");
  const path = lockPath(root);
  const metadata = safeLstat(path);
  if (metadata === null) return;
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new CliError("The Mergora transaction lock became unsafe.", {
      code: "TRANSACTION_LOCK_UNSAFE",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  const bytes = readProjectBytes(root, ".mergora/.lock");
  if (bytes === null) return;
  const value = parseLockBytes(bytes);
  if (value.nonce !== lock.nonce || value.transactionId !== lock.transactionId) {
    throw new CliError("The Mergora transaction lock ownership changed unexpectedly.", {
      code: "TRANSACTION_LOCK_STALE",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  const current = safeLstat(path);
  if (
    current === null ||
    current.isSymbolicLink() ||
    !current.isFile() ||
    current.dev !== metadata.dev ||
    current.ino !== metadata.ino
  ) {
    throw new CliError("The Mergora transaction lock changed before release.", {
      code: "TRANSACTION_LOCK_STALE",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  unlinkSync(path);
  fsyncDirectory(resolve(root, ".mergora"));
}

function mutationOrder(mutations: readonly TransactionMutation[]): readonly TransactionMutation[] {
  return [...mutations].sort((left, right) => {
    const manifest = Number(left.manifest === true) - Number(right.manifest === true);
    if (manifest !== 0) return manifest;
    const deletion = Number(left.content === null) - Number(right.content === null);
    return deletion !== 0 ? deletion : left.target.localeCompare(right.target, "en-US");
  });
}

function lockfileForManager(root: string, manager: PackageManager | undefined): string | null {
  if (manager === "pnpm") return "pnpm-lock.yaml";
  if (manager === "npm") return "package-lock.json";
  if (manager === "yarn") return "yarn.lock";
  if (manager === "bun") return existsSync(resolve(root, "bun.lock")) ? "bun.lock" : "bun.lockb";
  return null;
}

function managerInvocation(
  manager: PackageManager,
  root: string,
  offline: boolean,
  mode: "update-lockfile" | "frozen" = "update-lockfile",
): PackageManagerInvocation {
  if (manager === "pnpm") {
    return {
      executable: "pnpm",
      arguments: [
        "install",
        "--ignore-scripts",
        mode === "frozen" ? "--frozen-lockfile" : "--no-frozen-lockfile",
        ...(offline ? ["--offline"] : []),
      ],
      cwd: root,
    };
  }
  if (manager === "npm") {
    return {
      executable: "npm",
      arguments: [
        mode === "frozen" ? "ci" : "install",
        "--ignore-scripts",
        ...(offline ? ["--offline"] : []),
      ],
      cwd: root,
    };
  }
  if (manager === "yarn") {
    return {
      executable: "yarn",
      arguments: [
        "install",
        ...(mode === "frozen" ? ["--immutable"] : []),
        "--mode=skip-builds",
        ...(offline ? ["--immutable-cache"] : []),
      ],
      cwd: root,
    };
  }
  return {
    executable: "bun",
    arguments: [
      "install",
      "--ignore-scripts",
      ...(mode === "frozen" ? ["--frozen-lockfile"] : []),
      ...(offline ? ["--offline"] : []),
    ],
    cwd: root,
  };
}

function defaultPackageManagerRunner(invocation: PackageManagerInvocation) {
  let executable = invocation.executable;
  let arguments_ = [...invocation.arguments];
  if (process.platform === "win32" && ["npm", "pnpm", "yarn"].includes(invocation.executable)) {
    const corepack = resolve(
      dirname(process.execPath),
      "node_modules",
      "corepack",
      "dist",
      "corepack.js",
    );
    if (!existsSync(corepack)) {
      return {
        status: null,
        error: new Error(
          "The trusted Corepack executable is unavailable for package-manager invocation.",
        ),
      };
    }
    executable = process.execPath;
    arguments_ = [corepack, invocation.executable, ...arguments_];
  }
  const result = spawnSync(executable, arguments_, {
    cwd: invocation.cwd,
    shell: false,
    stdio: "inherit",
  });
  return { status: result.status, ...(result.error === undefined ? {} : { error: result.error }) };
}

function invokeFault(
  options: ExecuteTransactionOptions,
  point: TransactionFaultPoint,
  id: string,
  target?: string,
): void {
  options.faultInjector?.(point, {
    transactionId: id,
    ...(target === undefined ? {} : { target }),
  });
}

function recordPath(root: string, id: string): string {
  return `${portableTransactionRoot(id)}/transaction.json`;
}

function journalPath(root: string, id: string): string {
  return `${portableTransactionRoot(id)}/journal.json`;
}

function writeTransactionRecord(root: string, record: TransactionRecord): void {
  writeProjectBytes(
    root,
    recordPath(root, record.transactionId),
    Buffer.from(canonicalJson(record)),
    0o600,
  );
}

function writeJournal(root: string, journal: TransactionJournal): void {
  writeProjectBytes(
    root,
    journalPath(root, journal.transactionId),
    Buffer.from(canonicalJson(journal)),
    0o600,
  );
}

function appendJournal(
  root: string,
  journal: TransactionJournal,
  state: TransactionState,
  checkpoint: JournalEntry["checkpoint"],
  details: {
    readonly target?: string | undefined;
    readonly before?: `sha256:${string}` | null | undefined;
    readonly after?: `sha256:${string}` | null | undefined;
  } = {},
): void {
  const base = {
    sequence: journal.entries.length,
    recordedAt: new Date().toISOString(),
    state,
    checkpoint,
    ...(details.target === undefined ? {} : { target: details.target }),
    ...(details.before === null || details.before === undefined
      ? {}
      : { preconditionDigest: details.before }),
    ...(details.after === null || details.after === undefined
      ? {}
      : { postconditionDigest: details.after }),
  };
  journal.state = state;
  journal.entries.push({ ...base, recordDigest: sha256(canonicalJson(base)) });
  writeJournal(root, journal);
}

function assertPlanDigest(plan: OperationPlan): void {
  assertValidOperationPlanV1(plan);
  const { planDigest, ...semantic } = plan;
  if (sha256(canonicalJson(semantic)) !== planDigest) {
    throw new CliError("Operation plan digest is invalid; regenerate the plan.", {
      code: "PLAN_DIGEST_INVALID",
      exitCode: 8,
    });
  }
}

function assertAcceptedConsents(
  plan: OperationPlan,
  acceptedConsents: ExecuteTransactionOptions["acceptedConsents"],
): void {
  if (!Array.isArray(plan.consentRequirements) || !Array.isArray(acceptedConsents)) {
    throw new CliError("Transaction consent metadata is malformed.", {
      code: "TRANSACTION_CONSENT_INVALID",
      exitCode: 8,
    });
  }

  const required = new Map<string, OperationPlan["consentRequirements"][number]>();
  for (const rawRequirement of plan.consentRequirements) {
    const requirement = plainRecord(rawRequirement);
    if (
      requirement === null ||
      !hasExactKeys(requirement, ["id", "flag", "reason"]) ||
      typeof requirement.id !== "string" ||
      !TRANSACTION_CONSENT_ID_PATTERN.test(requirement.id) ||
      typeof requirement.flag !== "string" ||
      !TRANSACTION_CONSENT_FLAG_PATTERN.test(requirement.flag) ||
      requirement.flag.length > 1024 ||
      typeof requirement.reason !== "string" ||
      requirement.reason.length === 0 ||
      requirement.reason.length > 4096 ||
      required.has(requirement.id)
    ) {
      throw new CliError(
        "The operation plan contains malformed or duplicate consent requirements.",
        {
          code: "TRANSACTION_CONSENT_INVALID",
          exitCode: 8,
        },
      );
    }
    required.set(requirement.id, rawRequirement as OperationPlan["consentRequirements"][number]);
  }

  const accepted = new Set<string>();
  for (const rawAcceptance of acceptedConsents) {
    const acceptance = plainRecord(rawAcceptance);
    if (
      acceptance === null ||
      !hasExactKeys(acceptance, ["id", "planDigest"]) ||
      typeof acceptance.id !== "string" ||
      !TRANSACTION_CONSENT_ID_PATTERN.test(acceptance.id) ||
      !isDigest(acceptance.planDigest) ||
      accepted.has(acceptance.id)
    ) {
      throw new CliError("Transaction consent acceptance is malformed or duplicated.", {
        code: "TRANSACTION_CONSENT_INVALID",
        exitCode: 8,
      });
    }
    if (acceptance.planDigest !== plan.planDigest) {
      throw new CliError("Transaction consent was accepted for a stale operation plan.", {
        code: "PLAN_PRECONDITION_STALE",
        exitCode: 8,
      });
    }
    if (!required.has(acceptance.id)) {
      throw new CliError(
        `Transaction consent ${JSON.stringify(acceptance.id)} is not required by this plan.`,
        {
          code: "TRANSACTION_CONSENT_UNEXPECTED",
          exitCode: 8,
        },
      );
    }
    accepted.add(acceptance.id);
  }

  const missing = [...required.keys()].filter((id) => !accepted.has(id));
  if (missing.length > 0) {
    throw new CliError(
      `Transaction requires explicit consent for ${missing.map((id) => JSON.stringify(id)).join(", ")}.`,
      {
        code: "CONSENT_REQUIRED",
        exitCode: 12,
      },
    );
  }
}

function acceptedConsentsForReviewedPlan(
  plan: OperationPlan,
  reviewedPlanDigest: string,
): ExecuteTransactionOptions["acceptedConsents"] {
  if (reviewedPlanDigest !== plan.planDigest) return [];
  return plan.consentRequirements.map(({ id }) => ({ id, planDigest: plan.planDigest }));
}

function assertPortableMutationSet(mutations: readonly TransactionMutation[]): void {
  const targets = new Set<string>();
  for (const mutation of mutations) {
    assertPortableRelativePath(mutation.target, "Transaction target");
    const portable = mutation.target.normalize("NFC").toLocaleLowerCase("en-US");
    if (targets.has(portable)) {
      throw new CliError(
        `Transaction repeats portable target ${JSON.stringify(mutation.target)}.`,
        {
          code: "TRANSACTION_TARGET_COLLISION",
          exitCode: 5,
          target: mutation.target,
        },
      );
    }
    targets.add(portable);
    if ((mutation.target === ".mergora/manifest.json") !== (mutation.manifest === true)) {
      throw new CliError(
        "The provenance manifest must be identified explicitly so it is committed last.",
        {
          code: "TRANSACTION_MANIFEST_ORDER_INVALID",
          exitCode: 8,
          target: mutation.target,
        },
      );
    }
    const actual = digestOrNull(mutation.content);
    if (mutation.content !== null && actual === null) throw new Error("unreachable");
  }
}

function assertMutationPlanBinding(
  plan: OperationPlan,
  mutations: readonly TransactionMutation[],
): void {
  const operations = new Map<string, OperationPlanFile>();
  for (const operation of plan.fileOperations) {
    if (operations.has(operation.target)) {
      throw new CliError(`Operation plan repeats target ${operation.target}.`, {
        code: "PLAN_TARGET_COLLISION",
        exitCode: 8,
        target: operation.target,
      });
    }
    operations.set(operation.target, operation);
  }
  const structuredTargets = new Set(plan.structuredPatches.map(({ target }) => target));
  for (const mutation of mutations) {
    const proposed = digestOrNull(mutation.content);
    const operation = operations.get(mutation.target);
    if (operation !== undefined) {
      if (operation.local !== mutation.beforeDigest || operation.proposed !== proposed) {
        throw new CliError(`Mutation for ${mutation.target} does not match its reviewed plan.`, {
          code: "PLAN_MUTATION_MISMATCH",
          exitCode: 8,
          target: mutation.target,
        });
      }
      continue;
    }
    if (mutation.target === ".mergora/manifest.json" && mutation.manifest === true) continue;
    const baseMatch = /^\.mergora\/bases\/sha256\/([a-f0-9]{2})\/([a-f0-9]{62})\.blob$/u.exec(
      mutation.target,
    );
    if (
      baseMatch !== null &&
      mutation.content !== null &&
      proposed === `sha256:${baseMatch[1]}${baseMatch[2]}`
    ) {
      continue;
    }
    if (
      structuredTargets.has(mutation.target) ||
      (mutation.target === "package.json" && plan.dependencyChanges.length > 0)
    ) {
      continue;
    }
    throw new CliError(`Mutation target ${mutation.target} is absent from the reviewed plan.`, {
      code: "PLAN_MUTATION_MISMATCH",
      exitCode: 8,
      target: mutation.target,
    });
  }
  const mutationTargets = new Set(mutations.map(({ target }) => target));
  for (const operation of plan.fileOperations) {
    if (
      [
        "add",
        "fast-forward",
        "semantic-merge",
        "delete",
        "structured-patch",
        "binary-replace",
      ].includes(operation.operation) &&
      !mutationTargets.has(operation.target) &&
      !structuredTargets.has(operation.target)
    ) {
      throw new CliError(`Reviewed operation for ${operation.target} has no bound mutation.`, {
        code: "PLAN_MUTATION_MISMATCH",
        exitCode: 8,
        target: operation.target,
      });
    }
  }
}

function assertRegistryPayloads(payloads: readonly TransactionRegistryPayload[] | undefined): void {
  if ((payloads?.length ?? 0) > 4096) {
    throw new CliError("The transaction registry payload set exceeds the supported bound.", {
      code: "TRANSACTION_PAYLOAD_INVALID",
      exitCode: 5,
    });
  }
  for (const payload of payloads ?? []) {
    let url: URL;
    try {
      url = new URL(payload.url);
    } catch {
      throw new CliError("A transaction registry payload URL is invalid.", {
        code: "TRANSACTION_PAYLOAD_INVALID",
        exitCode: 5,
      });
    }
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(payload.registry) ||
      !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(
        payload.release,
      ) ||
      !/^sha256:[a-f0-9]{64}$/u.test(payload.digest)
    ) {
      throw new CliError(
        "Transaction registry provenance must be immutable HTTPS metadata without credentials, query parameters, or fragments.",
        { code: "TRANSACTION_PAYLOAD_INVALID", exitCode: 5 },
      );
    }
  }
}

function assertPreconditions(
  root: string,
  preconditions: Readonly<Record<string, `sha256:${string}` | null>>,
): void {
  for (const target of portableSort(Object.keys(preconditions))) {
    const actual = digestOrNull(readProjectBytes(root, target));
    if (actual !== preconditions[target]) {
      throw new CliError(`Transaction target ${JSON.stringify(target)} changed after planning.`, {
        code: "PLAN_TARGET_STALE",
        exitCode: 8,
        target,
      });
    }
  }
}

function assertGlobalPreconditions(root: string, plan: OperationPlan): void {
  const config = canonicalProjectJsonDigest(root, "mergora.json");
  const initializesMissingConfig =
    (plan.command === "init" || plan.command === "doctor-fix") &&
    config === null &&
    plan.fileOperations.some(
      (operation) =>
        operation.target === "mergora.json" &&
        operation.operation === "add" &&
        operation.base === null &&
        operation.local === null &&
        operation.proposed !== null,
    );
  if (config !== plan.configDigest && !initializesMissingConfig) {
    throw new CliError("mergora.json changed after operation planning.", {
      code: "PLAN_CONFIG_STALE",
      exitCode: 8,
      target: "mergora.json",
    });
  }
  const manifest = canonicalProjectJsonDigest(root, ".mergora/manifest.json");
  if (manifest !== plan.manifestPreconditionDigest) {
    throw new CliError("The provenance manifest changed after operation planning.", {
      code: "PLAN_MANIFEST_STALE",
      exitCode: 8,
      target: ".mergora/manifest.json",
    });
  }
}

function baseBlobPath(digest: `sha256:${string}`): string {
  const hexadecimal = digest.slice("sha256:".length);
  return `.mergora/bases/sha256/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}.blob`;
}

function transactionViewBytes(
  root: string,
  record: TransactionRecord,
  target: string,
  staged: boolean,
  maximumBytes?: number,
): Buffer | null {
  if (staged) {
    const entry = record.staged.find((candidate) => candidate.target === target);
    if (entry !== undefined) {
      if (entry.operation === "delete") return null;
      return readProjectBytes(root, entry.stagePath, maximumBytes);
    }
  }
  return readProjectBytes(root, target, maximumBytes);
}

function normalizedValidationResult(
  validator: TransactionValidator,
  phase: TransactionValidationPhase,
  value: TransactionValidationResult,
): TransactionValidationResult {
  if (
    (value.state !== "pass" && value.state !== "fail") ||
    typeof value.summary !== "string" ||
    value.summary.length === 0 ||
    value.summary.length > 2048 ||
    value.summary.includes("\0") ||
    (value.issues !== undefined &&
      (!Array.isArray(value.issues) || value.issues.length > MAX_VALIDATION_ISSUES))
  ) {
    throw new CliError(`Validator ${validator.id} returned an invalid ${phase} result.`, {
      code: "TRANSACTION_VALIDATOR_RESULT_INVALID",
      exitCode: 8,
    });
  }
  const issues: TransactionValidationIssue[] = [];
  for (const issue of value.issues ?? []) {
    if (
      issue === null ||
      typeof issue !== "object" ||
      !/^[A-Z][A-Z0-9_]{0,63}$/u.test(issue.code) ||
      typeof issue.target !== "string" ||
      typeof issue.message !== "string" ||
      issue.message.length === 0 ||
      issue.message.length > 1024 ||
      issue.message.includes("\0")
    ) {
      throw new CliError(`Validator ${validator.id} returned a malformed ${phase} issue.`, {
        code: "TRANSACTION_VALIDATOR_RESULT_INVALID",
        exitCode: 8,
      });
    }
    assertPortableRelativePath(issue.target, "Transaction validation issue target", {
      allowProjectRoot: true,
    });
    issues.push({
      code: issue.code,
      target: issue.target,
      message: `Validator ${validator.id} reported ${issue.code} during ${phase} validation.`,
    });
  }
  issues.sort(
    (left, right) =>
      left.target.localeCompare(right.target, "en-US") ||
      left.code.localeCompare(right.code, "en-US") ||
      left.message.localeCompare(right.message, "en-US"),
  );
  if (value.state === "pass" && issues.length > 0) {
    throw new CliError(`Validator ${validator.id} returned issues for a passing ${phase} result.`, {
      code: "TRANSACTION_VALIDATOR_RESULT_INVALID",
      exitCode: 8,
    });
  }
  return {
    state: value.state,
    summary: `Validator ${validator.id} ${value.state === "pass" ? "passed" : "failed"} ${phase} validation.`,
    ...(issues.length === 0 ? {} : { issues }),
  };
}

function validatorExceptionResult(
  validator: TransactionValidator,
  phase: TransactionValidationPhase,
  error: unknown,
): TransactionValidationResult {
  if (error instanceof CliError) {
    let target = ".";
    if (error.target !== undefined) {
      try {
        assertPortableRelativePath(error.target, "Transaction validator error target", {
          allowProjectRoot: true,
        });
        target = error.target;
      } catch {
        // An unsafe error target is replaced instead of exposing callback-controlled text.
      }
    }
    return {
      state: "fail",
      summary: `Validator ${validator.id} rejected ${phase} validation.`,
      issues: [
        {
          code: /^[A-Z][A-Z0-9_]{0,63}$/u.test(error.code) ? error.code : "VALIDATOR_REJECTED",
          target,
          message: `Validator ${validator.id} rejected ${phase} validation.`,
        },
      ],
    };
  }
  return {
    state: "fail",
    summary: `Validator ${validator.id} raised an unexpected error.`,
    issues: [
      {
        code: "VALIDATOR_EXCEPTION",
        target: ".",
        message: `Validator ${validator.id} did not return a ${phase} result.`,
      },
    ],
  };
}

function runRegisteredValidators(input: {
  readonly root: string;
  readonly plan: OperationPlan;
  readonly record: TransactionRecord;
  readonly phase: TransactionValidationPhase;
  readonly validators: readonly TransactionValidator[];
}): void {
  const cache = new Map<string, Buffer | null>();
  let totalBytes = 0;
  const staged = input.phase === "staged-overlay";
  const readFile = (target: string): Buffer | null => {
    assertPortableRelativePath(target, "Transaction validator read target");
    if (!cache.has(target)) {
      if (cache.size >= MAX_VALIDATION_READS) {
        throw new CliError("Transaction validation exceeded its deterministic read bound.", {
          code: "TRANSACTION_VALIDATION_LIMIT_EXCEEDED",
          exitCode: 8,
          target,
        });
      }
      const bytes = transactionViewBytes(
        input.root,
        input.record,
        target,
        staged,
        MAX_VALIDATION_FILE_BYTES,
      );
      totalBytes += bytes?.byteLength ?? 0;
      if (totalBytes > MAX_VALIDATION_TOTAL_BYTES) {
        throw new CliError("Transaction validation exceeded its deterministic byte bound.", {
          code: "TRANSACTION_VALIDATION_LIMIT_EXCEEDED",
          exitCode: 8,
          target,
        });
      }
      cache.set(target, bytes === null ? null : Buffer.from(bytes));
    }
    const cached = cache.get(target) ?? null;
    return cached === null ? null : Buffer.from(cached);
  };
  const context: TransactionValidationContext = Object.freeze({
    phase: input.phase,
    projectRoot: input.root,
    plan: input.plan,
    mutationTargets: Object.freeze(
      input.record.staged
        .map(({ target }) => target)
        .sort((left, right) => left.localeCompare(right, "en-US")),
    ),
    readFile,
  });
  for (const validator of [...input.validators].sort((left, right) =>
    left.id.localeCompare(right.id, "en-US"),
  )) {
    let rawResult: TransactionValidationResult;
    try {
      const validate = staged ? validator.validateStagedOverlay : validator.validatePostCommit;
      rawResult = validate(context);
    } catch (error) {
      rawResult = validatorExceptionResult(validator, input.phase, error);
    }
    const result = normalizedValidationResult(validator, input.phase, rawResult);
    input.record.validations.push({
      id: validatorPhaseResultId(input.phase, validator.id),
      state: result.state,
      summary: result.summary,
    });
    writeTransactionRecord(input.root, input.record);
    if (result.state === "fail") {
      const issue = result.issues?.[0];
      throw new CliError(`${result.summary}${issue === undefined ? "" : ` ${issue.message}`}`, {
        code:
          input.phase === "staged-overlay"
            ? "TRANSACTION_STAGED_VALIDATION_FAILED"
            : "TRANSACTION_POST_VALIDATION_FAILED",
        exitCode: 8,
        target: issue?.target ?? ".mergora/transactions",
      });
    }
  }
}

/**
 * Runs command-owned staged-overlay validators without creating a lock, transaction directory, or
 * any other project bytes. Planners use this to reject invalid proposed state before returning a
 * dry-run plan; authoritative execution repeats the same callbacks in both transaction phases.
 */
export function validateTransactionOverlay(inputOptions: ValidateTransactionOverlayOptions): void {
  const plan = immutableCanonicalSnapshot(inputOptions.plan);
  assertPlanDigest(plan);
  assertValidatorRegistrations(inputOptions.validators);
  const validators = immutableValidatorRegistrations(inputOptions.validators);
  assertPlanValidatorBinding(plan, validators);
  assertPortableMutationSet(inputOptions.mutations);
  assertMutationPlanBinding(plan, inputOptions.mutations);
  assertGlobalPreconditions(inputOptions.root, plan);
  const preconditions: Record<string, `sha256:${string}` | null> = {
    ...(inputOptions.observedTargets ?? {}),
  };
  for (const mutation of inputOptions.mutations)
    preconditions[mutation.target] = mutation.beforeDigest;
  assertPreconditions(inputOptions.root, preconditions);

  const overlay = new Map(
    inputOptions.mutations.map((mutation) => [
      mutation.target,
      mutation.content === null ? null : Buffer.from(mutation.content),
    ]),
  );
  const cache = new Map<string, Buffer | null>();
  let totalBytes = 0;
  const readFile = (target: string): Buffer | null => {
    assertPortableRelativePath(target, "Transaction validator read target");
    if (!cache.has(target)) {
      if (cache.size >= MAX_VALIDATION_READS) {
        throw new CliError("Transaction validation exceeded its deterministic read bound.", {
          code: "TRANSACTION_VALIDATION_LIMIT_EXCEEDED",
          exitCode: 8,
          target,
        });
      }
      const overlaid = overlay.get(target);
      const bytes = overlay.has(target)
        ? overlaid
        : readProjectBytes(inputOptions.root, target, MAX_VALIDATION_FILE_BYTES);
      totalBytes += bytes?.byteLength ?? 0;
      if (
        (bytes?.byteLength ?? 0) > MAX_VALIDATION_FILE_BYTES ||
        totalBytes > MAX_VALIDATION_TOTAL_BYTES
      ) {
        throw new CliError("Transaction validation exceeded its deterministic byte bound.", {
          code: "TRANSACTION_VALIDATION_LIMIT_EXCEEDED",
          exitCode: 8,
          target,
        });
      }
      cache.set(target, bytes === null || bytes === undefined ? null : Buffer.from(bytes));
    }
    const cached = cache.get(target) ?? null;
    return cached === null ? null : Buffer.from(cached);
  };
  const context: TransactionValidationContext = Object.freeze({
    phase: "staged-overlay" as const,
    projectRoot: inputOptions.root,
    plan,
    mutationTargets: Object.freeze(
      inputOptions.mutations
        .map(({ target }) => target)
        .sort((left, right) => left.localeCompare(right, "en-US")),
    ),
    readFile,
  });
  const packageChanged = inputOptions.mutations.some(({ target }) => target === "package.json");
  assertStructuredView(
    (target) => (target === "package.json" && !packageChanged ? null : readFile(target)),
    (target) => target,
  );
  for (const validator of [...validators].sort((left, right) =>
    left.id.localeCompare(right.id, "en-US"),
  )) {
    let rawResult: TransactionValidationResult;
    try {
      rawResult = validator.validateStagedOverlay(context);
    } catch (error) {
      rawResult = validatorExceptionResult(validator, "staged-overlay", error);
    }
    const result = normalizedValidationResult(validator, "staged-overlay", rawResult);
    if (result.state === "fail") {
      const issue = result.issues?.[0];
      throw new CliError(`${result.summary}${issue === undefined ? "" : ` ${issue.message}`}`, {
        code: "TRANSACTION_STAGED_VALIDATION_FAILED",
        exitCode: 8,
        target: issue?.target ?? ".",
      });
    }
  }
}

function assertStructuredView(
  readFile: (target: string) => Buffer | null,
  validationTarget: (target: string) => string,
): void {
  const packageBytes = readFile("package.json");
  if (packageBytes !== null) {
    let packageValue: unknown;
    try {
      packageValue = JSON.parse(packageBytes.toString("utf8")) as unknown;
    } catch {
      packageValue = null;
    }
    if (plainRecord(packageValue) === null) {
      throw new CliError("The transaction package.json post-state is invalid.", {
        code: "TRANSACTION_STAGE_INVALID",
        exitCode: 8,
        target: validationTarget("package.json"),
      });
    }
  }

  const manifestBytes = readFile(".mergora/manifest.json");
  if (manifestBytes === null) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestBytes.toString("utf8")) as unknown;
    canonicalJson(parsed);
  } catch {
    parsed = null;
  }
  const manifest = plainRecord(parsed);
  const distributionKeys = [
    "configDigest",
    "defaultMode",
    "packageName",
    "releases",
    "dependencyOwnership",
    "patchOwnership",
  ] as const;
  const presentDistributionKeys =
    manifest === null ? [] : distributionKeys.filter((key) => Object.hasOwn(manifest, key));
  const distributionAware = presentDistributionKeys.length === distributionKeys.length;
  if (
    manifest === null ||
    (presentDistributionKeys.length !== 0 && !distributionAware) ||
    !hasExactKeys(manifest, [
      "$schema",
      "schemaVersion",
      "projectId",
      "toolchain",
      "items",
      "sharedTargets",
      "dependencyOwners",
      ...presentDistributionKeys,
    ]) ||
    manifest.schemaVersion !== 1 ||
    manifest.$schema !==
      "https://akhiltrivedix.github.io/mergora/r/v1/schemas/manifest-v1.schema.json" ||
    !isDigest(manifest.projectId)
  ) {
    throw new CliError("The transaction provenance manifest post-state is invalid.", {
      code: "TRANSACTION_PROVENANCE_INVALID",
      exitCode: 8,
      target: ".mergora/manifest.json",
    });
  }
  const items = plainRecord(manifest.items);
  const sharedTargets = plainRecord(manifest.sharedTargets);
  const dependencyOwners = plainRecord(manifest.dependencyOwners);
  if (
    items === null ||
    sharedTargets === null ||
    dependencyOwners === null ||
    Object.keys(items).length > 4096
  ) {
    throw new CliError("The transaction provenance ownership graph is invalid.", {
      code: "TRANSACTION_PROVENANCE_INVALID",
      exitCode: 8,
      target: ".mergora/manifest.json",
    });
  }
  const ownedTargets = new Set<string>();
  for (const [qualifiedId, rawItem] of Object.entries(items)) {
    const item = plainRecord(rawItem);
    const payload = plainRecord(item?.payload);
    const transformContext = plainRecord(item?.transformContext);
    if (
      item === null ||
      payload === null ||
      transformContext === null ||
      typeof item.registry !== "string" ||
      typeof item.itemId !== "string" ||
      qualifiedId !== `${item.registry}:${item.itemId}` ||
      typeof item.direct !== "boolean" ||
      (item.mode !== "source" && !(distributionAware && item.mode === "package")) ||
      !isDigest(item.transformContextDigest) ||
      sha256(canonicalJson(transformContext)) !== item.transformContextDigest ||
      !Array.isArray(item.files) ||
      item.files.length > 2048 ||
      !Array.isArray(item.registryDependencies) ||
      !Array.isArray(item.structuredPatches) ||
      typeof payload.url !== "string" ||
      !isDigest(payload.digest)
    ) {
      throw new CliError(`Provenance item ${qualifiedId} is invalid.`, {
        code: "TRANSACTION_PROVENANCE_INVALID",
        exitCode: 8,
        target: ".mergora/manifest.json",
      });
    }
    if (
      distributionAware &&
      (typeof item.releaseRef !== "string" ||
        !Array.isArray(item.packageClaims) ||
        !Array.isArray(item.importSubpaths) ||
        (item.mode === "source" &&
          (item.packageClaims.length !== 0 || item.importSubpaths.length !== 0)) ||
        (item.mode === "package" &&
          (item.files.some((rawFile) => {
            const file = plainRecord(rawFile);
            return file === null || (file.role !== "contract" && file.role !== "example");
          }) ||
            item.packageClaims.length === 0 ||
            item.importSubpaths.length === 0)))
    ) {
      throw new CliError(`Distribution ownership for ${qualifiedId} is invalid.`, {
        code: "TRANSACTION_PROVENANCE_INVALID",
        exitCode: 8,
        target: ".mergora/manifest.json",
      });
    }
    let payloadUrl: URL;
    try {
      payloadUrl = new URL(payload.url);
    } catch {
      throw new CliError(`Provenance item ${qualifiedId} has an invalid payload URL.`, {
        code: "TRANSACTION_PROVENANCE_INVALID",
        exitCode: 8,
        target: ".mergora/manifest.json",
      });
    }
    if (
      payloadUrl.protocol !== "https:" ||
      payloadUrl.username !== "" ||
      payloadUrl.password !== "" ||
      payloadUrl.search !== "" ||
      payloadUrl.hash !== ""
    ) {
      throw new CliError(`Provenance item ${qualifiedId} has an unsafe payload URL.`, {
        code: "TRANSACTION_PROVENANCE_INVALID",
        exitCode: 8,
        target: ".mergora/manifest.json",
      });
    }
    for (const dependency of item.registryDependencies) {
      if (typeof dependency !== "string" || items[dependency] === undefined) {
        throw new CliError(`Provenance item ${qualifiedId} has an invalid dependency closure.`, {
          code: "TRANSACTION_PROVENANCE_INVALID",
          exitCode: 8,
          target: ".mergora/manifest.json",
        });
      }
    }
    for (const rawFile of item.files) {
      const file = plainRecord(rawFile);
      if (
        file === null ||
        typeof file.target !== "string" ||
        !isDigest(file.base) ||
        !(file.installed === null || isDigest(file.installed)) ||
        file.executable !== false
      ) {
        throw new CliError(`Provenance item ${qualifiedId} has an invalid file record.`, {
          code: "TRANSACTION_PROVENANCE_INVALID",
          exitCode: 8,
          target: ".mergora/manifest.json",
        });
      }
      try {
        assertPortableRelativePath(file.target, "Provenance target");
      } catch {
        throw new CliError(`Provenance item ${qualifiedId} has an unsafe target.`, {
          code: "TRANSACTION_PROVENANCE_INVALID",
          exitCode: 8,
          target: ".mergora/manifest.json",
        });
      }
      const portableTarget = file.target.normalize("NFC").toLocaleLowerCase("en-US");
      if (ownedTargets.has(portableTarget)) {
        throw new CliError(`Provenance target ${file.target} has multiple owners.`, {
          code: "TRANSACTION_PROVENANCE_INVALID",
          exitCode: 8,
          target: file.target,
        });
      }
      ownedTargets.add(portableTarget);
      const blobTarget = baseBlobPath(file.base);
      const baseBytes = readFile(blobTarget);
      if (baseBytes === null || sha256(baseBytes) !== file.base) {
        throw new CliError(`Provenance base ${blobTarget} is missing or corrupt.`, {
          code: "TRANSACTION_PROVENANCE_INVALID",
          exitCode: 8,
          target: blobTarget,
        });
      }
    }
  }
  for (const [key, rawOwners] of Object.entries(dependencyOwners)) {
    if (
      !/^(?:runtime|development):(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(key) ||
      !Array.isArray(rawOwners) ||
      rawOwners.some((owner) => typeof owner !== "string" || items[owner] === undefined) ||
      new Set(rawOwners).size !== rawOwners.length
    ) {
      throw new CliError("The provenance dependency ownership graph is invalid.", {
        code: "TRANSACTION_PROVENANCE_INVALID",
        exitCode: 8,
        target: ".mergora/manifest.json",
      });
    }
  }
}

function assertStructuredState(root: string, record: TransactionRecord, staged: boolean): void {
  const packageChanged = record.staged.some(({ target }) => target === "package.json");
  assertStructuredView(
    (target) =>
      target === "package.json" && !packageChanged
        ? null
        : transactionViewBytes(root, record, target, staged),
    (target) =>
      staged
        ? (record.staged.find((entry) => entry.target === target)?.stagePath ?? target)
        : target,
  );
}

function transactionDirectoryIds(root: string): readonly string[] {
  const relative = ".mergora/transactions";
  assertNoSymlinkAncestors(root, relative);
  const directory = resolve(root, relative);
  const metadata = safeLstat(directory);
  if (metadata === null) return [];
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new CliError("The Mergora transaction directory is unsafe.", {
      code: "TRANSACTION_PATH_UNSAFE",
      exitCode: 5,
      target: relative,
    });
  }
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!TRANSACTION_ID_PATTERN.test(entry.name)) continue;
    assertNoSymlinkAncestors(root, `${relative}/${entry.name}`);
    if (!entry.isDirectory()) continue;
    result.push(entry.name);
  }
  return result.sort((left, right) => left.localeCompare(right, "en-US"));
}

function incompleteTransactionIds(root: string): readonly string[] {
  const result: string[] = [];
  for (const id of transactionDirectoryIds(root)) {
    if (readProjectBytes(root, recordPath(root, id)) === null) continue;
    const record = readTransactionRecord(root, id);
    if (!TERMINAL_STATES.has(record.state)) result.push(id);
  }
  return result;
}

function assertNoIncompleteTransactions(root: string): void {
  const incomplete = incompleteTransactionIds(root);
  if (incomplete.length > 0) {
    throw new CliError(
      `Incomplete transaction ${incomplete[0]} requires mergora recover before another mutation.`,
      { code: "TRANSACTION_RECOVERY_REQUIRED", exitCode: 8, target: ".mergora/transactions" },
    );
  }
}

function stagePathFor(id: string, target: string): string {
  return `${portableTransactionRoot(id)}/stage/${target}`;
}

function backupPathFor(id: string, target: string): string {
  return `${portableTransactionRoot(id)}/backup/${target}`;
}

function postPathFor(id: string, target: string): string {
  return `${portableTransactionRoot(id)}/post/${target}`;
}

function rollbackFromBackups(
  root: string,
  record: TransactionRecord,
  journal: TransactionJournal,
): void {
  for (const backup of [...record.backups].reverse()) {
    const expected = record.preconditions.liveTargets[backup.target] ?? null;
    if (backup.digest !== expected) {
      throw new CliError(`Transaction backup metadata for ${backup.target} is inconsistent.`, {
        code: "TRANSACTION_BACKUP_INVALID",
        exitCode: 8,
        target: backup.backupPath,
      });
    }
    let bytes: Buffer | null = null;
    if (backup.digest !== null) {
      bytes = readProjectBytes(root, backup.backupPath);
      if (bytes === null || sha256(bytes) !== backup.digest) {
        throw new CliError(`Transaction backup for ${backup.target} is missing or corrupt.`, {
          code: "TRANSACTION_BACKUP_INVALID",
          exitCode: 8,
          target: backup.backupPath,
        });
      }
    }
    appendJournal(root, journal, "rolled-back", "rollback-target", {
      target: backup.target,
      before: digestOrNull(readProjectBytes(root, backup.target)),
      after: expected,
    });
    if (backup.digest === null) deleteProjectFile(root, backup.target);
    else writeProjectBytes(root, backup.target, bytes!);
    if (digestOrNull(readProjectBytes(root, backup.target)) !== expected) {
      throw new CliError(`Rollback did not restore ${backup.target} byte-identically.`, {
        code: "TRANSACTION_ROLLBACK_FAILED",
        exitCode: 8,
        target: backup.target,
      });
    }
  }
  assertPreconditions(root, record.preconditions.liveTargets);
  assertStructuredState(root, record, false);
  record.state = "rolled-back";
  writeTransactionRecord(root, record);
  appendJournal(root, journal, "rolled-back", "finalized");
}

export function executeTransaction(inputOptions: ExecuteTransactionOptions): TransactionResult {
  if (!Array.isArray(inputOptions.acceptedConsents)) {
    throw new CliError("Transaction consent acceptance must be supplied explicitly.", {
      code: "TRANSACTION_CONSENT_INVALID",
      exitCode: 8,
    });
  }
  const plan = immutableCanonicalSnapshot(inputOptions.plan);
  assertPlanDigest(plan);
  const suppliedValidators = inputOptions.validators ?? [];
  assertValidatorRegistrations(suppliedValidators);
  const validators = immutableValidatorRegistrations(suppliedValidators);
  assertPlanValidatorBinding(plan, validators);
  const acceptedConsents = immutableCanonicalSnapshot(inputOptions.acceptedConsents);
  assertAcceptedConsents(plan, acceptedConsents);
  const options: ExecuteTransactionOptions = {
    ...inputOptions,
    plan,
    acceptedConsents,
    validators,
  };
  assertPortableMutationSet(options.mutations);
  assertRegistryPayloads(options.registryPayloads);
  assertMutationPlanBinding(options.plan, options.mutations);
  if (options.plan.conflicts.length > 0) {
    throw new CliError(
      "The operation plan contains ownership conflicts; live files are unchanged.",
      {
        code: "OPERATION_CONFLICT",
        exitCode: 6,
        target: options.plan.conflicts[0]!.target,
      },
    );
  }
  if (options.mutations.length === 0) {
    return {
      transactionId: null,
      state: "no-op",
      planDigest: options.plan.planDigest,
      written: [],
      deleted: [],
      packageManager: { name: "none", invoked: false, exitCode: null },
      recoveryCommand: null,
    };
  }
  assertNoIncompleteTransactions(options.root);
  assertGlobalPreconditions(options.root, options.plan);
  const preconditions: Record<string, `sha256:${string}` | null> = {
    ...(options.observedTargets ?? {}),
  };
  for (const mutation of options.mutations) preconditions[mutation.target] = mutation.beforeDigest;
  const mutableTargets: string[] = [];
  if (options.packageManagerRequired === true && options.noInstall !== true) {
    const lockfile = lockfileForManager(options.root, options.packageManager);
    if (lockfile !== null && !options.mutations.some(({ target }) => target === lockfile)) {
      preconditions[lockfile] = digestOrNull(readProjectBytes(options.root, lockfile));
      mutableTargets.push(lockfile);
    }
  }
  assertPreconditions(options.root, preconditions);
  const orderedMutations = mutationOrder(options.mutations);

  const id = transactionId();
  let lock: LockHandle | null = null;
  let record: TransactionRecord | null = null;
  let journal: TransactionJournal | null = null;
  let backupsComplete = false;
  let mutationStarted = false;
  let committed = false;
  try {
    lock = acquireLock(options.root, id);
    assertNoIncompleteTransactions(options.root);
    assertGlobalPreconditions(options.root, options.plan);
    assertPreconditions(options.root, preconditions);
    assertTargetsShareStageFilesystem(options.root, [
      ...orderedMutations.map(({ target }) => target),
      ...mutableTargets,
    ]);

    const transactionRoot = portableTransactionRoot(id);
    ensureDirectory(options.root, transactionRoot);
    ensureDirectory(options.root, `${transactionRoot}/stage`);
    ensureDirectory(options.root, `${transactionRoot}/backup`);
    ensureDirectory(options.root, `${transactionRoot}/post`);
    const planPath = `${transactionRoot}/plan.json`;

    const staged: StagedRecord[] = orderedMutations.map((mutation) => ({
      target: mutation.target,
      stagePath: stagePathFor(id, mutation.target),
      digest: digestOrNull(mutation.content),
      operation: mutation.content === null ? "delete" : "write",
    }));
    for (const target of mutableTargets) {
      staged.push({ target, stagePath: postPathFor(id, target), digest: null, operation: "write" });
    }
    record = {
      schemaVersion: 1,
      transactionId: id,
      state: "planning",
      plan: { path: planPath, digest: options.plan.planDigest },
      preconditions: {
        config: options.plan.configDigest,
        manifest: options.plan.manifestPreconditionDigest,
        liveTargets: Object.fromEntries(
          Object.entries(preconditions).sort(([left], [right]) =>
            left.localeCompare(right, "en-US"),
          ),
        ),
      },
      registryPayloads: options.registryPayloads ?? [],
      staged,
      backups: [],
      conflicts: [],
      consents: options.plan.consentRequirements.map(({ id: consentId, flag }) => {
        const acceptance = options.acceptedConsents.find(({ id: acceptedId }) => {
          return acceptedId === consentId;
        });
        if (acceptance === undefined) throw new Error("verified consent acceptance missing");
        return {
          id: consentId,
          accepted: true,
          flag,
          planDigest: acceptance.planDigest,
        };
      }),
      resolutions: [],
      validations: [...validators]
        .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
        .map((validator) => ({
          id: validatorRegistrationId(validator.id),
          state: "pass" as const,
          summary: `Registered ${validator.id} for staged-overlay and post-commit validation.`,
        })),
      command: {
        name: options.plan.command,
        redactedArguments: redactArguments(options.commandArguments ?? []),
      },
      packageManager: {
        name:
          options.packageManagerRequired === true && options.noInstall !== true
            ? (options.packageManager ?? "none")
            : "none",
        invoked: false,
        exitCode: null,
      },
    };
    journal = { schemaVersion: 1, transactionId: id, state: "planning", entries: [] };
    writeTransactionRecord(options.root, record);
    appendJournal(options.root, journal, "planning", "lock-acquired");
    writeProjectBytes(options.root, planPath, Buffer.from(canonicalJson(options.plan)), 0o600);
    const writtenPlan = readProjectBytes(options.root, planPath);
    if (writtenPlan === null || sha256(writtenPlan) !== sha256(canonicalJson(options.plan))) {
      throw new CliError("The transaction plan did not persist byte-identically.", {
        code: "TRANSACTION_PLAN_INVALID",
        exitCode: 8,
        target: planPath,
      });
    }
    appendJournal(options.root, journal, "planning", "plan-complete");
    appendJournal(options.root, journal, "planning", "consent-recorded");
    invokeFault(options, "lock-acquired", id);
    invokeFault(options, "transaction-created", id);

    for (const mutation of orderedMutations) {
      appendJournal(options.root, journal, "planning", "stage-written", {
        target: mutation.target,
        after: digestOrNull(mutation.content),
      });
      if (mutation.content !== null) {
        writeProjectBytes(options.root, stagePathFor(id, mutation.target), mutation.content, 0o600);
      }
      invokeFault(options, "stage-file", id, mutation.target);
    }
    record.state = "staged";
    writeTransactionRecord(options.root, record);
    appendJournal(options.root, journal, "staged", "stage-written");
    invokeFault(options, "stage-complete", id);

    for (const stagedFile of record.staged.filter(
      ({ target }) => !mutableTargets.includes(target),
    )) {
      if (stagedFile.operation === "delete") continue;
      const bytes = readProjectBytes(options.root, stagedFile.stagePath);
      if (bytes === null || sha256(bytes) !== stagedFile.digest) {
        throw new CliError(`Staged bytes for ${stagedFile.target} failed digest validation.`, {
          code: "TRANSACTION_STAGE_INVALID",
          exitCode: 8,
          target: stagedFile.stagePath,
        });
      }
    }
    assertStructuredState(options.root, record, true);
    record.validations.push(
      { id: "path", state: "pass", summary: "All staged targets are portable and no-follow." },
      { id: "digest", state: "pass", summary: "All staged bytes match their planned digests." },
      { id: "collision", state: "pass", summary: "No portable target collision exists." },
      {
        id: "provenance",
        state: "pass",
        summary: "The staged manifest, immutable bases, and dependency closure are coherent.",
      },
    );
    runRegisteredValidators({
      root: options.root,
      plan: options.plan,
      record,
      phase: "staged-overlay",
      validators,
    });
    record.state = "validated";
    writeTransactionRecord(options.root, record);
    appendJournal(options.root, journal, "validated", "validation-complete");
    invokeFault(options, "validation-complete", id);

    for (const target of portableSort(Object.keys(preconditions))) {
      const bytes = readProjectBytes(options.root, target);
      const backupPath = backupPathFor(id, target);
      const backupDigest = digestOrNull(bytes);
      appendJournal(options.root, journal, "validated", "backup-written", {
        target,
        before: backupDigest,
        after: backupDigest,
      });
      if (bytes !== null) writeProjectBytes(options.root, backupPath, bytes, 0o600);
      const persisted = readProjectBytes(options.root, backupPath);
      if (bytes !== null && (persisted === null || sha256(persisted) !== backupDigest)) {
        throw new CliError(`Transaction backup for ${target} failed digest validation.`, {
          code: "TRANSACTION_BACKUP_INVALID",
          exitCode: 8,
          target: backupPath,
        });
      }
      record.backups.push({ target, backupPath, digest: backupDigest });
      writeTransactionRecord(options.root, record);
      invokeFault(options, "backup-file", id, target);
    }
    backupsComplete = true;
    appendJournal(options.root, journal, "validated", "backup-written");
    invokeFault(options, "backup-complete", id);

    assertGlobalPreconditions(options.root, options.plan);
    assertPreconditions(options.root, preconditions);
    record.state = "committing";
    writeTransactionRecord(options.root, record);
    for (const mutation of orderedMutations) {
      const actual = digestOrNull(readProjectBytes(options.root, mutation.target));
      if (actual !== mutation.beforeDigest) {
        throw new CliError(`Transaction target ${mutation.target} became stale before commit.`, {
          code: "PLAN_TARGET_STALE",
          exitCode: 8,
          target: mutation.target,
        });
      }
      const plannedPost = digestOrNull(mutation.content);
      const checkpoint = mutation.manifest === true ? "manifest-committed" : "commit-target";
      appendJournal(options.root, journal, "committing", checkpoint, {
        target: mutation.target,
        before: mutation.beforeDigest,
        after: plannedPost,
      });
      mutationStarted = true;
      if (mutation.content === null) deleteProjectFile(options.root, mutation.target);
      else {
        const stagedBytes = readProjectBytes(options.root, stagePathFor(id, mutation.target));
        if (stagedBytes === null || sha256(stagedBytes) !== sha256(mutation.content)) {
          throw new CliError(`Staged target ${mutation.target} changed before commit.`, {
            code: "TRANSACTION_STAGE_INVALID",
            exitCode: 8,
            target: stagePathFor(id, mutation.target),
          });
        }
        writeProjectBytes(options.root, mutation.target, stagedBytes);
      }
      const post = digestOrNull(readProjectBytes(options.root, mutation.target));
      if (post !== plannedPost) {
        throw new CliError(
          `Committed target ${mutation.target} did not reach its planned digest.`,
          {
            code: "TRANSACTION_POST_VALIDATION_FAILED",
            exitCode: 8,
            target: mutation.target,
          },
        );
      }
      invokeFault(
        options,
        mutation.manifest === true ? "manifest-committed" : "commit-file",
        id,
        mutation.target,
      );
    }

    if (options.packageManagerRequired === true && options.noInstall !== true) {
      const manager = options.packageManager;
      if (manager === undefined) {
        throw new CliError("A package manager is required for dependency changes.", {
          code: "PACKAGE_MANAGER_UNDETECTED",
          exitCode: 9,
          target: "package.json",
        });
      }
      record.packageManager.invoked = true;
      writeTransactionRecord(options.root, record);
      appendJournal(options.root, journal, "committing", "dependencies-complete");
      invokeFault(options, "package-manager-start", id);
      const invocation = managerInvocation(
        manager,
        options.root,
        options.offline === true,
        options.plan.command === "rollback" ? "frozen" : "update-lockfile",
      );
      const runner = options.packageManagerRunner ?? defaultPackageManagerRunner;
      let result: ReturnType<PackageManagerRunner>;
      try {
        result = runner(invocation);
      } catch (error) {
        result = {
          status: null,
          error: error instanceof Error ? error : new Error("Package-manager runner failed."),
        };
      }
      if (
        result.status !== null &&
        (!Number.isInteger(result.status) || result.status < 0 || result.status > 255)
      ) {
        result = {
          status: null,
          error: new Error("Package-manager runner returned invalid status."),
        };
      }
      record.packageManager.exitCode = result.status;
      writeTransactionRecord(options.root, record);
      if (result.error !== undefined || result.status !== 0) {
        throw new CliError(
          `The ${manager} dependency operation failed; authoritative files will be restored.`,
          { code: "PACKAGE_MANAGER_FAILED", exitCode: 9, target: "package.json" },
        );
      }
      for (const target of mutableTargets) {
        const bytes = readProjectBytes(options.root, target);
        const stagedRecord = record.staged.find((entry) => entry.target === target)!;
        stagedRecord.digest = digestOrNull(bytes);
        stagedRecord.operation = bytes === null ? "delete" : "write";
        appendJournal(options.root, journal, "committing", "stage-written", {
          target,
          after: stagedRecord.digest,
        });
        if (bytes !== null) writeProjectBytes(options.root, stagedRecord.stagePath, bytes, 0o600);
        const persisted = readProjectBytes(options.root, stagedRecord.stagePath);
        if (bytes !== null && digestOrNull(persisted) !== stagedRecord.digest) {
          throw new CliError(`Package-manager post-state for ${target} was not retained safely.`, {
            code: "TRANSACTION_STAGE_INVALID",
            exitCode: 8,
            target: stagedRecord.stagePath,
          });
        }
      }
      writeTransactionRecord(options.root, record);
      appendJournal(options.root, journal, "committing", "dependencies-complete");
      invokeFault(options, "package-manager-complete", id);
    }

    record.state = "post-validating";
    writeTransactionRecord(options.root, record);
    for (const stagedFile of record.staged) {
      const actual = digestOrNull(readProjectBytes(options.root, stagedFile.target));
      if (actual !== stagedFile.digest) {
        throw new CliError(`Committed target ${stagedFile.target} failed post-validation.`, {
          code: "TRANSACTION_POST_VALIDATION_FAILED",
          exitCode: 8,
          target: stagedFile.target,
        });
      }
    }
    assertStructuredState(options.root, record, false);
    record.validations.push({
      id: "post-digest",
      state: "pass",
      summary: "Every authoritative post-state matches the staged digest.",
    });
    runRegisteredValidators({
      root: options.root,
      plan: options.plan,
      record,
      phase: "post-commit",
      validators,
    });
    writeTransactionRecord(options.root, record);
    appendJournal(options.root, journal, "post-validating", "post-validation-complete");
    invokeFault(options, "post-validation-complete", id);

    record.state = "committed";
    writeTransactionRecord(options.root, record);
    appendJournal(options.root, journal, "committed", "finalized");
    committed = true;
    invokeFault(options, "finalized", id);
    releaseLock(options.root, lock);
    lock = null;
    return {
      transactionId: id,
      state: "committed",
      planDigest: options.plan.planDigest,
      written: orderedMutations
        .filter(({ content }) => content !== null)
        .map(({ target }) => target),
      deleted: orderedMutations
        .filter(({ content }) => content === null)
        .map(({ target }) => target),
      packageManager: { ...record.packageManager },
      recoveryCommand: `mergora recover --transaction ${id}`,
    };
  } catch (error) {
    if (error instanceof TransactionInterruption) throw error;
    let rollbackError: unknown;
    if (!committed && record !== null && journal !== null) {
      try {
        if (backupsComplete && mutationStarted) rollbackFromBackups(options.root, record, journal);
        else {
          record.state = "rolled-back";
          writeTransactionRecord(options.root, record);
          appendJournal(options.root, journal, "rolled-back", "finalized");
        }
      } catch (caught) {
        rollbackError = caught;
      }
    }
    if (lock !== null && !(error instanceof TransactionInterruption)) {
      try {
        releaseLock(options.root, lock);
      } catch (caught) {
        rollbackError ??= caught;
      }
    }
    if (rollbackError !== undefined) {
      throw new CliError(
        "The transaction failed and automatic rollback could not prove byte-identical restoration; run mergora recover.",
        { code: "TRANSACTION_ROLLBACK_FAILED", exitCode: 8, target: ".mergora/transactions" },
      );
    }
    throw error;
  }
}

function isDigest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function invalidTransactionRecord(id: string): never {
  throw new CliError(`Transaction ${id} record is invalid.`, {
    code: "TRANSACTION_RECORD_INVALID",
    exitCode: 8,
    target: recordPath("", id),
  });
}

function readTransactionRecord(root: string, id: string): TransactionRecord {
  if (!TRANSACTION_ID_PATTERN.test(id)) invalidTransactionRecord(id);
  const bytes = readProjectBytes(root, recordPath(root, id));
  if (bytes === null) {
    throw new CliError(`Transaction ${id} has no record.`, {
      code: "TRANSACTION_RECORD_MISSING",
      exitCode: 8,
      target: portableTransactionRoot(id),
    });
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    value = null;
  }
  const record = plainRecord(value);
  if (
    record === null ||
    !hasExactKeys(record, [
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
    ]) ||
    record.schemaVersion !== 1 ||
    record.transactionId !== id ||
    typeof record.state !== "string" ||
    !TRANSACTION_STATES.has(record.state as TransactionState) ||
    !Array.isArray(record.registryPayloads) ||
    !Array.isArray(record.staged) ||
    !Array.isArray(record.backups) ||
    !Array.isArray(record.conflicts) ||
    !Array.isArray(record.consents) ||
    !Array.isArray(record.resolutions) ||
    !Array.isArray(record.validations) ||
    record.staged.length > 8192 ||
    record.backups.length > 8192
  ) {
    invalidTransactionRecord(id);
  }
  const plan = plainRecord(record.plan);
  const preconditions = plainRecord(record.preconditions);
  const liveTargets = plainRecord(preconditions?.liveTargets);
  const command = plainRecord(record.command);
  const packageManager = plainRecord(record.packageManager);
  if (
    plan === null ||
    !hasExactKeys(plan, ["path", "digest"]) ||
    plan.path !== `${portableTransactionRoot(id)}/plan.json` ||
    !isDigest(plan.digest) ||
    preconditions === null ||
    !hasExactKeys(preconditions, ["config", "manifest", "liveTargets"]) ||
    !isDigest(preconditions.config) ||
    !(preconditions.manifest === null || isDigest(preconditions.manifest)) ||
    liveTargets === null ||
    Object.keys(liveTargets ?? {}).length > 8192 ||
    command === null ||
    !hasExactKeys(command, ["name", "redactedArguments"]) ||
    typeof command.name !== "string" ||
    !/^[a-z]+(?:-[a-z]+)*$/u.test(command.name) ||
    !Array.isArray(command.redactedArguments) ||
    command.redactedArguments.length > 256 ||
    command.redactedArguments.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.length > 1024 ||
        (argument !== "<argument>" &&
          argument !== "--<redacted>" &&
          !SAFE_RECORDED_FLAGS.has(argument)),
    ) ||
    packageManager === null ||
    !hasExactKeys(packageManager, ["name", "invoked", "exitCode"]) ||
    !["npm", "pnpm", "yarn", "bun", "none"].includes(String(packageManager.name)) ||
    typeof packageManager.invoked !== "boolean" ||
    !(
      packageManager.exitCode === null ||
      (Number.isInteger(packageManager.exitCode) &&
        Number(packageManager.exitCode) >= 0 &&
        Number(packageManager.exitCode) <= 255)
    )
  ) {
    invalidTransactionRecord(id);
  }
  const preconditionTargets = new Set<string>();
  for (const [target, digest] of Object.entries(liveTargets)) {
    try {
      assertPortableRelativePath(target, "Transaction precondition target");
    } catch {
      invalidTransactionRecord(id);
    }
    if (!(digest === null || isDigest(digest))) invalidTransactionRecord(id);
    preconditionTargets.add(target);
  }
  const stagedTargets = new Set<string>();
  for (const entry of record.staged) {
    const staged = plainRecord(entry);
    if (
      staged === null ||
      !hasExactKeys(staged, ["target", "stagePath", "digest", "operation"]) ||
      typeof staged.target !== "string" ||
      typeof staged.stagePath !== "string" ||
      !(staged.digest === null || isDigest(staged.digest)) ||
      (staged.operation !== "write" && staged.operation !== "delete") ||
      (staged.operation === "delete" && staged.digest !== null) ||
      (staged.operation === "write" &&
        staged.digest === null &&
        staged.stagePath !== postPathFor(id, staged.target)) ||
      stagedTargets.has(staged.target) ||
      !preconditionTargets.has(staged.target) ||
      (staged.stagePath !== stagePathFor(id, staged.target) &&
        staged.stagePath !== postPathFor(id, staged.target))
    ) {
      invalidTransactionRecord(id);
    }
    try {
      assertPortableRelativePath(staged.target, "Transaction staged target");
      assertPortableRelativePath(staged.stagePath, "Transaction staged path");
    } catch {
      invalidTransactionRecord(id);
    }
    stagedTargets.add(staged.target);
  }
  const backupTargets = new Set<string>();
  for (const entry of record.backups) {
    const backup = plainRecord(entry);
    if (
      backup === null ||
      !hasExactKeys(backup, ["target", "backupPath", "digest"]) ||
      typeof backup.target !== "string" ||
      backup.backupPath !== backupPathFor(id, backup.target) ||
      !(backup.digest === null || isDigest(backup.digest)) ||
      backup.digest !== liveTargets[backup.target] ||
      backupTargets.has(backup.target)
    ) {
      invalidTransactionRecord(id);
    }
    backupTargets.add(backup.target);
  }
  const consentIds = new Set<string>();
  for (const entry of record.consents) {
    const consent = plainRecord(entry);
    if (
      consent === null ||
      !hasExactKeys(consent, ["id", "accepted", "flag", "planDigest"]) ||
      typeof consent.id !== "string" ||
      !TRANSACTION_CONSENT_ID_PATTERN.test(consent.id) ||
      consent.accepted !== true ||
      typeof consent.flag !== "string" ||
      !TRANSACTION_CONSENT_FLAG_PATTERN.test(consent.flag) ||
      consent.flag.length > 1024 ||
      !isDigest(consent.planDigest) ||
      consentIds.has(consent.id)
    ) {
      invalidTransactionRecord(id);
    }
    consentIds.add(consent.id);
  }
  try {
    assertRegistryPayloads(record.registryPayloads as TransactionRegistryPayload[]);
  } catch {
    invalidTransactionRecord(id);
  }
  return record as unknown as TransactionRecord;
}

function readRecordedPlan(root: string, record: TransactionRecord): OperationPlan {
  const bytes = readProjectBytes(root, record.plan.path);
  let plan: OperationPlan;
  try {
    plan = JSON.parse(bytes?.toString("utf8") ?? "null") as OperationPlan;
    assertPlanDigest(plan);
  } catch {
    throw new CliError(`Transaction ${record.transactionId} plan is missing or corrupt.`, {
      code: "TRANSACTION_PLAN_INVALID",
      exitCode: 8,
      target: record.plan.path,
    });
  }
  if (plan.planDigest !== record.plan.digest) {
    throw new CliError(
      `Transaction ${record.transactionId} plan digest does not match its record.`,
      {
        code: "TRANSACTION_PLAN_INVALID",
        exitCode: 8,
        target: record.plan.path,
      },
    );
  }
  if (
    record.consents.length !== plan.consentRequirements.length ||
    plan.consentRequirements.some((requirement, index) => {
      const consent = record.consents[index];
      return (
        consent === undefined ||
        consent.id !== requirement.id ||
        consent.flag !== requirement.flag ||
        consent.accepted !== true ||
        consent.planDigest !== plan.planDigest
      );
    })
  ) {
    invalidTransactionRecord(record.transactionId);
  }
  return plan;
}

function readTransactionJournal(root: string, id: string): TransactionJournal {
  const bytes = readProjectBytes(root, journalPath(root, id));
  if (bytes === null) {
    return { schemaVersion: 1, transactionId: id, state: "planning", entries: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    parsed = null;
  }
  const value = plainRecord(parsed);
  if (
    value === null ||
    !hasExactKeys(value, ["schemaVersion", "transactionId", "state", "entries"]) ||
    value.schemaVersion !== 1 ||
    value.transactionId !== id ||
    typeof value.state !== "string" ||
    !TRANSACTION_STATES.has(value.state as TransactionState) ||
    !Array.isArray(value.entries) ||
    value.entries.length > 65536
  ) {
    throw new CliError(`Transaction ${id} journal is invalid.`, {
      code: "TRANSACTION_JOURNAL_INVALID",
      exitCode: 8,
      target: journalPath(root, id),
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
  for (const [index, rawEntry] of value.entries.entries()) {
    const entry = plainRecord(rawEntry);
    if (
      entry === null ||
      !hasExactKeys(
        entry,
        ["sequence", "recordedAt", "state", "checkpoint", "recordDigest"],
        ["target", "preconditionDigest", "postconditionDigest"],
      ) ||
      entry.sequence !== index ||
      typeof entry.recordedAt !== "string" ||
      typeof entry.state !== "string" ||
      !TRANSACTION_STATES.has(entry.state as TransactionState) ||
      typeof entry.checkpoint !== "string" ||
      !checkpoints.has(entry.checkpoint) ||
      !isDigest(entry.recordDigest) ||
      !(entry.preconditionDigest === undefined || isDigest(entry.preconditionDigest)) ||
      !(entry.postconditionDigest === undefined || isDigest(entry.postconditionDigest))
    ) {
      throw new CliError(`Transaction ${id} journal is invalid.`, {
        code: "TRANSACTION_JOURNAL_INVALID",
        exitCode: 8,
        target: journalPath(root, id),
      });
    }
    try {
      if (new Date(entry.recordedAt).toISOString() !== entry.recordedAt) throw new Error();
      if (entry.target !== undefined) {
        if (typeof entry.target !== "string") throw new Error();
        assertPortableRelativePath(entry.target, "Transaction journal target");
      }
    } catch {
      throw new CliError(`Transaction ${id} journal is invalid.`, {
        code: "TRANSACTION_JOURNAL_INVALID",
        exitCode: 8,
        target: journalPath(root, id),
      });
    }
    const { recordDigest, ...semantic } = entry;
    if (sha256(canonicalJson(semantic)) !== recordDigest) {
      throw new CliError(`Transaction ${id} journal digest is invalid.`, {
        code: "TRANSACTION_JOURNAL_INVALID",
        exitCode: 8,
        target: journalPath(root, id),
      });
    }
  }
  if (
    value.entries.length > 0 &&
    (value.entries.at(-1) as Record<string, unknown>).state !== value.state
  ) {
    throw new CliError(`Transaction ${id} journal state is invalid.`, {
      code: "TRANSACTION_JOURNAL_INVALID",
      exitCode: 8,
      target: journalPath(root, id),
    });
  }
  return value as unknown as TransactionJournal;
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

function removeStaleLock(
  root: string,
  expectedTransaction: string,
  allowCurrentProcessLockForTesting: boolean,
): void {
  assertNoSymlinkAncestors(root, ".mergora/.lock");
  const path = lockPath(root);
  const metadata = safeLstat(path);
  if (metadata === null) return;
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new CliError("The recovery lock path is unsafe.", {
      code: "TRANSACTION_LOCK_UNSAFE",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  const bytes = readProjectBytes(root, ".mergora/.lock");
  if (bytes === null) return;
  const value = parseLockBytes(bytes);
  if (value.transactionId !== expectedTransaction) {
    throw new CliError("A different transaction owns the project lock.", {
      code: "TRANSACTION_LOCKED",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  const pid = value.pid;
  const mayBreakCurrentTestLock =
    allowCurrentProcessLockForTesting && process.env.NODE_ENV === "test" && pid === process.pid;
  if (processIsAlive(pid) && !mayBreakCurrentTestLock) {
    throw new CliError("The transaction lock owner is still active; recovery cannot proceed.", {
      code: "TRANSACTION_LOCKED",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  const current = safeLstat(path);
  if (
    current === null ||
    current.isSymbolicLink() ||
    !current.isFile() ||
    current.dev !== metadata.dev ||
    current.ino !== metadata.ino
  ) {
    throw new CliError("The transaction lock changed during recovery inspection.", {
      code: "TRANSACTION_LOCK_STALE",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  unlinkSync(path);
  fsyncDirectory(resolve(root, ".mergora"));
}

function recoverableTransactionIds(root: string): readonly string[] {
  const ids = new Set(incompleteTransactionIds(root));
  assertNoSymlinkAncestors(root, ".mergora/.lock");
  const path = lockPath(root);
  const metadata = safeLstat(path);
  if (metadata === null) return [...ids].sort((left, right) => left.localeCompare(right, "en-US"));
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new CliError("The recovery lock path is unsafe.", {
      code: "TRANSACTION_LOCK_UNSAFE",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  try {
    const bytes = readProjectBytes(root, ".mergora/.lock");
    if (bytes === null) return [...ids].sort((left, right) => left.localeCompare(right, "en-US"));
    const value = parseLockBytes(bytes);
    const recordBytes = readProjectBytes(root, recordPath(root, value.transactionId));
    if (recordBytes === null) ids.add(value.transactionId);
    else {
      const record = readTransactionRecord(root, value.transactionId);
      if (TERMINAL_STATES.has(record.state)) ids.add(value.transactionId);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("The recovery lock record is invalid.", {
      code: "TRANSACTION_LOCK_STALE",
      exitCode: 8,
      target: ".mergora/.lock",
    });
  }
  return [...ids].sort((left, right) => left.localeCompare(right, "en-US"));
}

export interface RecoveryPlan {
  readonly transactionId: string;
  readonly action: "rollback" | "resume" | "finalize";
  readonly plan: OperationPlan;
  readonly orphan?: true | undefined;
}

export interface RecoveryOptions {
  readonly root: string;
  readonly transactionId?: string | undefined;
  readonly strategy?: "auto" | "rollback" | "resume" | undefined;
  readonly allowCurrentProcessLockForTesting?: boolean | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly offline?: boolean | undefined;
}

function recoveryClassification(
  root: string,
  record: TransactionRecord,
): { readonly allPre: boolean; readonly allPost: boolean; readonly ambiguous: readonly string[] } {
  let allPre = true;
  let allPost = true;
  const ambiguous: string[] = [];
  for (const staged of record.staged) {
    const current = digestOrNull(readProjectBytes(root, staged.target));
    const pre = record.preconditions.liveTargets[staged.target] ?? null;
    const mutableUnknown = staged.operation === "write" && staged.digest === null;
    const matchesPre = current === pre;
    const matchesPost = !mutableUnknown && current === staged.digest;
    allPre &&= matchesPre;
    allPost &&= matchesPost;
    if (!matchesPre && !matchesPost && !mutableUnknown) ambiguous.push(staged.target);
  }
  return { allPre, allPost, ambiguous };
}

function pendingRegisteredPostValidators(record: TransactionRecord): readonly string[] {
  const registered = record.validations
    .filter(({ id }) => id.startsWith(VALIDATOR_REGISTRATION_PREFIX))
    .map(({ id }) => id.slice(VALIDATOR_REGISTRATION_PREFIX.length));
  return registered.filter(
    (validatorId) =>
      !record.validations.some(
        ({ id, state }) =>
          id === validatorPhaseResultId("post-commit", validatorId) && state === "pass",
      ),
  );
}

function recoveryAction(
  record: TransactionRecord,
  classification: ReturnType<typeof recoveryClassification>,
  strategy: RecoveryOptions["strategy"],
): "rollback" | "resume" | "finalize" {
  // Callback code is intentionally not serialized into provenance. An interrupted
  // process therefore cannot safely resume or finalize until every registered
  // post-commit callback already has a durable passing result.
  if (pendingRegisteredPostValidators(record).length > 0) return "rollback";
  if (strategy === "rollback") return "rollback";
  if (strategy === "resume") return "resume";
  if (
    classification.allPost &&
    record.packageManager.invoked &&
    record.packageManager.exitCode === 0
  )
    return "finalize";
  if (classification.allPost && record.packageManager.name === "none") return "finalize";
  return "rollback";
}

function assertOrphanTransactionIsPreMutation(root: string, id: string): void {
  if (readProjectBytes(root, journalPath(root, id)) !== null) {
    throw new CliError(
      `Transaction ${id} has a journal but no operation record; recovery is ambiguous.`,
      { code: "TRANSACTION_RECOVERY_AMBIGUOUS", exitCode: 8, target: portableTransactionRoot(id) },
    );
  }
  for (const name of ["stage", "backup", "post"] as const) {
    const relative = `${portableTransactionRoot(id)}/${name}`;
    assertNoSymlinkAncestors(root, relative);
    const directory = resolve(root, relative);
    const metadata = safeLstat(directory);
    if (metadata === null) continue;
    if (metadata.isSymbolicLink() || !metadata.isDirectory() || readdirSync(directory).length > 0) {
      throw new CliError(
        `Transaction ${id} has operation data but no durable record; recovery is ambiguous.`,
        { code: "TRANSACTION_RECOVERY_AMBIGUOUS", exitCode: 8, target: relative },
      );
    }
  }
}

export function planRecovery(options: RecoveryOptions): RecoveryPlan {
  const ids = recoverableTransactionIds(options.root);
  const id = options.transactionId ?? (ids.length === 1 ? ids[0] : undefined);
  if (id === undefined || !ids.includes(id)) {
    throw new CliError(
      ids.length === 0
        ? "No incomplete transaction requires recovery."
        : "Select one incomplete transaction with --transaction.",
      { code: "TRANSACTION_RECOVERY_SELECTION_REQUIRED", exitCode: 8 },
    );
  }
  const recordBytes = readProjectBytes(options.root, recordPath(options.root, id));
  if (recordBytes === null) {
    assertOrphanTransactionIsPreMutation(options.root, id);
    const config =
      canonicalProjectJsonDigest(options.root, "mergora.json") ??
      sha256(
        canonicalJson({
          schemaVersion: 1,
          state: "missing",
          target: "mergora.json",
        }),
      );
    const plan = finalizeOperationPlan({
      schemaVersion: 1,
      command: "recover",
      cliVersion: "1.0.0",
      projectRoot: ".",
      configDigest: config,
      manifestPreconditionDigest: canonicalProjectJsonDigest(
        options.root,
        ".mergora/manifest.json",
      ),
      registries: [],
      items: [],
      fileOperations: [],
      dependencyChanges: [],
      structuredPatches: [],
      migrations: [],
      contractChanges: [],
      warnings: [
        `Recovery will abandon pre-mutation transaction ${id}; no authoritative target was staged or backed up.`,
      ],
      consentRequirements: [
        {
          id: "recover-transaction",
          flag: "--yes",
          reason: "Recovery releases a classified orphan transaction lock.",
        },
      ],
      conflicts: [],
      estimatedBytes: { download: 0, write: 0 },
      validationSuite: ["schema", "digest", "path", "collision", "ownership"],
      rollbackAvailable: false,
    });
    return { transactionId: id, action: "rollback", plan, orphan: true };
  }
  const record = readTransactionRecord(options.root, id);
  const originalPlan = readRecordedPlan(options.root, record);
  const classification = recoveryClassification(options.root, record);
  if (classification.ambiguous.length > 0) {
    throw new CliError(
      `Recovery is ambiguous because ${classification.ambiguous[0]} matches neither recorded state.`,
      { code: "TRANSACTION_RECOVERY_AMBIGUOUS", exitCode: 8, target: classification.ambiguous[0]! },
    );
  }
  const action = recoveryAction(record, classification, options.strategy);
  const fileOperations: OperationPlanFile[] = record.staged.map((staged) => ({
    operation:
      action === "rollback"
        ? record.preconditions.liveTargets[staged.target] === null
          ? "delete"
          : "fast-forward"
        : staged.operation === "delete"
          ? "delete"
          : "fast-forward",
    target: staged.target,
    owner: originalPlan.items[0]?.id ?? "official:recovery",
    base: record.preconditions.liveTargets[staged.target] ?? null,
    local: digestOrNull(readProjectBytes(options.root, staged.target)),
    remote: staged.digest,
    proposed:
      action === "rollback"
        ? (record.preconditions.liveTargets[staged.target] ?? null)
        : staged.digest,
    mediaType: "application/octet-stream",
    risk: "review-required",
    reason: `${action} interrupted transaction ${id} using recorded digests and backups.`,
  }));
  let config = canonicalProjectJsonDigest(options.root, "mergora.json");
  if (
    config === null &&
    originalPlan.command === "init" &&
    record.preconditions.liveTargets["mergora.json"] === null
  ) {
    // First-run init records the proposed canonical config digest in its plan while
    // the exact missing pre-state remains authoritative in liveTargets. Recovery
    // can therefore plan an exact rollback before mergora.json has been committed.
    config = originalPlan.configDigest;
  }
  if (config === null) {
    throw new CliError("mergora.json is missing.", { code: "CONFIG_MISSING", exitCode: 3 });
  }
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "recover",
    cliVersion: originalPlan.cliVersion,
    projectRoot: ".",
    configDigest: config,
    manifestPreconditionDigest: canonicalProjectJsonDigest(options.root, ".mergora/manifest.json"),
    registries: originalPlan.registries,
    items: originalPlan.items,
    fileOperations,
    dependencyChanges: originalPlan.dependencyChanges,
    structuredPatches: [],
    migrations: [],
    contractChanges: [],
    warnings: [`Recovery will ${action} transaction ${id}; no unrelated target is in scope.`],
    consentRequirements: [
      { id: "recover-transaction", flag: "--yes", reason: "Recovery mutates authoritative files." },
    ],
    conflicts: [],
    estimatedBytes: {
      download: 0,
      write: record.staged.reduce((total, staged) => {
        const bytes = readProjectBytes(options.root, staged.stagePath);
        return total + (bytes?.byteLength ?? 0);
      }, 0),
    },
    validationSuite: ["schema", "digest", "path", "collision", "ownership"],
    rollbackAvailable: action !== "rollback",
  });
  return { transactionId: id, action, plan };
}

export interface RecoveryResult {
  readonly transactionId: string;
  readonly state: "committed" | "rolled-back";
  readonly action: "rollback" | "resume" | "finalize";
  readonly planDigest: `sha256:${string}`;
}

export function recoverTransaction(
  options: RecoveryOptions,
  expectedPlanDigest: string,
): RecoveryResult {
  const planned = planRecovery(options);
  if (expectedPlanDigest !== planned.plan.planDigest) {
    throw new CliError("Recovery plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  const acceptedConsents = acceptedConsentsForReviewedPlan(planned.plan, expectedPlanDigest);
  assertAcceptedConsents(planned.plan, acceptedConsents);
  if (planned.orphan === true) {
    if (readProjectBytes(options.root, recordPath(options.root, planned.transactionId)) !== null) {
      throw new CliError("The orphan recovery precondition changed; review a fresh plan.", {
        code: "PLAN_TARGET_STALE",
        exitCode: 8,
        target: portableTransactionRoot(planned.transactionId),
      });
    }
    assertOrphanTransactionIsPreMutation(options.root, planned.transactionId);
    removeStaleLock(
      options.root,
      planned.transactionId,
      options.allowCurrentProcessLockForTesting === true,
    );
    let orphanLock: LockHandle | null = acquireLock(options.root, planned.transactionId);
    try {
      const transactionRoot = portableTransactionRoot(planned.transactionId);
      ensureDirectory(options.root, transactionRoot);
      ensureDirectory(options.root, `${transactionRoot}/stage`);
      ensureDirectory(options.root, `${transactionRoot}/backup`);
      ensureDirectory(options.root, `${transactionRoot}/post`);
      const planPath = `${transactionRoot}/plan.json`;
      writeProjectBytes(options.root, planPath, Buffer.from(canonicalJson(planned.plan)), 0o600);
      const record: TransactionRecord = {
        schemaVersion: 1,
        transactionId: planned.transactionId,
        state: "abandoned",
        plan: { path: planPath, digest: planned.plan.planDigest },
        preconditions: {
          config: planned.plan.configDigest,
          manifest: planned.plan.manifestPreconditionDigest,
          liveTargets: {},
        },
        registryPayloads: [],
        staged: [],
        backups: [],
        conflicts: [],
        consents: acceptedConsents.map(({ id, planDigest }) => ({
          id,
          accepted: true,
          flag: planned.plan.consentRequirements.find((requirement) => requirement.id === id)!.flag,
          planDigest,
        })),
        resolutions: [],
        validations: [
          {
            id: "orphan-pre-mutation",
            state: "pass",
            summary: "No stage, backup, post-state, or journal existed before lock recovery.",
          },
        ],
        command: { name: "recover", redactedArguments: [] },
        packageManager: { name: "none", invoked: false, exitCode: null },
      };
      const journal: TransactionJournal = {
        schemaVersion: 1,
        transactionId: planned.transactionId,
        state: "abandoned",
        entries: [],
      };
      writeTransactionRecord(options.root, record);
      appendJournal(options.root, journal, "abandoned", "consent-recorded");
      appendJournal(options.root, journal, "abandoned", "finalized");
      releaseLock(options.root, orphanLock);
      orphanLock = null;
      return {
        transactionId: planned.transactionId,
        state: "rolled-back",
        action: "rollback",
        planDigest: planned.plan.planDigest,
      };
    } finally {
      if (orphanLock !== null) {
        try {
          releaseLock(options.root, orphanLock);
        } catch {
          // A remaining classified lock is intentionally visible to the next recovery attempt.
        }
      }
    }
  }
  const record = readTransactionRecord(options.root, planned.transactionId);
  const journal = readTransactionJournal(options.root, planned.transactionId);
  removeStaleLock(
    options.root,
    planned.transactionId,
    options.allowCurrentProcessLockForTesting === true,
  );
  let lock: LockHandle | null = acquireLock(options.root, planned.transactionId);
  try {
    const classification = recoveryClassification(options.root, record);
    if (classification.ambiguous.length > 0) {
      throw new CliError("Recovery became ambiguous after planning; no file was changed.", {
        code: "PLAN_TARGET_STALE",
        exitCode: 8,
        target: classification.ambiguous[0]!,
      });
    }
    if (planned.action === "rollback") {
      rollbackFromBackups(options.root, record, journal);
      releaseLock(options.root, lock);
      lock = null;
      return {
        transactionId: planned.transactionId,
        state: "rolled-back",
        action: "rollback",
        planDigest: planned.plan.planDigest,
      };
    }
    if (planned.action === "resume") {
      record.state = "committing";
      writeTransactionRecord(options.root, record);
      for (const staged of record.staged.filter(
        ({ digest, operation }) => operation === "delete" || digest !== null,
      )) {
        const current = digestOrNull(readProjectBytes(options.root, staged.target));
        if (current === staged.digest) continue;
        const pre = record.preconditions.liveTargets[staged.target] ?? null;
        if (current !== pre) {
          throw new CliError(`Recovery target ${staged.target} became stale.`, {
            code: "TRANSACTION_RECOVERY_AMBIGUOUS",
            exitCode: 8,
            target: staged.target,
          });
        }
        appendJournal(options.root, journal, "committing", "commit-target", {
          target: staged.target,
          before: pre,
          after: staged.digest,
        });
        if (staged.operation === "delete") {
          deleteProjectFile(options.root, staged.target);
        } else {
          const bytes = readProjectBytes(options.root, staged.stagePath);
          if (bytes === null || sha256(bytes) !== staged.digest) {
            throw new CliError(`Recovery stage for ${staged.target} is missing or corrupt.`, {
              code: "TRANSACTION_STAGE_INVALID",
              exitCode: 8,
              target: staged.stagePath,
            });
          }
          writeProjectBytes(options.root, staged.target, bytes);
        }
        if (digestOrNull(readProjectBytes(options.root, staged.target)) !== staged.digest) {
          throw new CliError(`Recovery target ${staged.target} did not reach its staged digest.`, {
            code: "TRANSACTION_POST_VALIDATION_FAILED",
            exitCode: 8,
            target: staged.target,
          });
        }
      }
      if (record.packageManager.name !== "none" && record.packageManager.exitCode !== 0) {
        const invocation = managerInvocation(
          record.packageManager.name,
          options.root,
          options.offline === true,
          record.command.name === "rollback" ? "frozen" : "update-lockfile",
        );
        record.packageManager.invoked = true;
        record.packageManager.exitCode = null;
        writeTransactionRecord(options.root, record);
        appendJournal(options.root, journal, "committing", "dependencies-complete");
        let result: ReturnType<PackageManagerRunner>;
        try {
          result = (options.packageManagerRunner ?? defaultPackageManagerRunner)(invocation);
        } catch (error) {
          result = {
            status: null,
            error: error instanceof Error ? error : new Error("Package-manager runner failed."),
          };
        }
        record.packageManager.exitCode = result.status;
        writeTransactionRecord(options.root, record);
        if (result.error !== undefined || result.status !== 0) {
          rollbackFromBackups(options.root, record, journal);
          throw new CliError("Package-manager recovery failed; pre-state was restored.", {
            code: "PACKAGE_MANAGER_FAILED",
            exitCode: 9,
            target: "package.json",
          });
        }
      }
      for (const staged of record.staged.filter(
        ({ digest, operation }) => operation === "write" && digest === null,
      )) {
        const bytes = readProjectBytes(options.root, staged.target);
        staged.digest = digestOrNull(bytes);
        staged.operation = bytes === null ? "delete" : "write";
        if (bytes !== null) writeProjectBytes(options.root, staged.stagePath, bytes, 0o600);
      }
      writeTransactionRecord(options.root, record);
    }
    for (const staged of record.staged) {
      if (staged.digest === null && staged.operation === "write") continue;
      if (digestOrNull(readProjectBytes(options.root, staged.target)) !== staged.digest) {
        throw new CliError(`Recovered target ${staged.target} failed digest validation.`, {
          code: "TRANSACTION_POST_VALIDATION_FAILED",
          exitCode: 8,
          target: staged.target,
        });
      }
    }
    assertStructuredState(options.root, record, false);
    if (!record.validations.some(({ id }) => id === "recovery-provenance")) {
      record.validations.push({
        id: "recovery-provenance",
        state: "pass",
        summary: "Recovered provenance and immutable bases are coherent.",
      });
      writeTransactionRecord(options.root, record);
    }
    record.state = "committed";
    writeTransactionRecord(options.root, record);
    appendJournal(options.root, journal, "committed", "finalized");
    releaseLock(options.root, lock);
    lock = null;
    return {
      transactionId: planned.transactionId,
      state: "committed",
      action: planned.action,
      planDigest: planned.plan.planDigest,
    };
  } finally {
    if (lock !== null) {
      try {
        releaseLock(options.root, lock);
      } catch {
        // The primary recovery error retains authority; a remaining lock is visible to doctor.
      }
    }
  }
}

export interface RollbackOptions {
  readonly root: string;
  readonly transactionId?: string | undefined;
  readonly last?: boolean | undefined;
  readonly noInstall?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly commandArguments?: readonly string[] | undefined;
}

export interface RollbackPlan {
  readonly transactionId: string;
  readonly packageManager: PackageManager | "none";
  readonly installInvocation: PackageManagerInvocation | null;
  readonly plan: OperationPlan;
}

export interface RollbackResult {
  readonly rollbackOf: string;
  readonly transaction: TransactionResult;
  readonly installInvocation: PackageManagerInvocation | null;
}

function committedTransactionIds(root: string): readonly string[] {
  const result: string[] = [];
  for (const id of transactionDirectoryIds(root)) {
    if (readProjectBytes(root, recordPath(root, id)) === null) continue;
    if (readTransactionRecord(root, id).state === "committed") result.push(id);
  }
  return result;
}

function selectRollbackTransaction(options: RollbackOptions): string {
  if (options.transactionId !== undefined && options.last === true) {
    throw new CliError("Select either a transaction ID or --last, not both.", {
      code: "COMMAND_USAGE_INVALID",
      exitCode: 2,
    });
  }
  const committed = committedTransactionIds(options.root);
  if (options.transactionId !== undefined) {
    if (!TRANSACTION_ID_PATTERN.test(options.transactionId)) {
      throw new CliError("Rollback transaction ID is invalid.", {
        code: "COMMAND_USAGE_INVALID",
        exitCode: 2,
      });
    }
    if (!committed.includes(options.transactionId)) {
      throw new CliError(`Transaction ${options.transactionId} is not available for rollback.`, {
        code: "TRANSACTION_ROLLBACK_UNAVAILABLE",
        exitCode: 8,
        target: portableTransactionRoot(options.transactionId),
      });
    }
    return options.transactionId;
  }
  if (options.last !== true) {
    throw new CliError("Rollback requires a transaction ID or --last.", {
      code: "TRANSACTION_ROLLBACK_SELECTION_REQUIRED",
      exitCode: 8,
    });
  }
  const latest = committed.at(-1);
  if (latest === undefined) {
    throw new CliError("No committed transaction is available for rollback.", {
      code: "TRANSACTION_ROLLBACK_UNAVAILABLE",
      exitCode: 8,
    });
  }
  const sortableTime = latest.slice(0, latest.lastIndexOf("-"));
  if (committed.filter((id) => id.startsWith(`${sortableTime}-`)).length !== 1) {
    throw new CliError("The most recent committed transaction is ambiguous; select its ID.", {
      code: "TRANSACTION_ROLLBACK_SELECTION_REQUIRED",
      exitCode: 8,
      target: ".mergora/transactions",
    });
  }
  return latest;
}

function transactionBackupBytes(
  root: string,
  record: TransactionRecord,
  target: string,
): Buffer | null {
  const backup = record.backups.find((entry) => entry.target === target);
  if (backup === undefined) {
    throw new CliError(`Transaction backup metadata for ${target} is missing.`, {
      code: "TRANSACTION_BACKUP_INVALID",
      exitCode: 8,
      target: portableTransactionRoot(record.transactionId),
    });
  }
  const expected = record.preconditions.liveTargets[target] ?? null;
  if (backup.digest !== expected) {
    throw new CliError(`Transaction backup metadata for ${target} is inconsistent.`, {
      code: "TRANSACTION_BACKUP_INVALID",
      exitCode: 8,
      target: backup.backupPath,
    });
  }
  if (backup.digest === null) return null;
  const bytes = readProjectBytes(root, backup.backupPath);
  if (bytes === null || sha256(bytes) !== backup.digest) {
    throw new CliError(`Transaction backup for ${target} is missing or corrupt.`, {
      code: "TRANSACTION_BACKUP_INVALID",
      exitCode: 8,
      target: backup.backupPath,
    });
  }
  return bytes;
}

export function planRollback(options: RollbackOptions): RollbackPlan {
  assertNoIncompleteTransactions(options.root);
  const id = selectRollbackTransaction(options);
  const record = readTransactionRecord(options.root, id);
  if (record.state !== "committed") {
    throw new CliError(`Transaction ${id} is not committed and cannot be rolled back.`, {
      code: "TRANSACTION_ROLLBACK_UNAVAILABLE",
      exitCode: 8,
      target: portableTransactionRoot(id),
    });
  }
  const originalPlan = readRecordedPlan(options.root, record);
  const originalFiles = new Map(originalPlan.fileOperations.map((file) => [file.target, file]));
  const conflicts: OperationPlan["conflicts"][number][] = [];
  let writeBytes = 0;
  const fileOperations = [...record.staged]
    .sort((left, right) => left.target.localeCompare(right.target, "en-US"))
    .map((staged): OperationPlanFile => {
      if (staged.operation === "write" && staged.digest === null) {
        throw new CliError(`Transaction ${id} has an unknown post-state for ${staged.target}.`, {
          code: "TRANSACTION_ROLLBACK_UNAVAILABLE",
          exitCode: 8,
          target: staged.target,
        });
      }
      const current = digestOrNull(readProjectBytes(options.root, staged.target));
      const before = record.preconditions.liveTargets[staged.target] ?? null;
      const backup = transactionBackupBytes(options.root, record, staged.target);
      writeBytes += backup?.byteLength ?? 0;
      const stale = current !== staged.digest;
      if (stale) {
        conflicts.push({
          target: staged.target,
          kind: "ownership",
          reason: `Live bytes changed after transaction ${id}; rollback cannot overwrite them.`,
        });
      }
      const original = originalFiles.get(staged.target);
      return {
        operation: stale ? "conflict" : before === null ? "delete" : "fast-forward",
        target: staged.target,
        owner: original?.owner ?? "official:rollback",
        base: staged.digest,
        local: current,
        remote: before,
        proposed: before,
        mediaType: original?.mediaType ?? "application/octet-stream",
        risk: stale ? "conflict" : before === null ? "destructive" : "review-required",
        reason: stale
          ? `Live bytes no longer match the recorded post-state of transaction ${id}.`
          : `Restore the byte-identical pre-state recorded by transaction ${id}.`,
      };
    });
  const config = canonicalProjectJsonDigest(options.root, "mergora.json");
  if (config === null) {
    throw new CliError("mergora.json is missing.", { code: "CONFIG_MISSING", exitCode: 3 });
  }
  const packageManager = record.packageManager.name;
  const installInvocation =
    packageManager === "none"
      ? null
      : managerInvocation(packageManager, options.root, options.offline === true, "frozen");
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "rollback",
    cliVersion: originalPlan.cliVersion,
    projectRoot: ".",
    configDigest: config,
    manifestPreconditionDigest: canonicalProjectJsonDigest(options.root, ".mergora/manifest.json"),
    registries: originalPlan.registries,
    items: originalPlan.items.map((item) => ({
      ...item,
      requested: item.requested,
      fromVersion: item.toVersion,
      toVersion: item.fromVersion,
    })),
    fileOperations,
    dependencyChanges: originalPlan.dependencyChanges.map((change) => ({
      ...change,
      operation:
        change.operation === "add" ? "remove" : change.operation === "remove" ? "add" : "change",
      from: change.to,
      to: change.from,
    })),
    structuredPatches: originalPlan.structuredPatches.map((patch) => ({
      ...patch,
      operation:
        patch.operation === "add"
          ? "remove"
          : patch.operation === "remove"
            ? "add"
            : patch.operation,
    })),
    migrations: [],
    contractChanges: [],
    warnings: [
      `Rollback restores only targets recorded by transaction ${id}; unrelated files are out of scope.`,
      ...(installInvocation === null
        ? []
        : options.noInstall === true
          ? [
              `Dependency cache restoration is skipped; run ${installInvocation.executable} ${installInvocation.arguments.join(" ")}.`,
            ]
          : [
              `After authoritative files are restored, run ${installInvocation.executable} ${installInvocation.arguments.join(" ")} with fixed arguments.`,
            ]),
    ],
    consentRequirements: [
      {
        id: "rollback-transaction",
        flag: "--yes",
        reason: `Rollback restores the exact pre-state of completed transaction ${id}.`,
      },
    ],
    conflicts,
    estimatedBytes: { download: 0, write: writeBytes },
    validationSuite: ["schema", "digest", "path", "collision", "ownership", "dependency"],
    rollbackAvailable: true,
  });
  return { transactionId: id, packageManager, installInvocation, plan };
}

export function rollbackTransaction(
  options: RollbackOptions,
  expectedPlanDigest: string,
): RollbackResult {
  const planned = planRollback(options);
  if (expectedPlanDigest !== planned.plan.planDigest) {
    throw new CliError("Rollback plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  if (planned.plan.conflicts.length > 0) {
    throw new CliError(planned.plan.conflicts[0]!.reason, {
      code: "TRANSACTION_ROLLBACK_STALE",
      exitCode: 8,
      target: planned.plan.conflicts[0]!.target,
    });
  }
  const original = readTransactionRecord(options.root, planned.transactionId);
  const mutations: TransactionMutation[] = [...original.staged]
    .sort((left, right) => left.target.localeCompare(right.target, "en-US"))
    .map((staged) => ({
      target: staged.target,
      content: transactionBackupBytes(options.root, original, staged.target),
      beforeDigest: staged.digest,
      manifest: staged.target === ".mergora/manifest.json",
    }));
  const transaction = executeTransaction({
    root: options.root,
    plan: planned.plan,
    mutations,
    acceptedConsents: acceptedConsentsForReviewedPlan(planned.plan, expectedPlanDigest),
    packageManager: planned.packageManager === "none" ? undefined : planned.packageManager,
    packageManagerRequired: planned.packageManager !== "none",
    noInstall: options.noInstall,
    offline: options.offline,
    packageManagerRunner: options.packageManagerRunner,
    commandArguments: options.commandArguments,
  });
  return {
    rollbackOf: planned.transactionId,
    transaction,
    installInvocation: planned.installInvocation,
  };
}

export function listIncompleteTransactions(root: string): readonly string[] {
  return recoverableTransactionIds(root);
}
