import {
  AUDIT_EVIDENCE_TYPES,
  AUDIT_FAILURE_GUIDANCE,
  AUDIT_MODES,
  AUDIT_SEVERITIES,
  type AuditAssertionResultV1,
  type AuditReportV1,
  type ContractAssertionV1,
  type ContractDefinitionV1,
  type JsonValue,
  type RuntimeAuditMode,
} from "./model.js";
import {
  isCanonicalRuntimeAuditContextV1,
  runtimeContextHasModeEvidenceV1,
} from "./runtime-harness.js";

export interface ContractValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ContractValidationResult<T> {
  readonly valid: boolean;
  readonly value: T | null;
  readonly issues: readonly ContractValidationIssue[];
}

export class ContractDefinitionError extends Error {
  public readonly code = "CONTRACT_DEFINITION_INVALID";
  public readonly issues: readonly ContractValidationIssue[];

  public constructor(issues: readonly ContractValidationIssue[]) {
    super("Contract definition does not match the supported v1 executable contract schema.");
    this.name = "ContractDefinitionError";
    this.issues = issues;
  }
}

const catalogIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const semverPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const projectSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(code: string, path: string, message: string): ContractValidationIssue {
  return { code, path, message };
}

function unknownKeyIssues(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): readonly ContractValidationIssue[] {
  const allowedKeys = new Set(allowed);
  return Object.keys(value)
    .filter((key) => !allowedKeys.has(key))
    .sort(compareText)
    .map((key) =>
      issue(
        "schema.unknown-field",
        path === "$" ? key : `${path}.${key}`,
        `Unknown field ${JSON.stringify(key)} is not supported by schema v1.`,
      ),
    );
}

function isCatalogId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && catalogIdPattern.test(value);
}

function isOrderedCatalogIdList(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every(isCatalogId) &&
    new Set(value).size === value.length &&
    [...value].sort(compareText).every((entry, index) => entry === value[index])
  );
}

function isNonEmptyText(value: unknown, maximum = 1_024): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function isProjectRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return false;
  if (value !== value.normalize("NFC") || value.includes("\\") || value.startsWith("/"))
    return false;
  const segments = value.split("/");
  return segments.every(
    (segment) =>
      segment !== "." &&
      segment !== ".." &&
      !segment.endsWith(".") &&
      !segment.endsWith(" ") &&
      projectSegmentPattern.test(segment),
  );
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isJsonValue(entry, depth + 1));
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([key, entry]) => key.normalize("NFC") === key && isJsonValue(entry, depth + 1),
  );
}

const expectedEvidenceType = {
  a11y: "accessibility-tree",
  browser: "browser-behavior",
  keyboard: "keyboard-behavior",
  responsive: "responsive-geometry",
  static: "static-source",
} as const;
const runtimeModes = AUDIT_MODES.filter((mode): mode is RuntimeAuditMode => mode !== "static");

