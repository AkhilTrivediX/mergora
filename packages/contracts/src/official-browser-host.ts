import type {
  RuntimeAuditMode,
  RuntimeHarnessExecutionV1,
  RuntimeHarnessInvocationV1,
  TrustedRuntimeHarnessAdapterV1,
} from "./model.js";

export const OFFICIAL_BROWSER_HOST_ID = "mergora-official-browser-host" as const;
export const OFFICIAL_BROWSER_HOST_PROTOCOL_VERSION = "1.0.0" as const;

const DEFAULT_MAX_OUTPUT_BYTES = 131_072;
const MAX_HOST_OUTPUT_BYTES = 1_048_576;
const MAX_HARNESSES = 64;
const MAX_CONTRACTS = 4_096;
const MAX_ASSERTIONS_PER_CONTRACT = 256;
const catalogIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const semverPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const runtimeModes = ["a11y", "browser", "keyboard", "responsive"] as const;

/** Exact immutable Contract route compiled into a trusted browser host. */
export interface OfficialBrowserHostContractBindingV1 {
  readonly registryId: string;
  readonly itemId: string;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly payloadDigest: string;
  readonly assertionIds: readonly string[];
}

/** A reviewed harness and the exact Contract routes it is allowed to execute. */
export interface OfficialBrowserHostHarnessV1 {
  readonly harnessId: string;
  readonly modes: readonly RuntimeAuditMode[];
  readonly contracts: readonly OfficialBrowserHostContractBindingV1[];
}

/**
 * Serializable dispatch metadata. Expected-behavior prose and remediation URLs
 * are deliberately omitted so registry data can never become host commands.
 */
export interface OfficialBrowserHostRequestV1 {
  readonly protocolVersion: typeof OFFICIAL_BROWSER_HOST_PROTOCOL_VERSION;
  readonly harnessId: string;
  readonly contract: {
    readonly registryId: string;
    readonly itemId: string;
    readonly contractId: string;
    readonly contractVersion: string;
    readonly payloadDigest: string;
  };
  readonly assertion: {
    readonly assertionId: string;
    readonly mode: RuntimeAuditMode;
    readonly evidenceType:
      "accessibility-tree" | "browser-behavior" | "keyboard-behavior" | "responsive-geometry";
  };
}

export interface OfficialBrowserHostExecutionV1 {
  readonly signal: AbortSignal;
}

/**
 * Opt-in host injection point. The published contracts/CLI packages do not
 * import a browser engine or accept an executable host from registry JSON.
 */
export interface OfficialBrowserHostV1 {
  readonly hostId: typeof OFFICIAL_BROWSER_HOST_ID;
  readonly protocolVersion: typeof OFFICIAL_BROWSER_HOST_PROTOCOL_VERSION;
  readonly harnesses: readonly OfficialBrowserHostHarnessV1[];
  execute(
    request: OfficialBrowserHostRequestV1,
    execution: OfficialBrowserHostExecutionV1,
  ): unknown | Promise<unknown>;
}

export interface OfficialBrowserHostAdapterOptionsV1 {
  /** UTF-8 cap applied before runtime outcome normalization. */
  readonly maxOutputBytes?: number;
}

interface NormalizedHarness {
  readonly harnessId: string;
  readonly modes: readonly RuntimeAuditMode[];
  readonly contracts: ReadonlyMap<string, ReadonlySet<string>>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const observed = Object.keys(value).sort(compareText);
  const required = [...expected].sort(compareText);
  return (
    observed.length === required.length &&
    observed.every((entry, index) => entry === required[index])
  );
}

function isCatalogId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && catalogIdPattern.test(value);
}

function bindingKey(value: {
  readonly registryId: string;
  readonly itemId: string;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly payloadDigest: string;
}): string {
  return `${value.registryId}:${value.itemId}:${value.contractId}:${value.contractVersion}:${value.payloadDigest}`;
}

function normalizedBinding(
  value: unknown,
): readonly [key: string, assertionIds: ReadonlySet<string>] {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "registryId",
      "itemId",
      "contractId",
      "contractVersion",
      "payloadDigest",
      "assertionIds",
    ]) ||
    !isCatalogId(value.registryId) ||
    !isCatalogId(value.itemId) ||
    !isCatalogId(value.contractId) ||
    typeof value.contractVersion !== "string" ||
    !semverPattern.test(value.contractVersion) ||
    typeof value.payloadDigest !== "string" ||
    !sha256Pattern.test(value.payloadDigest) ||
    !Array.isArray(value.assertionIds) ||
    value.assertionIds.length === 0 ||
    value.assertionIds.length > MAX_ASSERTIONS_PER_CONTRACT ||
    value.assertionIds.some((id) => !isCatalogId(id)) ||
    new Set(value.assertionIds).size !== value.assertionIds.length
  ) {
    throw new TypeError("Official browser host Contract binding is invalid.");
  }
  const assertionIds = new Set([...(value.assertionIds as string[])].sort(compareText));
  return [
    bindingKey({
      registryId: value.registryId,
      itemId: value.itemId,
      contractId: value.contractId,
      contractVersion: value.contractVersion,
      payloadDigest: value.payloadDigest,
    }),
    assertionIds,
  ];
}

