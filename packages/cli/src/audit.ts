import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import {
  ContractDefinitionError,
  parseContractDefinitionV1,
  runContractAuditV1,
  type AuditMode,
  type AuditReportV1,
  type ContractDefinitionV1,
  type StaticAuditTargetAdapter,
  type StaticTargetSnapshot,
} from "mergora-contracts";

import {
  CliError,
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  sha256,
  validatedProjectRoot,
  type StableExitCode,
} from "./contracts.js";

const DEFAULT_CONTRACT_DIRECTORY = ".mergora/contracts";
const DEFAULT_MAX_TARGET_BYTES = 2_097_152;
const catalogIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const qualifiedItemPattern = /^([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const semverPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;

interface AuditManifestFile {
  readonly logicalPath: string;
  readonly target: string;
  readonly installed: string | null;
}

interface AuditManifestItem {
  readonly qualifiedId: string;
  readonly registryId: string;
  readonly itemId: string;
  readonly contractVersion: string;
  readonly payloadDigest: string;
  readonly files: readonly AuditManifestFile[];
  readonly registryDependencies: readonly string[];
}

export interface AuditProjectOptions {
  readonly items?: readonly string[];
  readonly requestedModes?: readonly AuditMode[];
  readonly changed?: boolean;
  /** Verified definitions supplied by a registry/vendor resolver. */
  readonly definitions?: readonly unknown[];
  /** Project-relative committed snapshot directory used when definitions are not supplied. */
  readonly contractDirectory?: string;
  /** Programmatic safety limit; this is intentionally not a registry-controlled option. */
  readonly maxTargetBytes?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function manifestError(message: string, target = ".mergora/manifest.json"): CliError {
  return new CliError(message, {
    code: "AUDIT_MANIFEST_INVALID",
    exitCode: 3,
    target,
  });
}

function parseManifestFile(value: unknown, itemKey: string, index: number): AuditManifestFile {
  if (!isRecord(value))
    throw manifestError(`Manifest file ${String(index)} for ${itemKey} is invalid.`);
  if (typeof value.logicalPath !== "string" || typeof value.target !== "string") {
    throw manifestError(`Manifest file ${String(index)} for ${itemKey} is missing paths.`);
  }
  try {
    assertPortableRelativePath(value.logicalPath, "Manifest logical path");
    assertPortableRelativePath(value.target, "Manifest target");
  } catch {
    throw manifestError(`Manifest file ${String(index)} for ${itemKey} has an unsafe path.`);
  }
  if (
    value.installed !== null &&
    (typeof value.installed !== "string" || !sha256Pattern.test(value.installed))
  ) {
    throw manifestError(`Manifest file ${String(index)} for ${itemKey} has an invalid digest.`);
  }
  return {
    logicalPath: value.logicalPath,
    target: value.target,
    installed: value.installed,
  };
}

function parseManifestItem(qualifiedId: string, value: unknown): AuditManifestItem {
  const identity = qualifiedItemPattern.exec(qualifiedId);
  if (identity === null || !isRecord(value))
    throw manifestError(`Manifest item ${qualifiedId} is invalid.`);
  const registryId = identity[1];
  const itemId = identity[2];
  if (
    registryId === undefined ||
    itemId === undefined ||
    value.registry !== registryId ||
    value.itemId !== itemId ||
    typeof value.contractVersion !== "string" ||
    !semverPattern.test(value.contractVersion) ||
    !isRecord(value.payload) ||
    typeof value.payload.digest !== "string" ||
    !sha256Pattern.test(value.payload.digest) ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.registryDependencies) ||
    value.registryDependencies.some(
      (dependency) => typeof dependency !== "string" || !qualifiedItemPattern.test(dependency),
    )
  ) {
    throw manifestError(`Manifest item ${qualifiedId} has an invalid audit binding.`);
  }
  const files = value.files.map((file, index) => parseManifestFile(file, qualifiedId, index));
  const logicalPaths = files.map(({ logicalPath }) => logicalPath);
  if (new Set(logicalPaths).size !== logicalPaths.length) {
    throw manifestError(`Manifest item ${qualifiedId} maps a logical path more than once.`);
  }
  return {
    qualifiedId,
    registryId,
    itemId,
    contractVersion: value.contractVersion,
    payloadDigest: value.payload.digest,
    files,
    registryDependencies: [...(value.registryDependencies as string[])].sort(compareText),
  };
}

function readManifest(root: string): readonly AuditManifestItem[] {
  const relativePath = ".mergora/manifest.json";
  assertNoSymlinkAncestors(root, relativePath);
  const path = resolve(root, relativePath);
  if (!existsSync(path)) throw manifestError("Audit requires a committed v1 provenance manifest.");
  if (!statSync(path).isFile()) throw manifestError("The v1 provenance manifest is not a file.");
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw manifestError("The v1 provenance manifest is not valid JSON.");
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.items)) {
    throw manifestError("Audit requires the supported v1 provenance manifest shape.");
  }
  return Object.entries(value.items)
    .sort(([left], [right]) => compareText(left, right))
    .map(([qualifiedId, item]) => parseManifestItem(qualifiedId, item));
}