function assertionIssues(value: unknown, path: string): readonly ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];
  if (!isRecord(value)) return [issue("assertion.type", path, "Assertion must be an object.")];
  issues.push(
    ...unknownKeyIssues(
      value,
      [
        "id",
        "mode",
        "evidenceType",
        "target",
        "expectedBehavior",
        "severity",
        "remediationUrl",
        "adapter",
      ],
      path,
    ),
  );
  if (!isCatalogId(value.id))
    issues.push(issue("assertion.id", `${path}.id`, "Assertion id must be a catalog id."));
  if (!AUDIT_MODES.includes(value.mode as never))
    issues.push(issue("assertion.mode", `${path}.mode`, "Assertion mode is unsupported."));
  if (!AUDIT_EVIDENCE_TYPES.includes(value.evidenceType as never)) {
    issues.push(
      issue("assertion.evidence-type", `${path}.evidenceType`, "Evidence type is unsupported."),
    );
  } else if (
    typeof value.mode === "string" &&
    value.mode in expectedEvidenceType &&
    value.evidenceType !== expectedEvidenceType[value.mode as keyof typeof expectedEvidenceType]
  ) {
    issues.push(
      issue(
        "assertion.evidence-mode",
        `${path}.evidenceType`,
        "Evidence type does not match assertion mode.",
      ),
    );
  }
  if (!AUDIT_SEVERITIES.includes(value.severity as never))
    issues.push(issue("assertion.severity", `${path}.severity`, "Severity must be S0-S3."));
  if (!isNonEmptyText(value.expectedBehavior)) {
    issues.push(
      issue(
        "assertion.expected-behavior",
        `${path}.expectedBehavior`,
        "Expected behavior must be non-empty bounded text.",
      ),
    );
  }
  if (!isHttpsUrl(value.remediationUrl)) {
    issues.push(
      issue(
        "assertion.remediation-url",
        `${path}.remediationUrl`,
        "Remediation URL must be credential-free HTTPS.",
      ),
    );
  }
  if (!isRecord(value.target) || value.target.kind !== "owned-file") {
    issues.push(
      issue("assertion.target", `${path}.target`, "Target must identify an owned logical file."),
    );
  } else if (!isProjectRelativePath(value.target.logicalPath)) {
    issues.push(
      issue(
        "assertion.target-path",
        `${path}.target.logicalPath`,
        "Logical target must be a portable project-relative path.",
      ),
    );
  } else {
    issues.push(...unknownKeyIssues(value.target, ["kind", "logicalPath"], `${path}.target`));
  }

  if (!isRecord(value.adapter) || typeof value.adapter.kind !== "string") {
    issues.push(issue("assertion.adapter", `${path}.adapter`, "Adapter declaration is required."));
    return issues;
  }
  if (value.adapter.version !== "1.0.0") {
    issues.push(
      issue(
        "assertion.adapter-version",
        `${path}.adapter.version`,
        "Only adapter version 1.0.0 is supported.",
      ),
    );
  }
  if (value.mode === "static") {
    if (
      !["file-exists", "json-pointer-equals", "text-excludes", "text-includes"].includes(
        value.adapter.kind,
      )
    ) {
      issues.push(
        issue("assertion.static-adapter", `${path}.adapter.kind`, "Static adapter is unsupported."),
      );
    }
    if (
      (value.adapter.kind === "text-includes" || value.adapter.kind === "text-excludes") &&
      !isNonEmptyText(value.adapter.value, 8_192)
    ) {
      issues.push(
        issue(
          "assertion.text-value",
          `${path}.adapter.value`,
          "Text adapters require a non-empty bounded literal value.",
        ),
      );
    }
    if (value.adapter.kind === "file-exists") {
      issues.push(...unknownKeyIssues(value.adapter, ["kind", "version"], `${path}.adapter`));
    }
    if (value.adapter.kind === "text-includes" || value.adapter.kind === "text-excludes") {
      issues.push(
        ...unknownKeyIssues(value.adapter, ["kind", "version", "value"], `${path}.adapter`),
      );
    }
    if (value.adapter.kind === "json-pointer-equals") {
      issues.push(
        ...unknownKeyIssues(
          value.adapter,
          ["kind", "version", "pointer", "expected"],
          `${path}.adapter`,
        ),
      );
      if (
        typeof value.adapter.pointer !== "string" ||
        (value.adapter.pointer !== "" && !value.adapter.pointer.startsWith("/")) ||
        value.adapter.pointer.length > 512
      ) {
        issues.push(
          issue(
            "assertion.json-pointer",
            `${path}.adapter.pointer`,
            "JSON pointer must be empty or begin with a slash.",
          ),
        );
      }
      if (!("expected" in value.adapter) || !isJsonValue(value.adapter.expected)) {
        issues.push(
          issue(
            "assertion.json-expected",
            `${path}.adapter.expected`,
            "JSON adapter expected value must be bounded JSON data.",
          ),
        );
      }
    }
  } else if (
    value.mode !== undefined &&
    (value.adapter.kind !== "harness" || !isCatalogId(value.adapter.harnessId))
  ) {
    issues.push(
      issue(
        "assertion.harness-adapter",
        `${path}.adapter`,
        "Runtime assertions require a versioned harness adapter id.",
      ),
    );
  } else if (value.mode !== undefined) {
    issues.push(
      ...unknownKeyIssues(value.adapter, ["kind", "version", "harnessId"], `${path}.adapter`),
    );
  }
  return issues;
}

