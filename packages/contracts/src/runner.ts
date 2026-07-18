import {
  AUDIT_FAILURE_GUIDANCE,
  AUDIT_MODES,
  type AuditAssertionResultV1,
  type AuditCapabilityV1,
  type AuditFailureClassification,
  type AuditMode,
  type AuditRecommendedExitCode,
  type AuditReportState,
  type AuditReportV1,
  type ContractAssertionV1,
  type ContractDefinitionV1,
  type JsonValue,
  type RunContractAuditOptions,
  type StaticAuditTargetAdapter,
  type StaticTargetSnapshot,
} from "./model.js";
import { canonicalAuditJson, parseContractDefinitionV1 } from "./validation.js";

const STATIC_LIMITATIONS = [
  "Automated audit evidence is not a claim of complete WCAG conformance.",
  "Static source checks cannot establish computed accessibility trees, focus movement, keyboard behavior, layout geometry, browser interoperability, or assistive-technology output.",
] as const;

const CAPABILITY_LIMITATIONS = {
  a11y: "The static adapter cannot inspect a computed accessibility tree or run axe.",
  browser: "The static adapter cannot execute a browser harness.",
  keyboard: "The static adapter cannot observe focus movement or keyboard interaction.",
  responsive: "The static adapter cannot measure rendered geometry or reflow.",
  static: null,
} as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requestedModes(input: readonly AuditMode[] | undefined): readonly AuditMode[] {
  const modes = input ?? ["static"];
  const unique = [...new Set(modes)].sort(compareText);
  if (unique.length === 0 || unique.some((mode) => !AUDIT_MODES.includes(mode))) {
    throw new TypeError("At least one supported audit mode is required.");
  }
  return unique;
}

function decodePointerSegment(value: string): string | null {
  if (/~(?:[^01]|$)/u.test(value)) return null;
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function jsonPointer(
  value: JsonValue,
  pointer: string,
): { readonly found: boolean; readonly value?: JsonValue } {
  if (pointer === "") return { found: true, value };
  let current: JsonValue = value;
  for (const encoded of pointer.slice(1).split("/")) {
    const segment = decodePointerSegment(encoded);
    if (segment === null) return { found: false };
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/u.test(segment)) return { found: false };
      const index = Number(segment);
      if (index >= current.length) return { found: false };
      const next = current[index];
      if (next === undefined) return { found: false };
      current = next;
      continue;
    }
    if (current === null || typeof current !== "object" || !(segment in current)) {
      return { found: false };
    }
    current = (current as { readonly [key: string]: JsonValue })[segment] as JsonValue;
  }
  return { found: true, value: current };
}

function failure(
  assertion: ContractAssertionV1,
  contract: ContractDefinitionV1,
  snapshot: Pick<StaticTargetSnapshot, "projectPath">,
  classification: AuditFailureClassification,
  code: string,
  actualBehavior: string,
  state: "fail" | "not-run" = "fail",
): AuditAssertionResultV1 {
  return {
    assertionId: assertion.id,
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    payloadDigest: contract.payloadDigest,
    registryId: contract.registryId,
    itemId: contract.itemId,
    mode: assertion.mode,
    evidenceType: assertion.evidenceType,
    target: {
      logicalPath: assertion.target.logicalPath,
      projectPath: snapshot.projectPath,
    },
    expectedBehavior: assertion.expectedBehavior,
    actualBehavior,
    severity: assertion.severity,
    remediationUrl: assertion.remediationUrl,
    state,
    failure: { classification, code },
  };
}

function passed(
  assertion: ContractAssertionV1,
  contract: ContractDefinitionV1,
  projectPath: string,
  actualBehavior: string,
): AuditAssertionResultV1 {
  return {
    assertionId: assertion.id,
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    payloadDigest: contract.payloadDigest,
    registryId: contract.registryId,
    itemId: contract.itemId,
    mode: assertion.mode,
    evidenceType: assertion.evidenceType,
    target: { logicalPath: assertion.target.logicalPath, projectPath },
    expectedBehavior: assertion.expectedBehavior,
    actualBehavior,
    severity: assertion.severity,
    remediationUrl: assertion.remediationUrl,
    state: "pass",
    failure: null,
  };
}