function itemChanged(root: string, item: AuditManifestItem): boolean {
  return item.files.some((file) => {
    assertNoSymlinkAncestors(root, file.target);
    const path = resolve(root, file.target);
    if (!existsSync(path) || !statSync(path).isFile() || file.installed === null) return true;
    return sha256(readFileSync(path)) !== file.installed;
  });
}

function changedClosure(root: string, items: readonly AuditManifestItem[]): ReadonlySet<string> {
  const selected = new Set(
    items.filter((item) => itemChanged(root, item)).map(({ qualifiedId }) => qualifiedId),
  );
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const item of items) {
      if (
        !selected.has(item.qualifiedId) &&
        item.registryDependencies.some((dependency) => selected.has(dependency))
      ) {
        selected.add(item.qualifiedId);
        expanded = true;
      }
    }
  }
  return selected;
}

function resolveSelectors(
  items: readonly AuditManifestItem[],
  selectors: readonly string[] | undefined,
): ReadonlySet<string> | null {
  if (selectors === undefined || selectors.length === 0) return null;
  const selected = new Set<string>();
  for (const input of selectors) {
    const selector = input.trim().normalize("NFC");
    let matches: readonly AuditManifestItem[];
    if (qualifiedItemPattern.test(selector)) {
      matches = items.filter(({ qualifiedId }) => qualifiedId === selector);
    } else if (catalogIdPattern.test(selector)) {
      matches = items.filter(({ itemId }) => itemId === selector);
    } else {
      throw new CliError(`Audit item selector ${JSON.stringify(input)} is invalid.`, {
        code: "AUDIT_ITEM_SELECTOR_INVALID",
        exitCode: 2,
      });
    }
    if (matches.length === 0) {
      throw new CliError(`Audit item ${JSON.stringify(input)} is not installed.`, {
        code: "AUDIT_ITEM_NOT_INSTALLED",
        exitCode: 7,
      });
    }
    if (matches.length > 1) {
      throw new CliError(
        `Audit item ${JSON.stringify(input)} is ambiguous; qualify its registry.`,
        {
          code: "AUDIT_ITEM_AMBIGUOUS",
          exitCode: 2,
        },
      );
    }
    selected.add(matches[0]!.qualifiedId);
  }
  return selected;
}

function selectItems(
  root: string,
  items: readonly AuditManifestItem[],
  options: AuditProjectOptions,
): readonly AuditManifestItem[] {
  const selectors = resolveSelectors(items, options.items);
  const changed = options.changed === true ? changedClosure(root, items) : null;
  return items.filter(
    ({ qualifiedId }) =>
      (selectors === null || selectors.has(qualifiedId)) &&
      (changed === null || changed.has(qualifiedId)),
  );
}

function contractFileName(item: AuditManifestItem): string {
  return `${item.registryId}--${item.itemId}.json`;
}

function parseDefinition(value: unknown, target?: string): ContractDefinitionV1 {
  try {
    return parseContractDefinitionV1(value);
  } catch (error) {
    if (error instanceof ContractDefinitionError) {
      throw new CliError("Executable Contract data does not match the supported v1 schema.", {
        code: error.code,
        exitCode: 5,
        ...(target === undefined ? {} : { target }),
      });
    }
    throw error;
  }
}