function normalizeHarnesses(value: unknown): readonly NormalizedHarness[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_HARNESSES) {
    throw new TypeError("Official browser host harness registrations are invalid.");
  }
  let contractCount = 0;
  const result = value.map((entry) => {
    if (
      !isPlainRecord(entry) ||
      !hasExactKeys(entry, ["harnessId", "modes", "contracts"]) ||
      !isCatalogId(entry.harnessId) ||
      !Array.isArray(entry.modes) ||
      entry.modes.length === 0 ||
      entry.modes.length > runtimeModes.length ||
      entry.modes.some((mode) => !runtimeModes.includes(mode as RuntimeAuditMode)) ||
      new Set(entry.modes).size !== entry.modes.length ||
      !Array.isArray(entry.contracts) ||
      entry.contracts.length === 0
    ) {
      throw new TypeError("Official browser host harness registration is invalid.");
    }
    contractCount += entry.contracts.length;
    if (contractCount > MAX_CONTRACTS) {
      throw new TypeError(
        "Official browser host Contract route count exceeds the supported limit.",
      );
    }
    const contracts = new Map(entry.contracts.map((binding) => normalizedBinding(binding)));
    if (contracts.size !== entry.contracts.length) {
      throw new TypeError("Official browser host repeats a Contract route.");
    }
    return {
      harnessId: entry.harnessId,
      modes: [...(entry.modes as RuntimeAuditMode[])].sort(compareText),
      contracts,
    };
  });
  result.sort((left, right) => compareText(left.harnessId, right.harnessId));
  if (new Set(result.map(({ harnessId }) => harnessId)).size !== result.length) {
    throw new TypeError("Official browser host repeats a harness id.");
  }
  return result;
}

function outputLimit(value: number | undefined): number {
  const result = value ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isSafeInteger(result) || result < 256 || result > MAX_HOST_OUTPUT_BYTES) {
    throw new TypeError("Official browser host output limit must be 256 through 1048576 bytes.");
  }
  return result;
}

function immutableRequest(input: RuntimeHarnessInvocationV1): OfficialBrowserHostRequestV1 {
  return Object.freeze({
    protocolVersion: OFFICIAL_BROWSER_HOST_PROTOCOL_VERSION,
    harnessId: input.harnessId,
    contract: Object.freeze({ ...input.contract }),
    assertion: Object.freeze({
      assertionId: input.assertion.assertionId,
      mode: input.assertion.mode,
      evidenceType: input.assertion.evidenceType,
    }),
  });
}

function assertBoundedOutput(value: unknown, maximumBytes: number): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError("Official browser host output is not serializable.");
  }
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > maximumBytes) {
    throw new TypeError("Official browser host output exceeds the configured limit.");
  }
}

function assertAllowedInvocation(
  harness: NormalizedHarness,
  input: RuntimeHarnessInvocationV1,
): void {
  const assertionIds = harness.contracts.get(bindingKey(input.contract));
  if (assertionIds === undefined || !assertionIds.has(input.assertion.assertionId)) {
    throw new TypeError("Official browser host has no compiled route for this Contract assertion.");
  }
}

/**
 * Converts an opt-in official host into ordinary trusted runtime adapters.
 * Every dispatch is bound to a compiled immutable Contract/assertion allowlist.
 */
export function createOfficialBrowserHostAdaptersV1(
  host: OfficialBrowserHostV1,
  options: OfficialBrowserHostAdapterOptionsV1 = {},
): readonly TrustedRuntimeHarnessAdapterV1[] {
  if (
    !isPlainRecord(host) ||
    !hasExactKeys(host, ["hostId", "protocolVersion", "harnesses", "execute"]) ||
    host.hostId !== OFFICIAL_BROWSER_HOST_ID ||
    host.protocolVersion !== OFFICIAL_BROWSER_HOST_PROTOCOL_VERSION ||
    typeof host.execute !== "function"
  ) {
    throw new TypeError("Official browser host registration is invalid.");
  }
  const harnesses = normalizeHarnesses(host.harnesses);
  const maximumBytes = outputLimit(options.maxOutputBytes);
  const execute = host.execute.bind(host);
  return Object.freeze(
    harnesses.map((harness) =>
      Object.freeze({
        harnessId: harness.harnessId,
        modes: Object.freeze([...harness.modes]),
        async run(
          input: RuntimeHarnessInvocationV1,
          execution: RuntimeHarnessExecutionV1,
        ): Promise<unknown> {
          assertAllowedInvocation(harness, input);
          if (!(execution?.signal instanceof AbortSignal) || execution.signal.aborted) {
            throw new TypeError("Official browser host execution was cancelled.");
          }
          try {
            const result = await execute(
              immutableRequest(input),
              Object.freeze({ signal: execution.signal }),
            );
            assertBoundedOutput(result, maximumBytes);
            return result;
          } catch {
            // Host exceptions may contain source, paths, environment data, or credentials.
            throw new TypeError("Official browser host failed without trusted evidence.");
          }
        },
      }),
    ),
  );
}
