export const CONTRACT_DEFINITION_SCHEMA_VERSION = 1 as const;
export const AUDIT_REPORT_SCHEMA_VERSION = 1 as const;

export const AUDIT_MODES = ["a11y", "browser", "keyboard", "responsive", "static"] as const;
export type AuditMode = (typeof AUDIT_MODES)[number];

export const AUDIT_EVIDENCE_TYPES = [
  "accessibility-tree",
  "browser-behavior",
  "keyboard-behavior",
  "responsive-geometry",
  "static-source",
] as const;
export type AuditEvidenceType = (typeof AUDIT_EVIDENCE_TYPES)[number];

export const AUDIT_SEVERITIES = ["S0", "S1", "S2", "S3"] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface OwnedFileTargetV1 {
  readonly kind: "owned-file";
  readonly logicalPath: string;
}

export interface FileExistsAdapterV1 {
  readonly kind: "file-exists";
  readonly version: "1.0.0";
}

export interface TextIncludesAdapterV1 {
  readonly kind: "text-includes";
  readonly version: "1.0.0";
  readonly value: string;
}

export interface TextExcludesAdapterV1 {
  readonly kind: "text-excludes";
  readonly version: "1.0.0";
  readonly value: string;
}

export interface JsonPointerEqualsAdapterV1 {
  readonly kind: "json-pointer-equals";
  readonly version: "1.0.0";
  readonly pointer: string;
  readonly expected: JsonValue;
}

export type StaticAssertionAdapterV1 =
  FileExistsAdapterV1 | JsonPointerEqualsAdapterV1 | TextExcludesAdapterV1 | TextIncludesAdapterV1;

export interface HarnessAssertionAdapterV1 {
  readonly kind: "harness";
  readonly version: "1.0.0";
  readonly harnessId: string;
}

interface ContractAssertionBaseV1 {
  readonly id: string;
  readonly target: OwnedFileTargetV1;
  readonly expectedBehavior: string;
  readonly severity: AuditSeverity;
  readonly remediationUrl: string;
}

export interface StaticContractAssertionV1 extends ContractAssertionBaseV1 {
  readonly mode: "static";
  readonly evidenceType: "static-source";
  readonly adapter: StaticAssertionAdapterV1;
}

export interface RuntimeContractAssertionV1 extends ContractAssertionBaseV1 {
  readonly mode: Exclude<AuditMode, "static">;
  readonly evidenceType: Exclude<AuditEvidenceType, "static-source">;
  readonly adapter: HarnessAssertionAdapterV1;
}

export type ContractAssertionV1 = RuntimeContractAssertionV1 | StaticContractAssertionV1;

/**
 * A portable executable contract. It is intentionally declarative: registry
 * data selects a reviewed adapter and parameters, never arbitrary code.
 */
export interface ContractDefinitionV1 {
  readonly schemaVersion: typeof CONTRACT_DEFINITION_SCHEMA_VERSION;
  readonly contractVersion: string;
  readonly contractId: string;
  readonly registryId: string;
  readonly itemId: string;
  readonly payloadDigest: string;
  readonly conformanceClaim: "automated-evidence-only";
  readonly limitations: readonly string[];
  readonly assertions: readonly ContractAssertionV1[];
}

export type AuditAssertionState = "pass" | "fail" | "not-applicable" | "not-run";

export const AUDIT_FAILURE_GUIDANCE = {
  "adapter-error": {
    exitCode: 1,
    summary: "The audit adapter failed unexpectedly; no assertion pass is recorded.",
  },
  "assertion-failed": {
    exitCode: 10,
    summary: "The executed quality assertion did not meet its expected behavior.",
  },
  "capability-unavailable": {
    exitCode: 7,
    summary: "The requested audit capability is unavailable in the selected harness.",
  },
  "target-unavailable": {
    exitCode: 10,
    summary: "The assertion target is missing, unmapped, unreadable, or outside adapter limits.",
  },
} as const;

export type AuditFailureClassification = keyof typeof AUDIT_FAILURE_GUIDANCE;
export type AuditRecommendedExitCode = 0 | 1 | 7 | 10;

export interface AuditFailureV1 {
  readonly classification: AuditFailureClassification;
  readonly code: string;
}

export interface AuditTargetV1 {
  readonly logicalPath: string;
  readonly projectPath: string | null;
}

export interface AuditAssertionResultV1 {
  readonly assertionId: string;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly payloadDigest: string;
  readonly registryId: string;
  readonly itemId: string;
  readonly mode: AuditMode;
  readonly evidenceType: AuditEvidenceType;
  readonly target: AuditTargetV1;
  readonly expectedBehavior: string;
  readonly actualBehavior: string;
  readonly severity: AuditSeverity;
  readonly remediationUrl: string;
  readonly state: AuditAssertionState;
  readonly failure: AuditFailureV1 | null;
}

export interface AuditCapabilityV1 {
  readonly mode: AuditMode;
  readonly requested: boolean;
  readonly available: boolean;
  readonly adapter: string | null;
  readonly limitation: string | null;
}

export interface AuditSummaryV1 {
  readonly pass: number;
  readonly fail: number;
  readonly notApplicable: number;
  readonly notRun: number;
}

export type AuditReportState = "pass" | "fail" | "incomplete" | "not-applicable";

export interface AuditReportV1 {
  readonly schemaVersion: typeof AUDIT_REPORT_SCHEMA_VERSION;
  readonly reportVersion: "1.0.0";
  readonly projectRoot: ".";
  readonly state: AuditReportState;
  readonly recommendedExitCode: AuditRecommendedExitCode;
  readonly requestedModes: readonly AuditMode[];
  readonly scope: {
    readonly changedOnly: boolean;
    readonly itemIds: readonly string[];
  };
  readonly capabilities: readonly AuditCapabilityV1[];
  readonly limitations: readonly string[];
  readonly results: readonly AuditAssertionResultV1[];
  readonly summary: AuditSummaryV1;
  readonly networkUsed: false;
  readonly conformanceClaim: "automated-evidence-only";
}

export type StaticTargetUnavailableReason =
  "invalid-utf8" | "not-a-file" | "read-error" | "target-too-large" | "target-unmapped";

export type StaticTargetSnapshot =
  | {
      readonly state: "present";
      readonly projectPath: string;
      readonly content: string;
    }
  | {
      readonly state: "missing";
      readonly projectPath: string;
    }
  | {
      readonly state: "unavailable";
      readonly projectPath: string | null;
      readonly reason: StaticTargetUnavailableReason;
    };

export interface StaticAuditTargetAdapter {
  readonly id: string;
  readTarget(input: {
    readonly registryId: string;
    readonly itemId: string;
    readonly logicalPath: string;
  }): StaticTargetSnapshot | Promise<StaticTargetSnapshot>;
}

export interface RunContractAuditOptions {
  readonly requestedModes?: readonly AuditMode[];
  readonly changedOnly?: boolean;
}