export function validateContractDefinitionV1(
  value: unknown,
): ContractValidationResult<ContractDefinitionV1> {
  const issues: ContractValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      value: null,
      issues: [issue("contract.type", "$", "Contract definition must be an object.")],
    };
  }
  issues.push(
    ...unknownKeyIssues(
      value,
      [
        "schemaVersion",
        "contractVersion",
        "contractId",
        "registryId",
        "itemId",
        "payloadDigest",
        "conformanceClaim",
        "limitations",
        "assertions",
      ],
      "$",
    ),
  );
  if (value.schemaVersion !== 1)
    issues.push(issue("contract.schema-version", "schemaVersion", "schemaVersion must be 1."));
  if (
    !isCatalogId(value.contractId) ||
    !isCatalogId(value.registryId) ||
    !isCatalogId(value.itemId)
  ) {
    issues.push(
      issue(
        "contract.identity",
        "contractId",
        "contractId, registryId, and itemId must be catalog ids.",
      ),
    );
  }
  if (typeof value.contractVersion !== "string" || !semverPattern.test(value.contractVersion)) {
    issues.push(
      issue(
        "contract.version",
        "contractVersion",
        "contractVersion must be an exact semantic version.",
      ),
    );
  }
  if (typeof value.payloadDigest !== "string" || !sha256Pattern.test(value.payloadDigest)) {
    issues.push(
      issue("contract.payload-digest", "payloadDigest", "payloadDigest must be sha256:<64 hex>."),
    );
  }
  if (value.conformanceClaim !== "automated-evidence-only") {
    issues.push(
      issue(
        "contract.claim-boundary",
        "conformanceClaim",
        "Executable contracts must use the automated-evidence-only claim boundary.",
      ),
    );
  }
  if (
    !Array.isArray(value.limitations) ||
    value.limitations.some((entry) => !isNonEmptyText(entry))
  ) {
    issues.push(
      issue("contract.limitations", "limitations", "Limitations must be bounded non-empty text."),
    );
  } else {
    const limitations = value.limitations as string[];
    const ordered = [...limitations].sort(compareText);
    if (new Set(limitations).size !== limitations.length) {
      issues.push(
        issue("contract.limitations-duplicate", "limitations", "Limitations must be unique."),
      );
    }
    if (ordered.some((entry, index) => entry !== limitations[index])) {
      issues.push(
        issue("contract.limitations-order", "limitations", "Limitations must be lexical."),
      );
    }
  }
  if (
    !Array.isArray(value.assertions) ||
    value.assertions.length === 0 ||
    value.assertions.length > 256
  ) {
    issues.push(
      issue("contract.assertions", "assertions", "A contract needs from 1 through 256 assertions."),
    );
  } else {
    value.assertions.forEach((assertion, index) => {
      issues.push(...assertionIssues(assertion, `assertions[${String(index)}]`));
    });
    const assertionIds = value.assertions.map((assertion) =>
      isRecord(assertion) && typeof assertion.id === "string" ? assertion.id : "",
    );
    if (new Set(assertionIds).size !== assertionIds.length) {
      issues.push(
        issue("contract.assertion-duplicate", "assertions", "Assertion ids must be unique."),
      );
    }
    const ordered = [...assertionIds].sort(compareText);
    if (ordered.some((entry, index) => entry !== assertionIds[index])) {
      issues.push(
        issue("contract.assertion-order", "assertions", "Assertions must be ordered lexically."),
      );
    }
  }
  return {
    valid: issues.length === 0,
    value: issues.length === 0 ? (value as unknown as ContractDefinitionV1) : null,
    issues,
  };
}

export function parseContractDefinitionV1(value: unknown): ContractDefinitionV1 {
  const validation = validateContractDefinitionV1(value);
  if (validation.value === null) throw new ContractDefinitionError(validation.issues);
  return validation.value;
}