function readSnapshotDefinitions(
  root: string,
  directory: string,
  items: readonly AuditManifestItem[],
): readonly ContractDefinitionV1[] {
  try {
    assertPortableRelativePath(directory, "Contract snapshot directory");
  } catch {
    throw new CliError("Contract snapshot directory must be a portable project-relative path.", {
      code: "AUDIT_CONTRACT_DIRECTORY_INVALID",
      exitCode: 2,
    });
  }
  return items.flatMap((item) => {
    const relativePath = `${directory}/${contractFileName(item)}`;
    assertNoSymlinkAncestors(root, relativePath);
    const path = resolve(root, relativePath);
    if (!existsSync(path)) {
      throw new CliError(`The installed Contract snapshot for ${item.qualifiedId} is missing.`, {
        code: "AUDIT_CONTRACT_SNAPSHOT_MISSING",
        exitCode: 3,
        target: relativePath,
      });
    }
    if (!statSync(path).isFile()) {
      throw new CliError(`The installed Contract snapshot for ${item.qualifiedId} is not a file.`, {
        code: "AUDIT_CONTRACT_SNAPSHOT_INVALID",
        exitCode: 3,
        target: relativePath,
      });
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch {
      throw new CliError(
        `The installed Contract snapshot for ${item.qualifiedId} is not valid JSON.`,
        {
          code: "AUDIT_CONTRACT_JSON_INVALID",
          exitCode: 5,
          target: relativePath,
        },
      );
    }
    const definitions = Array.isArray(raw) ? raw : [raw];
    return definitions.map((definition) => parseDefinition(definition, relativePath));
  });
}

function definitionsForItems(
  root: string,
  selected: readonly AuditManifestItem[],
  options: AuditProjectOptions,
): readonly ContractDefinitionV1[] {
  if (selected.length === 0) return [];
  const definitions =
    options.definitions === undefined
      ? readSnapshotDefinitions(
          root,
          options.contractDirectory ?? DEFAULT_CONTRACT_DIRECTORY,
          selected,
        )
      : options.definitions.map((definition) => parseDefinition(definition));
  const selectedIds = new Set(selected.map(({ qualifiedId }) => qualifiedId));
  const relevant = definitions.filter(({ registryId, itemId }) =>
    selectedIds.has(`${registryId}:${itemId}`),
  );
  const definitionKeys = relevant.map(
    ({ registryId, itemId, contractId }) => `${registryId}:${itemId}:${contractId}`,
  );
  if (new Set(definitionKeys).size !== definitionKeys.length) {
    throw new CliError("Executable Contract data repeats a contract identity.", {
      code: "AUDIT_CONTRACT_DUPLICATE",
      exitCode: 5,
    });
  }
  for (const item of selected) {
    const bound = relevant.filter(
      ({ registryId, itemId }) => registryId === item.registryId && itemId === item.itemId,
    );
    if (bound.length === 0) {
      throw new CliError(`No executable Contract is available for ${item.qualifiedId}.`, {
        code: "AUDIT_CONTRACT_MISSING",
        exitCode: 3,
      });
    }
    for (const definition of bound) {
      if (
        definition.contractVersion !== item.contractVersion ||
        definition.payloadDigest !== item.payloadDigest
      ) {
        throw new CliError(`The executable Contract binding for ${item.qualifiedId} is stale.`, {
          code: "AUDIT_CONTRACT_BINDING_MISMATCH",
          exitCode: 5,
        });
      }
    }
  }
  return relevant;
}

function validateTargetBytes(value: number | undefined): number {
  const limit = value ?? DEFAULT_MAX_TARGET_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 52_428_800) {
    throw new CliError("Static audit target byte limit is invalid.", {
      code: "AUDIT_TARGET_LIMIT_INVALID",
      exitCode: 2,
    });
  }
  return limit;
}

function preflightTargets(root: string, items: readonly AuditManifestItem[]): void {
  for (const item of items) {
    for (const file of item.files) assertNoSymlinkAncestors(root, file.target);
  }
}

function createProjectTargetAdapter(
  root: string,
  items: readonly AuditManifestItem[],
  maximumBytes: number,
): StaticAuditTargetAdapter {
  const itemMap = new Map(items.map((item) => [item.qualifiedId, item] as const));
  return {
    id: "project-manifest-static-v1",
    readTarget({ registryId, itemId, logicalPath }): StaticTargetSnapshot {
      const item = itemMap.get(`${registryId}:${itemId}`);
      const file = item?.files.find((candidate) => candidate.logicalPath === logicalPath);
      if (file === undefined) {
        return { state: "unavailable", projectPath: null, reason: "target-unmapped" };
      }
      const path = resolve(root, file.target);
      try {
        assertNoSymlinkAncestors(root, file.target);
        if (!existsSync(path)) return { state: "missing", projectPath: file.target };
        if (lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) {
          return { state: "unavailable", projectPath: file.target, reason: "not-a-file" };
        }
        const bytes = readFileSync(path);
        if (bytes.byteLength > maximumBytes) {
          return { state: "unavailable", projectPath: file.target, reason: "target-too-large" };
        }
        let content: string;
        try {
          content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          return { state: "unavailable", projectPath: file.target, reason: "invalid-utf8" };
        }
        return { state: "present", projectPath: file.target, content };
      } catch {
        return { state: "unavailable", projectPath: file.target, reason: "read-error" };
      }
    },
  };
}

/**
 * Runs deterministic local Contract checks. Only the static adapter is
 * implemented in this tranche; requested runtime modes are returned as
 * unavailable evidence, never implicit skips or fabricated passes.
 */
export async function auditProject(
  projectRoot: string,
  options: AuditProjectOptions = {},
): Promise<AuditReportV1> {
  const root = validatedProjectRoot(projectRoot);
  const manifestItems = readManifest(root);
  const selected = selectItems(root, manifestItems, options);
  preflightTargets(root, selected);
  const definitions = definitionsForItems(root, selected, options);
  return runContractAuditV1(
    definitions,
    createProjectTargetAdapter(root, selected, validateTargetBytes(options.maxTargetBytes)),
    {
      ...(options.requestedModes === undefined ? {} : { requestedModes: options.requestedModes }),
      changedOnly: options.changed ?? false,
    },
  );
}

export function auditProjectExitCode(report: AuditReportV1): StableExitCode {
  return report.recommendedExitCode;
}
