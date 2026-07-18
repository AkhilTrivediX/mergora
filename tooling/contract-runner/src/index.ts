export type ContractResultState = "pass" | "fail" | "blocked-upstream" | "not-applicable";
export type ContractAggregateState = "satisfied" | "failed" | "blocked" | "not-applicable";

export interface ContractAssertion {
  readonly id: string;
  readonly passed: boolean;
  readonly message: string;
}

export interface ContractFailure {
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
}

export type ContractExecution =
  | { readonly state: "pass"; readonly assertions: readonly ContractAssertion[] }
  | {
      readonly state: "fail";
      readonly assertions?: readonly ContractAssertion[];
      readonly failures: readonly ContractFailure[];
    }
  | {
      readonly state: "blocked-upstream";
      readonly dependency: string;
      readonly reason: string;
    };

interface ContractCheckBase {
  readonly id: string;
  readonly category:
    | "structure"
    | "semantics"
    | "interaction"
    | "accessibility"
    | "geometry"
    | "visual"
    | "consumer";
}

export interface ApplicableContractCheck<TContext> extends ContractCheckBase {
  readonly applicability: "applicable";
  readonly requiredCapabilities?: readonly string[];
  run(context: TContext): ContractExecution | Promise<ContractExecution>;
}

export interface NotApplicableContractCheck extends ContractCheckBase {
  readonly applicability: "not-applicable";
  readonly rationale: string;
}

export type ContractCheck<TContext> =
  ApplicableContractCheck<TContext> | NotApplicableContractCheck;

export interface ContractSuite<TContext> {
  readonly schemaVersion: 1;
  readonly suiteId: string;
  readonly itemId: string;
  readonly contractVersion: string;
  readonly sourceDigest: string;
  readonly checks: readonly ContractCheck<TContext>[];
}

export interface ContractCheckResult {
  readonly checkId: string;
  readonly category: ContractCheckBase["category"];
  readonly state: ContractResultState;
  readonly aggregateState: ContractAggregateState;
  readonly summary: string;
  readonly assertions: readonly ContractAssertion[];
  readonly failures: readonly ContractFailure[];
}

export interface ContractSuiteResult {
  readonly schemaVersion: 1;
  readonly suiteId: string;
  readonly itemId: string;
  readonly context: "contract";
  readonly contractVersion: string;
  readonly sourceDigest: string;
  readonly state: ContractResultState;
  readonly aggregateState: ContractAggregateState;
  readonly results: readonly ContractCheckResult[];
}

export interface ContractRuntime {
  readonly capabilities: ReadonlySet<string>;
}

export class ContractConfigurationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ContractConfigurationError";
    this.code = code;
  }
}

const catalogIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const semverPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function isCatalogId(value: string): boolean {
  return value.length <= 128 && catalogIdPattern.test(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateSuite<TContext>(suite: ContractSuite<TContext>): void {
  if (suite.schemaVersion !== 1) {
    throw new ContractConfigurationError("suite.schema-version", "schemaVersion must be 1.");
  }
  if (![suite.suiteId, suite.itemId].every(isCatalogId)) {
    throw new ContractConfigurationError(
      "suite.identity",
      "suiteId and itemId must be catalog ids.",
    );
  }
  if (!semverPattern.test(suite.contractVersion)) {
    throw new ContractConfigurationError(
      "suite.contract-version",
      "contractVersion must be an exact semantic version.",
    );
  }
  if (!sha256Pattern.test(suite.sourceDigest)) {
    throw new ContractConfigurationError(
      "suite.source-digest",
      "sourceDigest must be sha256:<64 hex>.",
    );
  }
  if (suite.checks.length === 0) {
    throw new ContractConfigurationError("suite.empty", "A contract suite must declare checks.");
  }

  const checkIds = new Set<string>();
  for (const check of suite.checks) {
    if (!isCatalogId(check.id)) {
      throw new ContractConfigurationError("check.identity", `Check id "${check.id}" is invalid.`);
    }
    if (checkIds.has(check.id)) {
      throw new ContractConfigurationError(
        "check.duplicate",
        `Check id "${check.id}" is duplicated.`,
      );
    }
    checkIds.add(check.id);
    if (check.applicability === "not-applicable" && check.rationale.trim().length === 0) {
      throw new ContractConfigurationError(
        "check.not-applicable-rationale",
        `Check "${check.id}" needs a not-applicable rationale.`,
      );
    }
    if (
      check.applicability === "applicable" &&
      check.requiredCapabilities?.some((capability) => !isCatalogId(capability))
    ) {
      throw new ContractConfigurationError(
        "check.capability",
        `Check "${check.id}" has an invalid capability id.`,
      );
    }
  }

  const sorted = [...suite.checks].sort((left, right) => compareText(left.id, right.id));
  if (sorted.some((check, index) => check !== suite.checks[index])) {
    throw new ContractConfigurationError(
      "check.order",
      "Contract checks must be ordered lexically by id for deterministic output.",
    );
  }
}

function failureResult(
  check: ContractCheck<unknown>,
  failures: readonly ContractFailure[],
  assertions: readonly ContractAssertion[] = [],
): ContractCheckResult {
  return {
    checkId: check.id,
    category: check.category,
    state: "fail",
    aggregateState: "failed",
    summary: `${failures.length} contract failure(s).`,
    assertions,
    failures,
  };
}

function validateAssertions(assertions: readonly ContractAssertion[]): readonly ContractFailure[] {
  const failures: ContractFailure[] = [];
  const ids = new Set<string>();
  for (const assertion of assertions) {
    if (!isCatalogId(assertion.id) || assertion.message.trim().length === 0) {
      failures.push({
        code: "assertion.invalid",
        message: "Assertions require a catalog id and non-empty message.",
        subject: assertion.id,
      });
    }
    if (ids.has(assertion.id)) {
      failures.push({
        code: "assertion.duplicate",
        message: `Assertion "${assertion.id}" is duplicated.`,
        subject: assertion.id,
      });
    }
    ids.add(assertion.id);
    if (!assertion.passed) {
      failures.push({
        code: "assertion.failed",
        message: assertion.message,
        subject: assertion.id,
      });
    }
  }
  return failures;
}

async function runCheck<TContext>(
  check: ContractCheck<TContext>,
  context: TContext,
  runtime: ContractRuntime,
): Promise<ContractCheckResult> {
  if (check.applicability === "not-applicable") {
    return {
      checkId: check.id,
      category: check.category,
      state: "not-applicable",
      aggregateState: "not-applicable",
      summary: check.rationale,
      assertions: [],
      failures: [],
    };
  }

  const missingCapabilities = (check.requiredCapabilities ?? []).filter(
    (capability) => !runtime.capabilities.has(capability),
  );
  if (missingCapabilities.length > 0) {
    return failureResult(check, [
      {
        code: "runtime-capability-unavailable",
        message: `Required runtime capabilities are unavailable: ${missingCapabilities.join(", ")}.`,
      },
    ]);
  }

  let execution: ContractExecution;
  try {
    execution = await check.run(context);
  } catch (error) {
    const message =
      error instanceof Error ? `Check threw ${error.name}.` : "Check threw a non-Error value.";
    return failureResult(check, [{ code: "check.threw", message }]);
  }

  if (execution.state === "blocked-upstream") {
    if (execution.dependency.trim().length === 0 || execution.reason.trim().length === 0) {
      return failureResult(check, [
        {
          code: "blocked.invalid",
          message: "Blocked results require a dependency and reason.",
        },
      ]);
    }
    return {
      checkId: check.id,
      category: check.category,
      state: "blocked-upstream",
      aggregateState: "blocked",
      summary: `${execution.dependency}: ${execution.reason}`,
      assertions: [],
      failures: [],
    };
  }

  if (execution.state === "fail") {
    const assertions = execution.assertions ?? [];
    const assertionFailures = validateAssertions(assertions);
    const failures = [...execution.failures, ...assertionFailures];
    if (failures.length === 0) {
      failures.push({
        code: "failure.empty",
        message: "Failed checks require a concrete failure.",
      });
    }
    return failureResult(check, failures, assertions);
  }

  if (execution.assertions.length === 0) {
    return failureResult(check, [
      {
        code: "pass.empty",
        message: "A passing check must report at least one executed assertion.",
      },
    ]);
  }
  const assertionFailures = validateAssertions(execution.assertions);
  if (assertionFailures.length > 0) {
    return failureResult(check, assertionFailures, execution.assertions);
  }
  return {
    checkId: check.id,
    category: check.category,
    state: "pass",
    aggregateState: "satisfied",
    summary: `${execution.assertions.length} assertion(s) passed.`,
    assertions: execution.assertions,
    failures: [],
  };
}

function suiteState(results: readonly ContractCheckResult[]): {
  readonly state: ContractResultState;
  readonly aggregateState: ContractAggregateState;
} {
  if (results.some((result) => result.state === "fail")) {
    return { state: "fail", aggregateState: "failed" };
  }
  if (results.some((result) => result.state === "blocked-upstream")) {
    return { state: "blocked-upstream", aggregateState: "blocked" };
  }
  if (results.some((result) => result.state === "pass")) {
    return { state: "pass", aggregateState: "satisfied" };
  }
  return { state: "not-applicable", aggregateState: "not-applicable" };
}

export async function runContractSuite<TContext>(
  suite: ContractSuite<TContext>,
  context: TContext,
  runtime: ContractRuntime,
): Promise<ContractSuiteResult> {
  validateSuite(suite);
  const results: ContractCheckResult[] = [];
  for (const check of suite.checks) {
    results.push(await runCheck(check, context, runtime));
  }
  const overall = suiteState(results);
  return {
    schemaVersion: 1,
    suiteId: suite.suiteId,
    itemId: suite.itemId,
    context: "contract",
    contractVersion: suite.contractVersion,
    sourceDigest: suite.sourceDigest,
    state: overall.state,
    aggregateState: overall.aggregateState,
    results,
  };
}
