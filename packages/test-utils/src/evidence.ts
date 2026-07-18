import {
  assertNever,
  compareText,
  isCatalogId,
  isExactIsoInstant,
  isImmutableHttpsUrl,
  isProjectRelativePath,
  isSemver,
  isSha256,
  issue,
  validationResult,
} from "./validation.js";
import type { ValidationIssue, ValidationResult } from "./validation.js";

export type EvidenceContext = "measurement" | "passport" | "contract" | "release-gate";
export type MeasurementState = "pass" | "fail" | "warning" | "manual-check" | "not-measurable";
export type PassportState =
  | "pass"
  | "pass-with-limitation"
  | "fail"
  | "not-tested"
  | "not-applicable"
  | "expired"
  | "blocked-upstream";
export type ContractState = "pass" | "fail" | "blocked-upstream" | "not-applicable";
export type ReleaseGateState = "pass" | "fail" | "blocked" | "not-applicable";
export type AggregateState =
  "satisfied" | "conditional" | "failed" | "unknown" | "stale" | "blocked" | "not-applicable";

export interface EvidenceReference {
  readonly id: string;
  readonly artifact: string;
  readonly digest: string;
}

interface EvidenceBase<TContext extends EvidenceContext, TState extends string> {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly context: TContext;
  readonly state: TState;
  readonly aggregateState: AggregateState;
  readonly summary: string;
  readonly sourceDigest?: string;
  readonly performedAt?: string;
  readonly expiresAt?: string;
  readonly references: readonly EvidenceReference[];
}

export type MeasurementEvidence = EvidenceBase<"measurement", MeasurementState>;
export type LensMeasurementRecord = MeasurementEvidence;
export type PassportEvidence = EvidenceBase<"passport", PassportState>;
export type ContractEvidence = EvidenceBase<"contract", ContractState>;
export type ReleaseGateEvidence = EvidenceBase<"release-gate", ReleaseGateState>;
export type ContextEvidenceRecord =
  MeasurementEvidence | PassportEvidence | ContractEvidence | ReleaseGateEvidence;

export interface EvidenceIndex {
  readonly schemaVersion: 1;
  readonly itemId: string;
  readonly sourceDigest: string;
  readonly contractVersion: string;
  readonly generatedAt: string;
  readonly records: readonly ContextEvidenceRecord[];
}

const measurementAggregates = {
  pass: "satisfied",
  fail: "failed",
  warning: "conditional",
  "manual-check": "conditional",
  "not-measurable": "unknown",
} as const satisfies Record<MeasurementState, AggregateState>;

const passportAggregates = {
  pass: "satisfied",
  "pass-with-limitation": "conditional",
  fail: "failed",
  "not-tested": "unknown",
  "not-applicable": "not-applicable",
  expired: "stale",
  "blocked-upstream": "blocked",
} as const satisfies Record<PassportState, AggregateState>;

const contractAggregates = {
  pass: "satisfied",
  fail: "failed",
  "blocked-upstream": "blocked",
  "not-applicable": "not-applicable",
} as const satisfies Record<ContractState, AggregateState>;

const releaseGateAggregates = {
  pass: "satisfied",
  fail: "failed",
  blocked: "blocked",
  "not-applicable": "not-applicable",
} as const satisfies Record<ReleaseGateState, AggregateState>;

export function aggregateStateForEvidence(record: ContextEvidenceRecord): AggregateState {
  switch (record.context) {
    case "measurement":
      return measurementAggregates[record.state];
    case "passport":
      return passportAggregates[record.state];
    case "contract":
      return contractAggregates[record.state];
    case "release-gate":
      return releaseGateAggregates[record.state];
    default:
      return assertNever(record, "evidence context");
  }
}

const aggregatePrecedence = [
  "failed",
  "blocked",
  "stale",
  "unknown",
  "conditional",
  "satisfied",
] as const satisfies readonly AggregateState[];

export function aggregateEvidence(
  records: readonly Pick<ContextEvidenceRecord, "aggregateState">[],
): AggregateState {
  if (records.length === 0) return "unknown";
  const states = new Set(records.map((record) => record.aggregateState));
  if (states.size === 1 && states.has("not-applicable")) return "not-applicable";

  for (const candidate of aggregatePrecedence) {
    if (states.has(candidate)) return candidate;
  }
  return "unknown";
}

