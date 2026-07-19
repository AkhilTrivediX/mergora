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
  type RuntimeAuditMode,
  type RuntimeContractAssertionV1,
  type RuntimeHarnessExecutionV1,
  type RuntimeHarnessInvocationV1,
  type StaticAuditTargetAdapter,
  type StaticTargetSnapshot,
  type TrustedRuntimeHarnessAdapterV1,
} from "./model.js";
import { normalizeRuntimeHarnessOutcomeV1 } from "./runtime-harness.js";
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

const MAX_TRUSTED_RUNTIME_ADAPTERS = 64;
const MAX_REQUIRED_HARNESSES_PER_MODE = 256;
const MAX_CONTRACT_DEFINITIONS = 1_024;
const DEFAULT_RUNTIME_TIMEOUT_MS = 10_000;
const catalogIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const runtimeModes = AUDIT_MODES.filter((mode): mode is RuntimeAuditMode => mode !== "static");

interface TrustedAdapterRegistry {
  readonly byId: ReadonlyMap<string, RegisteredTrustedRuntimeAdapter>;
  readonly byMode: ReadonlyMap<RuntimeAuditMode, readonly string[]>;
}

interface RegisteredTrustedRuntimeAdapter {
  readonly harnessId: string;
  readonly modes: readonly RuntimeAuditMode[];
  run(
    input: RuntimeHarnessInvocationV1,
    execution: RuntimeHarnessExecutionV1,
  ): unknown | Promise<unknown>;
}

class RuntimeHarnessTimeoutError extends Error {
  public constructor() {
    super("The trusted runtime harness exceeded its host-controlled timeout.");
    this.name = "RuntimeHarnessTimeoutError";
  }
}

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

function runtimeTimeoutMs(input: number | undefined): number {
  const timeout = input ?? DEFAULT_RUNTIME_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout < 10 || timeout > 120_000) {
    throw new TypeError("Runtime audit timeout must be an integer from 10 through 120000 ms.");
  }
  return timeout;
}

function trustedAdapterRegistry(
  input: readonly TrustedRuntimeHarnessAdapterV1[] | undefined,
): TrustedAdapterRegistry {
  const adapters = input ?? [];
  if (adapters.length > MAX_TRUSTED_RUNTIME_ADAPTERS) {
    throw new TypeError("Trusted runtime adapter count exceeds the supported limit.");
  }
  const byId = new Map<string, RegisteredTrustedRuntimeAdapter>();
  const byMode = new Map<RuntimeAuditMode, string[]>(
    runtimeModes.map((mode) => [mode, []] as const),
  );
  for (const adapter of adapters) {
    if (
      adapter === null ||
      typeof adapter !== "object" ||
      typeof adapter.harnessId !== "string" ||
      adapter.harnessId.length > 128 ||
      !catalogIdPattern.test(adapter.harnessId) ||
      typeof adapter.run !== "function" ||
      !Array.isArray(adapter.modes) ||
      adapter.modes.length === 0 ||
      adapter.modes.length > runtimeModes.length ||
      adapter.modes.some((mode) => !runtimeModes.includes(mode)) ||
      new Set(adapter.modes).size !== adapter.modes.length ||
      [...adapter.modes].sort(compareText).some((mode, index) => mode !== adapter.modes[index])
    ) {
      throw new TypeError("Trusted runtime adapter registration is invalid.");
    }
    if (byId.has(adapter.harnessId)) {
      throw new TypeError(`Duplicate trusted runtime adapter ${adapter.harnessId}.`);
    }
    const run = adapter.run.bind(adapter);
    byId.set(adapter.harnessId, {
      harnessId: adapter.harnessId,
      modes: [...adapter.modes],
      run,
    });
    for (const mode of adapter.modes) byMode.get(mode)!.push(adapter.harnessId);
  }
  for (const ids of byMode.values()) ids.sort(compareText);
  return { byId, byMode };
}

async function boundedRuntimeExecution(
  adapter: RegisteredTrustedRuntimeAdapter,
  invocation: RuntimeHarnessInvocationV1,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() =>
        adapter.run(invocation, Object.freeze({ signal: controller.signal })),
      ),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new RuntimeHarnessTimeoutError());
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
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
    harnessId: assertion.mode === "static" ? null : assertion.adapter.harnessId,
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
    context: null,
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
    harnessId: null,
    target: { logicalPath: assertion.target.logicalPath, projectPath },
    expectedBehavior: assertion.expectedBehavior,
    actualBehavior,
    severity: assertion.severity,
    remediationUrl: assertion.remediationUrl,
    state: "pass",
    failure: null,
    context: null,
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