function unavailableBehavior(
  snapshot: Extract<StaticTargetSnapshot, { state: "unavailable" }>,
): string {
  const messages = {
    "invalid-utf8": "The mapped target is not valid UTF-8 text.",
    "not-a-file": "The mapped target is not a regular file.",
    "read-error": "The mapped target could not be read safely.",
    "target-too-large": "The mapped target exceeds the static adapter byte limit.",
    "target-unmapped": "The contract logical target is not mapped by the installed manifest item.",
  } as const;
  return messages[snapshot.reason];
}

async function runStaticAssertion(
  contract: ContractDefinitionV1,
  assertion: Extract<ContractAssertionV1, { mode: "static" }>,
  targetAdapter: StaticAuditTargetAdapter,
): Promise<AuditAssertionResultV1> {
  let snapshot: StaticTargetSnapshot;
  try {
    snapshot = await targetAdapter.readTarget({
      registryId: contract.registryId,
      itemId: contract.itemId,
      logicalPath: assertion.target.logicalPath,
    });
  } catch {
    return failure(
      assertion,
      contract,
      { projectPath: null },
      "adapter-error",
      "AUDIT_ADAPTER_FAILED",
      "The static target adapter failed without recording an assertion pass.",
      "not-run",
    );
  }
  if (snapshot.state === "unavailable") {
    return failure(
      assertion,
      contract,
      snapshot,
      "target-unavailable",
      `AUDIT_TARGET_${snapshot.reason.replaceAll("-", "_").toUpperCase()}`,
      unavailableBehavior(snapshot),
    );
  }
  if (snapshot.state === "missing") {
    return failure(
      assertion,
      contract,
      snapshot,
      "target-unavailable",
      "AUDIT_TARGET_MISSING",
      "The mapped target file is missing.",
    );
  }

  const { adapter } = assertion;
  if (adapter.kind === "file-exists") {
    return passed(
      assertion,
      contract,
      snapshot.projectPath,
      "The mapped target is a regular file.",
    );
  }
  if (adapter.kind === "text-includes") {
    return snapshot.content.includes(adapter.value)
      ? passed(assertion, contract, snapshot.projectPath, "The required literal text is present.")
      : failure(
          assertion,
          contract,
          snapshot,
          "assertion-failed",
          "AUDIT_REQUIRED_TEXT_MISSING",
          "The required literal text is absent.",
        );
  }
  if (adapter.kind === "text-excludes") {
    return !snapshot.content.includes(adapter.value)
      ? passed(assertion, contract, snapshot.projectPath, "The prohibited literal text is absent.")
      : failure(
          assertion,
          contract,
          snapshot,
          "assertion-failed",
          "AUDIT_PROHIBITED_TEXT_PRESENT",
          "The prohibited literal text is present.",
        );
  }

  let parsed: JsonValue;
  try {
    parsed = JSON.parse(snapshot.content) as JsonValue;
  } catch {
    return failure(
      assertion,
      contract,
      snapshot,
      "assertion-failed",
      "AUDIT_TARGET_JSON_INVALID",
      "The mapped target is not valid JSON.",
    );
  }
  const observed = jsonPointer(parsed, adapter.pointer);
  if (!observed.found) {
    return failure(
      assertion,
      contract,
      snapshot,
      "assertion-failed",
      "AUDIT_JSON_POINTER_MISSING",
      "The required JSON pointer does not resolve.",
    );
  }
  return canonicalAuditJson(observed.value) === canonicalAuditJson(adapter.expected)
    ? passed(
        assertion,
        contract,
        snapshot.projectPath,
        "The JSON pointer matches the expected canonical value.",
      )
    : failure(
        assertion,
        contract,
        snapshot,
        "assertion-failed",
        "AUDIT_JSON_VALUE_MISMATCH",
        "The JSON pointer does not match the expected canonical value.",
      );
}

function unavailableRuntimeResult(
  contract: ContractDefinitionV1,
  assertion: Exclude<ContractAssertionV1, { mode: "static" }>,
): AuditAssertionResultV1 {
  return failure(
    assertion,
    contract,
    { projectPath: null },
    "capability-unavailable",
    `AUDIT_${assertion.mode.toUpperCase()}_HARNESS_REQUIRED`,
    CAPABILITY_LIMITATIONS[assertion.mode],
    "not-run",
  );
}