function validateReference(reference: EvidenceReference, path: string): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isCatalogId(reference.id)) {
    issues.push(issue("evidence.reference-id", `${path}.id`, "Reference id must be a catalog id."));
  }
  if (!isImmutableHttpsUrl(reference.artifact) && !isProjectRelativePath(reference.artifact)) {
    issues.push(
      issue(
        "evidence.reference-artifact",
        `${path}.artifact`,
        "Artifact must be an immutable HTTPS URL or a project-relative path without traversal.",
      ),
    );
  }
  if (!isSha256(reference.digest)) {
    issues.push(
      issue(
        "evidence.reference-digest",
        `${path}.digest`,
        "Reference digest must be sha256:<64 hex>.",
      ),
    );
  }
  return issues;
}

export function validateEvidenceRecord(
  record: ContextEvidenceRecord,
  asOf?: string,
): ValidationResult<ContextEvidenceRecord> {
  const issues: ValidationIssue[] = [];
  if (record.schemaVersion !== 1) {
    issues.push(issue("evidence.schema-version", "schemaVersion", "schemaVersion must be 1."));
  }
  if (!isCatalogId(record.evidenceId)) {
    issues.push(issue("evidence.id", "evidenceId", "evidenceId must be a catalog id."));
  }
  if (record.summary.trim().length === 0) {
    issues.push(issue("evidence.summary", "summary", "Evidence summary must be non-empty."));
  }
  if (record.sourceDigest !== undefined && !isSha256(record.sourceDigest)) {
    issues.push(
      issue("evidence.source-digest", "sourceDigest", "sourceDigest must be sha256:<64 hex>."),
    );
  }
  if (record.performedAt !== undefined && !isExactIsoInstant(record.performedAt)) {
    issues.push(
      issue(
        "evidence.performed-at",
        "performedAt",
        "performedAt must be an exact ISO-8601 instant.",
      ),
    );
  }
  if (record.expiresAt !== undefined && !isExactIsoInstant(record.expiresAt)) {
    issues.push(
      issue("evidence.expires-at", "expiresAt", "expiresAt must be an exact ISO-8601 instant."),
    );
  }
  if (
    record.performedAt !== undefined &&
    record.expiresAt !== undefined &&
    Date.parse(record.expiresAt) <= Date.parse(record.performedAt)
  ) {
    issues.push(
      issue(
        "evidence.invalid-validity-window",
        "expiresAt",
        "expiresAt must be after performedAt.",
      ),
    );
  }
  if (
    asOf !== undefined &&
    isExactIsoInstant(asOf) &&
    record.performedAt !== undefined &&
    Date.parse(record.performedAt) > Date.parse(asOf)
  ) {
    issues.push(
      issue("evidence.future", "performedAt", "Evidence cannot be performed in the future."),
    );
  }
  if (
    asOf !== undefined &&
    isExactIsoInstant(asOf) &&
    record.expiresAt !== undefined &&
    Date.parse(record.expiresAt) <= Date.parse(asOf)
  ) {
    issues.push(issue("evidence.expired", "expiresAt", `Evidence expired at ${record.expiresAt}.`));
  }

  const expectedAggregate = aggregateStateForEvidence(record);
  if (record.aggregateState !== expectedAggregate) {
    issues.push(
      issue(
        "evidence.aggregate-mismatch",
        "aggregateState",
        `${record.context}:${record.state} must aggregate to ${expectedAggregate}, not ${record.aggregateState}.`,
      ),
    );
  }

  const referenceIds = new Set<string>();
  for (const [index, reference] of record.references.entries()) {
    issues.push(...validateReference(reference, `references[${index}]`));
    if (referenceIds.has(reference.id)) {
      issues.push(
        issue(
          "evidence.duplicate-reference",
          `references[${index}].id`,
          `Reference "${reference.id}" appears more than once.`,
        ),
      );
    }
    referenceIds.add(reference.id);
  }
  const sortedReferences = [...record.references].sort((left, right) =>
    compareText(left.id, right.id),
  );
  if (sortedReferences.some((reference, index) => reference.id !== record.references[index]?.id)) {
    issues.push(
      issue(
        "evidence.reference-order",
        "references",
        "Evidence references must be ordered lexically by id.",
      ),
    );
  }

  return validationResult(record, issues);
}