function resultSortKey(result: AuditAssertionResultV1): string {
  return `${result.registryId}:${result.itemId}:${result.contractId}:${result.assertionId}`;
}

export function validateAuditReportV1(value: unknown): ContractValidationResult<AuditReportV1> {
  const issues: ContractValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      value: null,
      issues: [issue("report.type", "$", "Audit report must be an object.")],
    };
  }
  issues.push(
    ...unknownKeyIssues(
      value,
      [
        "schemaVersion",
        "reportVersion",
        "projectRoot",
        "state",
        "recommendedExitCode",
        "requestedModes",
        "scope",
        "capabilities",
        "limitations",
        "results",
        "summary",
        "networkUsed",
        "conformanceClaim",
      ],
      "$",
    ),
  );
  if (value.schemaVersion !== 1 || value.reportVersion !== "1.0.0") {
    issues.push(issue("report.version", "schemaVersion", "Audit report must use v1."));
  }
  if (value.projectRoot !== "." || value.networkUsed !== false) {
    issues.push(
      issue(
        "report.portability",
        "projectRoot",
        "Audit reports use projectRoot '.' and declare network use explicitly.",
      ),
    );
  }
  if (value.conformanceClaim !== "automated-evidence-only") {
    issues.push(
      issue(
        "report.claim-boundary",
        "conformanceClaim",
        "Audit report cannot claim isolated conformance.",
      ),
    );
  }
  const reportStates = ["fail", "incomplete", "not-applicable", "pass"] as const;
  if (
    !reportStates.includes(value.state as never) ||
    ![0, 1, 7, 10].includes(value.recommendedExitCode as never)
  ) {
    issues.push(
      issue("report.state", "state", "Report state or recommended exit code is invalid."),
    );
  }
  let modes: readonly string[] = [];
  if (
    !Array.isArray(value.requestedModes) ||
    value.requestedModes.length === 0 ||
    value.requestedModes.some((entry) => !AUDIT_MODES.includes(entry as never))
  ) {
    issues.push(issue("report.modes", "requestedModes", "Requested modes are invalid."));
  } else {
    modes = value.requestedModes as string[];
    if (
      new Set(modes).size !== modes.length ||
      [...modes].sort(compareText).some((entry, index) => entry !== modes[index])
    ) {
      issues.push(
        issue("report.mode-order", "requestedModes", "Requested modes must be unique and lexical."),
      );
    }
  }

  if (
    !isRecord(value.scope) ||
    typeof value.scope.changedOnly !== "boolean" ||
    !Array.isArray(value.scope.itemIds)
  ) {
    issues.push(issue("report.scope", "scope", "Report scope is invalid."));
  } else {
    issues.push(...unknownKeyIssues(value.scope, ["changedOnly", "itemIds"], "scope"));
    const itemIds = value.scope.itemIds;
    if (
      itemIds.some(
        (entry) =>
          typeof entry !== "string" ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry),
      ) ||
      new Set(itemIds).size !== itemIds.length ||
      [...itemIds].sort(compareText).some((entry, index) => entry !== itemIds[index])
    ) {
      issues.push(
        issue(
          "report.scope-items",
          "scope.itemIds",
          "Scoped items must be unique lexical qualified ids.",
        ),
      );
    }
  }

  let requestedCapabilityUnavailable = false;
  const registeredHarnessesByMode = new Map<string, ReadonlySet<string>>();
  const requiredHarnessesByMode = new Map<string, ReadonlySet<string>>();
  if (!Array.isArray(value.capabilities) || value.capabilities.length !== AUDIT_MODES.length) {
    issues.push(
      issue("report.capabilities", "capabilities", "Report must describe every audit capability."),
    );
  } else {
    value.capabilities.forEach((capability, index) => {
      if (
        !isRecord(capability) ||
        capability.mode !== AUDIT_MODES[index] ||
        typeof capability.requested !== "boolean" ||
        typeof capability.available !== "boolean" ||
        !(capability.adapter === null || isNonEmptyText(capability.adapter, 128)) ||
        !isOrderedCatalogIdList(capability.registeredHarnessIds, 64) ||
        !isOrderedCatalogIdList(capability.requiredHarnessIds, 256) ||
        !isOrderedCatalogIdList(capability.missingHarnessIds, 256) ||
        !(capability.limitation === null || isNonEmptyText(capability.limitation))
      ) {
        issues.push(
          issue(
            "report.capability",
            `capabilities[${String(index)}]`,
            "Capability records must be complete and ordered by mode.",
          ),
        );
      } else {
        issues.push(
          ...unknownKeyIssues(
            capability,
            [
              "mode",
              "requested",
              "available",
              "adapter",
              "registeredHarnessIds",
              "requiredHarnessIds",
              "missingHarnessIds",
              "limitation",
            ],
            `capabilities[${String(index)}]`,
          ),
        );
        if (capability.requested !== modes.includes(String(capability.mode))) {
          issues.push(
            issue(
              "report.capability-request",
              `capabilities[${String(index)}].requested`,
              "Capability request state must match requestedModes.",
            ),
          );
        }
        const registered = capability.registeredHarnessIds;
        const required = capability.requiredHarnessIds;
        const reportedMissing = capability.missingHarnessIds as string[];
        const missing = required.filter((id) => !registered.includes(id));
        const expectedAvailable =
          capability.mode === "static" ||
          (missing.length === 0 && (required.length > 0 || registered.length > 0));
        const expectedAdapter =
          capability.mode === "static"
            ? capability.adapter
            : registered.length === 1
              ? registered[0]
              : null;
        if (
          missing.length !== reportedMissing.length ||
          missing.some((id, missingIndex) => id !== reportedMissing[missingIndex]) ||
          capability.available !== expectedAvailable ||
          capability.adapter !== expectedAdapter ||
          (capability.available
            ? capability.limitation !== null
            : capability.limitation === null) ||
          (capability.mode === "static" &&
            (capability.adapter === null ||
              registered.length > 0 ||
              required.length > 0 ||
              reportedMissing.length > 0))
        ) {
          issues.push(
            issue(
              "report.capability-state",
              `capabilities[${String(index)}]`,
              "Capability availability does not match its exact adapter state.",
            ),
          );
        }
        registeredHarnessesByMode.set(String(capability.mode), new Set(registered));
        requiredHarnessesByMode.set(String(capability.mode), new Set(required));
        if (capability.requested && !capability.available) requestedCapabilityUnavailable = true;
      }
    });
  }

  const limitations = Array.isArray(value.limitations) ? value.limitations : [];
  if (
    !Array.isArray(value.limitations) ||
    limitations.some((entry) => !isNonEmptyText(entry)) ||
    new Set(limitations).size !== limitations.length ||
    [...limitations]
      .map(String)
      .sort(compareText)
      .some((entry, index) => entry !== limitations[index])
  ) {
    issues.push(
      issue("report.limitations", "limitations", "Report limitations must be unique lexical text."),
    );
  }

  const results: AuditAssertionResultV1[] = [];
  if (!Array.isArray(value.results)) {
    issues.push(issue("report.results", "results", "Audit results must be an array."));
  } else {
    for (const [index, rawResult] of value.results.entries()) {
      if (!isRecord(rawResult)) {
        issues.push(
          issue(
            "report.result-type",
            `results[${String(index)}]`,
            "Audit result must be an object.",
          ),
        );
        continue;
      }
      const result = rawResult as unknown as AuditAssertionResultV1;
      issues.push(
        ...unknownKeyIssues(
          rawResult,
          [
            "assertionId",
            "contractId",
            "contractVersion",
            "payloadDigest",
            "registryId",
            "itemId",
            "mode",
            "evidenceType",
            "harnessId",
            "target",
            "expectedBehavior",
            "actualBehavior",
            "severity",
            "remediationUrl",
            "state",
            "failure",
            "context",
          ],
          `results[${String(index)}]`,
        ),
      );
      if (
        !isCatalogId(result.assertionId) ||
        !isCatalogId(result.contractId) ||
        !isCatalogId(result.registryId) ||
        !isCatalogId(result.itemId)
      ) {
        issues.push(
          issue("report.result-identity", `results[${String(index)}]`, "Result ids are invalid."),
        );
      }
      if (typeof result.payloadDigest !== "string" || !sha256Pattern.test(result.payloadDigest)) {
        issues.push(
          issue(
            "report.payload-digest",
            `results[${String(index)}].payloadDigest`,
            "Result payloadDigest must bind immutable payload bytes.",
          ),
        );
      }
      if (
        typeof result.contractVersion !== "string" ||
        !semverPattern.test(result.contractVersion) ||
        !AUDIT_MODES.includes(result.mode) ||
        !AUDIT_EVIDENCE_TYPES.includes(result.evidenceType) ||
        expectedEvidenceType[result.mode] !== result.evidenceType ||
        !AUDIT_SEVERITIES.includes(result.severity) ||
        !isNonEmptyText(result.expectedBehavior) ||
        !isNonEmptyText(result.actualBehavior) ||
        !isHttpsUrl(result.remediationUrl) ||
        !["fail", "not-applicable", "not-run", "pass"].includes(result.state)
      ) {
        issues.push(
          issue(
            "report.result-fields",
            `results[${String(index)}]`,
            "Audit result fields do not match the v1 vocabulary.",
          ),
        );
      }
      const failureValid =
        result.failure !== null &&
        isRecord(result.failure) &&
        result.failure.classification in AUDIT_FAILURE_GUIDANCE &&
        typeof result.failure.code === "string" &&
        result.failure.code.length <= 128 &&
        /^[A-Z][A-Z0-9_]*$/u.test(result.failure.code);
      if (result.failure !== null && !failureValid) {
        issues.push(
          issue(
            "report.failure-classification",
            `results[${String(index)}].failure`,
            "Failure classification is unsupported.",
          ),
        );
      }
      if (failureValid) {
        issues.push(
          ...unknownKeyIssues(
            result.failure as unknown as Record<string, unknown>,
            ["classification", "code"],
            `results[${String(index)}].failure`,
          ),
        );
      }
      if (
        (result.state === "pass" || result.state === "not-applicable") !==
        (result.failure === null)
      ) {
        issues.push(
          issue(
            "report.failure-state",
            `results[${String(index)}].failure`,
            "Passing/not-applicable results have no failure; fail/not-run results require one.",
          ),
        );
      }
      if (
        !isRecord(result.target) ||
        !isProjectRelativePath(result.target.logicalPath) ||
        (result.target.projectPath !== null && !isProjectRelativePath(result.target.projectPath))
      ) {
        issues.push(
          issue(
            "report.target-path",
            `results[${String(index)}].target.projectPath`,
            "Result target path must be project-relative.",
          ),
        );
      } else {
        issues.push(
          ...unknownKeyIssues(
            result.target as unknown as Record<string, unknown>,
            ["logicalPath", "projectPath"],
            `results[${String(index)}].target`,
          ),
        );
      }
      if (result.mode === "static") {
        if (result.harnessId !== null || result.context !== null) {
          issues.push(
            issue(
              "report.static-context",
              `results[${String(index)}].context`,
              "Static audit results cannot claim runtime harness evidence.",
            ),
          );
        }
      } else if (runtimeModes.includes(result.mode as RuntimeAuditMode)) {
        const harnessIdValid = isCatalogId(result.harnessId);
        const contextValid =
          result.context !== null && isCanonicalRuntimeAuditContextV1(result.context);
        if (!harnessIdValid) {
          issues.push(
            issue(
              "report.harness-id",
              `results[${String(index)}].harnessId`,
              "Runtime audit results must identify the selected reviewed harness.",
            ),
          );
        }
        if (
          (result.state === "not-run" && result.context !== null) ||
          (result.state !== "not-run" && !contextValid) ||
          (contextValid &&
            result.state !== "not-applicable" &&
            !runtimeContextHasModeEvidenceV1(result.mode as RuntimeAuditMode, result.context!))
        ) {
          issues.push(
            issue(
              "report.runtime-context",
              `results[${String(index)}].context`,
              "Runtime result context must be canonical, bounded, and mode-relevant when executed.",
            ),
          );
        }
        if (harnessIdValid) {
          const required = requiredHarnessesByMode.get(result.mode);
          const registered = registeredHarnessesByMode.get(result.mode);
          if (required !== undefined && !required.has(result.harnessId)) {
            issues.push(
              issue(
                "report.harness-required",
                `results[${String(index)}].harnessId`,
                "Runtime result harness is absent from capability requirements.",
              ),
            );
          }
          if (
            result.context !== null &&
            registered !== undefined &&
            !registered.has(result.harnessId)
          ) {
            issues.push(
              issue(
                "report.harness-unregistered",
                `results[${String(index)}].harnessId`,
                "Executed runtime evidence must come from a registered trusted harness.",
              ),
            );
          }
        }
      }
      results.push(result);
    }
    const keys = results.map(resultSortKey);
    const sorted = [...keys].sort(compareText);
    if (new Set(keys).size !== keys.length) {
      issues.push(issue("report.result-duplicate", "results", "Audit result ids must be unique."));
    }
    if (sorted.some((entry, index) => entry !== keys[index])) {
      issues.push(issue("report.result-order", "results", "Audit results must be deterministic."));
    }
  }

  const observedSummary = {
    pass: results.filter(({ state }) => state === "pass").length,
    fail: results.filter(({ state }) => state === "fail").length,
    notApplicable: results.filter(({ state }) => state === "not-applicable").length,
    notRun: results.filter(({ state }) => state === "not-run").length,
  };
  const summary = isRecord(value.summary) ? value.summary : {};
  if (
    !isRecord(value.summary) ||
    Object.entries(observedSummary).some(([key, count]) => summary[key] !== count)
  ) {
    issues.push(issue("report.summary", "summary", "Report summary does not match results."));
  } else {
    issues.push(
      ...unknownKeyIssues(value.summary, ["pass", "fail", "notApplicable", "notRun"], "summary"),
    );
  }

  const hasAdapterError = results.some(
    ({ failure }) => failure?.classification === "adapter-error",
  );
  const hasFailure = results.some(({ state }) => state === "fail");
  const hasNotRun = results.some(({ state }) => state === "not-run");
  const hasPass = results.some(({ state }) => state === "pass");
  const expectedOverall = hasAdapterError
    ? { state: "incomplete", exitCode: 1 }
    : hasFailure
      ? { state: "fail", exitCode: 10 }
      : hasNotRun || requestedCapabilityUnavailable
        ? { state: "incomplete", exitCode: 7 }
        : hasPass
          ? { state: "pass", exitCode: 0 }
          : { state: "not-applicable", exitCode: 0 };
  if (
    value.state !== expectedOverall.state ||
    value.recommendedExitCode !== expectedOverall.exitCode
  ) {
    issues.push(
      issue(
        "report.aggregate",
        "state",
        "Report aggregate state and exit guidance do not match evidence.",
      ),
    );
  }
  return {
    valid: issues.length === 0,
    value: issues.length === 0 ? (value as unknown as AuditReportV1) : null,
    issues,
  };
}

function canonicalValue(value: unknown, ancestors: ReadonlySet<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON requires finite numbers.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`Canonical JSON cannot contain ${typeof value}.`);
  }
  if (ancestors.has(value)) throw new TypeError("Canonical JSON cannot contain cycles.");
  const next = new Set(ancestors);
  next.add(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalValue(entry, next)).join(",")}]`;
  }
  if (!isRecord(value)) throw new TypeError("Canonical JSON requires plain records.");
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Canonical JSON requires plain records.");
  }
  return `{${Object.keys(value)
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key], next)}`)
    .join(",")}}`;
}

export function canonicalAuditJson(value: unknown): string {
  return canonicalValue(value, new Set<object>());
}

export function defineContractV1<const T extends ContractDefinitionV1>(definition: T): T {
  parseContractDefinitionV1(definition);
  return definition;
}

export function assertionEvidenceType(assertion: ContractAssertionV1): string {
  return assertion.evidenceType;
}