function summarize(results: readonly AuditAssertionResultV1[]): AuditReportV1["summary"] {
  return {
    pass: results.filter(({ state }) => state === "pass").length,
    fail: results.filter(({ state }) => state === "fail").length,
    notApplicable: results.filter(({ state }) => state === "not-applicable").length,
    notRun: results.filter(({ state }) => state === "not-run").length,
  };
}

function reportState(
  results: readonly AuditAssertionResultV1[],
  capabilities: readonly AuditCapabilityV1[],
): { readonly state: AuditReportState; readonly exitCode: AuditRecommendedExitCode } {
  if (results.some(({ failure: entry }) => entry?.classification === "adapter-error")) {
    return { state: "incomplete", exitCode: AUDIT_FAILURE_GUIDANCE["adapter-error"].exitCode };
  }
  if (results.some(({ state }) => state === "fail")) {
    return { state: "fail", exitCode: AUDIT_FAILURE_GUIDANCE["assertion-failed"].exitCode };
  }
  if (
    results.some(({ state }) => state === "not-run") ||
    capabilities.some(({ requested, available }) => requested && !available)
  ) {
    return {
      state: "incomplete",
      exitCode: AUDIT_FAILURE_GUIDANCE["capability-unavailable"].exitCode,
    };
  }
  if (results.some(({ state }) => state === "pass")) return { state: "pass", exitCode: 0 };
  return { state: "not-applicable", exitCode: 0 };
}

function resultKey(result: AuditAssertionResultV1): string {
  return `${result.registryId}:${result.itemId}:${result.contractId}:${result.assertionId}`;
}

export async function runContractAuditV1(
  definitions: readonly ContractDefinitionV1[],
  targetAdapter: StaticAuditTargetAdapter,
  options: RunContractAuditOptions = {},
): Promise<AuditReportV1> {
  const modes = requestedModes(options.requestedModes);
  const validated = definitions.map((definition) => parseContractDefinitionV1(definition));
  const definitionKeys = new Set<string>();
  for (const definition of validated) {
    const key = `${definition.registryId}:${definition.itemId}:${definition.contractId}`;
    if (definitionKeys.has(key)) throw new TypeError(`Duplicate contract definition ${key}.`);
    definitionKeys.add(key);
  }

  const results: AuditAssertionResultV1[] = [];
  for (const contract of [...validated].sort((left, right) =>
    compareText(
      `${left.registryId}:${left.itemId}:${left.contractId}`,
      `${right.registryId}:${right.itemId}:${right.contractId}`,
    ),
  )) {
    for (const assertion of contract.assertions) {
      if (!modes.includes(assertion.mode)) continue;
      results.push(
        assertion.mode === "static"
          ? await runStaticAssertion(contract, assertion, targetAdapter)
          : unavailableRuntimeResult(contract, assertion),
      );
    }
  }
  results.sort((left, right) => compareText(resultKey(left), resultKey(right)));

  const capabilities: readonly AuditCapabilityV1[] = AUDIT_MODES.map((mode) => ({
    mode,
    requested: modes.includes(mode),
    available: mode === "static",
    adapter: mode === "static" ? targetAdapter.id : null,
    limitation: CAPABILITY_LIMITATIONS[mode],
  }));
  const overall = reportState(results, capabilities);
  const limitations = [
    ...STATIC_LIMITATIONS,
    ...validated.flatMap(({ limitations: entries }) => entries),
  ]
    .filter((entry, index, entries) => entries.indexOf(entry) === index)
    .sort(compareText);

  return {
    schemaVersion: 1,
    reportVersion: "1.0.0",
    projectRoot: ".",
    state: overall.state,
    recommendedExitCode: overall.exitCode,
    requestedModes: modes,
    scope: {
      changedOnly: options.changedOnly ?? false,
      itemIds: [
        ...new Set(validated.map(({ registryId, itemId }) => `${registryId}:${itemId}`)),
      ].sort(compareText),
    },
    capabilities,
    limitations,
    results,
    summary: summarize(results),
    networkUsed: false,
    conformanceClaim: "automated-evidence-only",
  };
}