export function validateEvidenceIndex(
  index: EvidenceIndex,
  asOf?: string,
): ValidationResult<EvidenceIndex> {
  const issues: ValidationIssue[] = [];
  if (index.schemaVersion !== 1) {
    issues.push(
      issue("evidence-index.schema-version", "schemaVersion", "schemaVersion must be 1."),
    );
  }
  if (!isCatalogId(index.itemId)) {
    issues.push(issue("evidence-index.item-id", "itemId", "itemId must be a catalog id."));
  }
  if (!isSha256(index.sourceDigest)) {
    issues.push(
      issue(
        "evidence-index.source-digest",
        "sourceDigest",
        "sourceDigest must be sha256:<64 hex>.",
      ),
    );
  }
  if (!isSemver(index.contractVersion)) {
    issues.push(
      issue(
        "evidence-index.contract-version",
        "contractVersion",
        "contractVersion must be an exact semantic version.",
      ),
    );
  }
  if (!isExactIsoInstant(index.generatedAt)) {
    issues.push(
      issue(
        "evidence-index.generated-at",
        "generatedAt",
        "generatedAt must be an exact ISO instant.",
      ),
    );
  }
  if (asOf !== undefined && !isExactIsoInstant(asOf)) {
    issues.push(issue("evidence-index.as-of", "$asOf", "asOf must be an exact ISO instant."));
  }
  if (
    asOf !== undefined &&
    isExactIsoInstant(asOf) &&
    isExactIsoInstant(index.generatedAt) &&
    Date.parse(index.generatedAt) > Date.parse(asOf)
  ) {
    issues.push(
      issue(
        "evidence-index.future",
        "generatedAt",
        "Evidence index cannot be generated in the future.",
      ),
    );
  }

  const ids = new Set<string>();
  for (const [recordIndex, record] of index.records.entries()) {
    const result = validateEvidenceRecord(record, asOf);
    issues.push(
      ...result.issues.map((entry) => ({
        ...entry,
        path: `records[${recordIndex}].${entry.path}`,
      })),
    );
    const key = `${record.context}:${record.evidenceId}`;
    if (ids.has(key)) {
      issues.push(
        issue(
          "evidence-index.duplicate-record",
          `records[${recordIndex}].evidenceId`,
          `Evidence key "${key}" appears more than once.`,
        ),
      );
    }
    ids.add(key);
    if (record.sourceDigest !== undefined && record.sourceDigest !== index.sourceDigest) {
      issues.push(
        issue(
          "evidence-index.source-mismatch",
          `records[${recordIndex}].sourceDigest`,
          "Evidence sourceDigest must match its index sourceDigest.",
        ),
      );
    }
  }

  const sortedRecords = [...index.records].sort((left, right) =>
    compareText(`${left.context}:${left.evidenceId}`, `${right.context}:${right.evidenceId}`),
  );
  if (sortedRecords.some((record, recordIndex) => record !== index.records[recordIndex])) {
    issues.push(
      issue(
        "evidence-index.record-order",
        "records",
        "Evidence records must be ordered lexically by context and evidenceId.",
      ),
    );
  }

  return validationResult(index, issues);
}

function canonicalValue(value: unknown, ancestors: ReadonlySet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical JSON cannot contain non-finite numbers.");
    return JSON.stringify(value);
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    throw new TypeError(`Canonical JSON cannot contain ${typeof value} values.`);
  }
  if (typeof value === "bigint") {
    throw new TypeError("Canonical JSON cannot contain bigint values.");
  }

  if (ancestors.has(value)) throw new TypeError("Canonical JSON cannot contain cycles.");
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalValue(entry, nextAncestors)).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  const entries = Object.keys(object)
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonicalValue(object[key], nextAncestors)}`);
  return `{${entries.join(",")}}`;
}

export function canonicalJson(value: unknown): string {
  return canonicalValue(value, new Set<object>());
}