async function runRuntimeAssertion(
  contract: ContractDefinitionV1,
  assertion: RuntimeContractAssertionV1,
  adapters: TrustedAdapterRegistry,
  timeoutMs: number,
): Promise<AuditAssertionResultV1> {
  const adapter = adapters.byId.get(assertion.adapter.harnessId);
  if (adapter === undefined || !adapter.modes.includes(assertion.mode)) {
    return unavailableRuntimeResult(contract, assertion);
  }
  const invocation: RuntimeHarnessInvocationV1 = {
    harnessId: assertion.adapter.harnessId,
    contract: {
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      payloadDigest: contract.payloadDigest,
      registryId: contract.registryId,
      itemId: contract.itemId,
    },
    assertion: {
      assertionId: assertion.id,
      mode: assertion.mode,
      evidenceType: assertion.evidenceType,
      target: { ...assertion.target },
      expectedBehavior: assertion.expectedBehavior,
      severity: assertion.severity,
      remediationUrl: assertion.remediationUrl,
    },
  };
  let rawOutcome: unknown;
  try {
    rawOutcome = await boundedRuntimeExecution(adapter, invocation, timeoutMs);
  } catch (error) {
    const timedOut = error instanceof RuntimeHarnessTimeoutError;
    return failure(
      assertion,
      contract,
      { projectPath: null },
      "adapter-error",
      timedOut ? "AUDIT_HARNESS_TIMEOUT" : "AUDIT_HARNESS_FAILED",
      timedOut
        ? "The trusted runtime harness exceeded its host-controlled time limit."
        : "The trusted runtime harness failed without recording an assertion result.",
      "not-run",
    );
  }
  let outcome;
  try {
    outcome = normalizeRuntimeHarnessOutcomeV1(rawOutcome, assertion.mode);
  } catch {
    return failure(
      assertion,
      contract,
      { projectPath: null },
      "adapter-error",
      "AUDIT_HARNESS_RESULT_INVALID",
      "The trusted runtime harness returned malformed or unbounded evidence.",
      "not-run",
    );
  }
  return {
    assertionId: assertion.id,
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    payloadDigest: contract.payloadDigest,
    registryId: contract.registryId,
    itemId: contract.itemId,
    mode: assertion.mode,
    evidenceType: assertion.evidenceType,
    harnessId: assertion.adapter.harnessId,
    target: {
      logicalPath: assertion.target.logicalPath,
      projectPath: outcome.projectPath,
    },
    expectedBehavior: assertion.expectedBehavior,
    actualBehavior: outcome.actualBehavior,
    severity: assertion.severity,
    remediationUrl: assertion.remediationUrl,
    state: outcome.state,
    failure:
      outcome.state === "fail"
        ? { classification: "assertion-failed", code: outcome.failureCode! }
        : null,
    context: outcome.context,
  };
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
  const adapters = trustedAdapterRegistry(options.trustedRuntimeAdapters);
  const timeoutMs = runtimeTimeoutMs(options.runtimeTimeoutMs);
  if (
    targetAdapter === null ||
    typeof targetAdapter !== "object" ||
    typeof targetAdapter.id !== "string" ||
    targetAdapter.id.length > 128 ||
    !catalogIdPattern.test(targetAdapter.id) ||
    typeof targetAdapter.readTarget !== "function"
  ) {
    throw new TypeError("Static audit target adapter registration is invalid.");
  }
  const staticAdapter: StaticAuditTargetAdapter = {
    id: targetAdapter.id,
    readTarget: targetAdapter.readTarget.bind(targetAdapter),
  };
  if (definitions.length > MAX_CONTRACT_DEFINITIONS) {
    throw new TypeError("Contract definition count exceeds the supported audit limit.");
  }
  const validated = definitions.map((definition) => {
    const parsed = parseContractDefinitionV1(definition);
    return parseContractDefinitionV1(JSON.parse(canonicalAuditJson(parsed)) as unknown);
  });
  const definitionKeys = new Set<string>();
  for (const definition of validated) {
    const key = `${definition.registryId}:${definition.itemId}:${definition.contractId}`;
    if (definitionKeys.has(key)) throw new TypeError(`Duplicate contract definition ${key}.`);
    definitionKeys.add(key);
  }
  const requiredHarnessesByMode = new Map<RuntimeAuditMode, readonly string[]>();
  for (const mode of runtimeModes) {
    const ids = [
      ...new Set(
        validated.flatMap((contract) =>
          contract.assertions.flatMap((assertion) =>
            assertion.mode === mode ? [assertion.adapter.harnessId] : [],
          ),
        ),
      ),
    ].sort(compareText);
    if (ids.length > MAX_REQUIRED_HARNESSES_PER_MODE) {
      throw new TypeError(`Required ${mode} harness count exceeds the supported limit.`);
    }
    requiredHarnessesByMode.set(mode, ids);
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
          ? await runStaticAssertion(contract, assertion, staticAdapter)
          : await runRuntimeAssertion(contract, assertion, adapters, timeoutMs),
      );
    }
  }
  results.sort((left, right) => compareText(resultKey(left), resultKey(right)));

  const capabilities: readonly AuditCapabilityV1[] = AUDIT_MODES.map((mode) => {
    const requiredHarnessIds = mode === "static" ? [] : requiredHarnessesByMode.get(mode)!;
    const registeredHarnessIds = mode === "static" ? [] : adapters.byMode.get(mode);
    const registered = registeredHarnessIds ?? [];
    const availableSet = new Set(registered);
    const missingHarnessIds = requiredHarnessIds.filter((id) => !availableSet.has(id));
    const available =
      mode === "static" ||
      (missingHarnessIds.length === 0 && (requiredHarnessIds.length > 0 || registered.length > 0));
    return {
      mode,
      requested: modes.includes(mode),
      available,
      adapter:
        mode === "static" ? staticAdapter.id : registered.length === 1 ? registered[0]! : null,
      registeredHarnessIds: registered,
      requiredHarnessIds,
      missingHarnessIds,
      limitation: available ? null : CAPABILITY_LIMITATIONS[mode],
    };
  });
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
