import { describe, expect, it } from "vitest";

import {
  canonicalAuditJson,
  defineContractV1,
  runContractAuditV1,
  validateAuditReportV1,
  validateContractDefinitionV1,
  type AuditRuntimeContextV1,
  type ContractDefinitionV1,
  type RuntimeAuditMode,
  type RuntimeHarnessInvocationV1,
  type RuntimeHarnessOutcomeV1,
  type TrustedRuntimeHarnessAdapterV1,
} from "../../packages/contracts/src/index.js";
import { createMemoryStaticAuditAdapter } from "../../tooling/contract-runner/src/index.js";

const payloadDigest = `sha256:${"a".repeat(64)}`;

function emptyContext(): AuditRuntimeContextV1 {
  return {
    role: null,
    name: null,
    states: [],
    keyboard: [],
    focus: [],
    announcements: [],
    axe: [],
    geometry: [],
  };
}

function fullContract(contractId = "button-contract", itemId = "button"): ContractDefinitionV1 {
  return defineContractV1({
    schemaVersion: 1,
    contractVersion: "1.0.0",
    contractId,
    registryId: "official",
    itemId,
    payloadDigest,
    conformanceClaim: "automated-evidence-only",
    limitations: ["A trusted host harness supplies automated evidence only."],
    assertions: [
      {
        id: "a11y-name",
        mode: "a11y",
        evidenceType: "accessibility-tree",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "The control exposes its button role and accessible name.",
        severity: "S1",
        remediationUrl: "https://example.com/a11y-name",
        adapter: { kind: "harness", version: "1.0.0", harnessId: "shared-harness" },
      },
      {
        id: "browser-state",
        mode: "browser",
        evidenceType: "browser-behavior",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "The browser exposes deterministic state changes.",
        severity: "S2",
        remediationUrl: "https://example.com/browser-state",
        adapter: { kind: "harness", version: "1.0.0", harnessId: "shared-harness" },
      },
      {
        id: "keyboard-activation",
        mode: "keyboard",
        evidenceType: "keyboard-behavior",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "Enter and Space activate once while focus remains visible.",
        severity: "S1",
        remediationUrl: "https://example.com/keyboard-activation",
        adapter: { kind: "harness", version: "1.0.0", harnessId: "keyboard-harness" },
      },
      {
        id: "responsive-reflow",
        mode: "responsive",
        evidenceType: "responsive-geometry",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "The rendered control does not overflow at the audited viewport.",
        severity: "S1",
        remediationUrl: "https://example.com/responsive-reflow",
        adapter: { kind: "harness", version: "1.0.0", harnessId: "shared-harness" },
      },
    ],
  });
}

function keyboardContract(harnessId = "keyboard-harness"): ContractDefinitionV1 {
  const complete = fullContract();
  const assertion = complete.assertions.find(({ mode }) => mode === "keyboard");
  if (assertion?.mode !== "keyboard") throw new Error("Expected a keyboard assertion fixture.");
  return defineContractV1({
    ...complete,
    assertions: [{ ...assertion, adapter: { ...assertion.adapter, harnessId } }],
  });
}

function validOutcome(input: RuntimeHarnessInvocationV1): RuntimeHarnessOutcomeV1 {
  const context = emptyContext();
  if (input.assertion.mode === "a11y") {
    return {
      state: "pass",
      actualBehavior: "The accessibility tree exposed role button and name Save.",
      projectPath: "src/components/button.tsx",
      failureCode: null,
      context: {
        ...context,
        role: "button",
        name: "Save",
        axe: [{ ruleId: "button-name", impact: null, nodeCount: 0 }],
      },
    };
  }
  if (input.assertion.mode === "browser") {
    return {
      state: "pass",
      actualBehavior: "The pressed state changed once after activation.",
      projectPath: "src/components/button.tsx",
      failureCode: null,
      context: {
        ...context,
        role: "button",
        states: [
          { name: "pressed", value: true },
          { name: "disabled", value: false },
        ],
      },
    };
  }
  if (input.assertion.mode === "keyboard") {
    return {
      state: "pass",
      actualBehavior: "Enter activated once and focus remained visible.",
      projectPath: "src/components/button.tsx",
      failureCode: null,
      context: {
        ...context,
        keyboard: [{ key: "Enter", action: "press", outcome: "Activated once." }],
        focus: [
          {
            step: "after-activation",
            target: "Save button",
            visible: true,
            occluded: false,
          },
        ],
      },
    };
  }
  return {
    state: "pass",
    actualBehavior: "No horizontal overflow was measured at 320 CSS pixels.",
    projectPath: "src/components/button.tsx",
    failureCode: null,
    context: {
      ...context,
      geometry: [
        { metric: "viewport-width", value: 320, unit: "px" },
        { metric: "horizontal-overflow", value: 0, unit: "px" },
      ],
    },
  };
}

function adapter(
  harnessId: string,
  modes: readonly RuntimeAuditMode[],
  run: TrustedRuntimeHarnessAdapterV1["run"] = validOutcome,
): TrustedRuntimeHarnessAdapterV1 {
  return { harnessId, modes, run };
}

describe("trusted runtime Contract Audit adapters", () => {
  it("executes all runtime modes with exact capability and actionable evidence reporting", async () => {
    const report = await runContractAuditV1([fullContract()], createMemoryStaticAuditAdapter([]), {
      requestedModes: ["responsive", "keyboard", "browser", "a11y"],
      trustedRuntimeAdapters: [
        adapter("shared-harness", ["a11y", "browser", "responsive"]),
        adapter("keyboard-harness", ["keyboard"]),
      ],
    });

    expect(report.state).toBe("pass");
    expect(report.recommendedExitCode).toBe(0);
    expect(report.networkUsed).toBe(false);
    expect(report.summary).toEqual({ pass: 4, fail: 0, notApplicable: 0, notRun: 0 });
    expect(report.capabilities.find(({ mode }) => mode === "browser")).toMatchObject({
      requested: true,
      available: true,
      adapter: "shared-harness",
      registeredHarnessIds: ["shared-harness"],
      requiredHarnessIds: ["shared-harness"],
      missingHarnessIds: [],
      limitation: null,
    });
    expect(report.results.find(({ mode }) => mode === "keyboard")).toMatchObject({
      harnessId: "keyboard-harness",
      state: "pass",
      context: {
        keyboard: [{ key: "Enter", action: "press", outcome: "Activated once." }],
        focus: [{ target: "Save button", visible: true, occluded: false }],
      },
    });
    expect(report.results.find(({ mode }) => mode === "browser")?.context?.states).toEqual([
      { name: "disabled", value: false },
      { name: "pressed", value: true },
    ]);
    expect(validateAuditReportV1(report)).toMatchObject({ valid: true, issues: [] });
  });

  it("preserves an actionable validated harness failure as exit guidance 10", async () => {
    const report = await runContractAuditV1(
      [keyboardContract()],
      createMemoryStaticAuditAdapter([]),
      {
        requestedModes: ["keyboard"],
        trustedRuntimeAdapters: [
          adapter("keyboard-harness", ["keyboard"], () => ({
            state: "fail",
            actualBehavior: "Escape moved focus into the page instead of the dialog trigger.",
            projectPath: "src/components/button.tsx",
            failureCode: "AUDIT_KEYBOARD_FOCUS_RESTORE_FAILED",
            context: {
              ...emptyContext(),
              keyboard: [{ key: "Escape", action: "press", outcome: "Closed the surface." }],
              focus: [
                {
                  step: "after-close",
                  target: "Document body",
                  visible: false,
                  occluded: null,
                },
              ],
            },
          })),
        ],
      },
    );
    expect(report).toMatchObject({ state: "fail", recommendedExitCode: 10 });
    expect(report.results[0]).toMatchObject({
      state: "fail",
      failure: {
        classification: "assertion-failed",
        code: "AUDIT_KEYBOARD_FOCUS_RESTORE_FAILED",
      },
      context: { focus: [{ target: "Document body", visible: false }] },
    });
    expect(validateAuditReportV1(report)).toMatchObject({ valid: true, issues: [] });
  });

  it("keeps unknown or mode-incompatible harness ids unavailable and never passing", async () => {
    const report = await runContractAuditV1(
      [keyboardContract("unknown-harness")],
      createMemoryStaticAuditAdapter([]),
      {
        requestedModes: ["keyboard"],
        trustedRuntimeAdapters: [adapter("shared-harness", ["a11y", "browser"])],
      },
    );

    expect(report.state).toBe("incomplete");
    expect(report.recommendedExitCode).toBe(7);
    expect(report.results).toEqual([
      expect.objectContaining({
        harnessId: "unknown-harness",
        state: "not-run",
        context: null,
        failure: {
          classification: "capability-unavailable",
          code: "AUDIT_KEYBOARD_HARNESS_REQUIRED",
        },
      }),
    ]);
    expect(report.capabilities.find(({ mode }) => mode === "keyboard")).toMatchObject({
      available: false,
      registeredHarnessIds: [],
      requiredHarnessIds: ["unknown-harness"],
      missingHarnessIds: ["unknown-harness"],
    });
  });

  it("reports partially configured modes as unavailable even when one assertion passes", async () => {
    const base = keyboardContract();
    const first = base.assertions[0];
    if (first?.mode !== "keyboard") throw new Error("Expected a keyboard assertion fixture.");
    const definition = defineContractV1({
      ...base,
      assertions: [
        first,
        {
          ...first,
          id: "second-keyboard-path",
          adapter: { ...first.adapter, harnessId: "missing-keyboard" },
        },
      ],
    });
    const report = await runContractAuditV1([definition], createMemoryStaticAuditAdapter([]), {
      requestedModes: ["keyboard"],
      trustedRuntimeAdapters: [adapter("keyboard-harness", ["keyboard"])],
    });

    expect(report).toMatchObject({ state: "incomplete", recommendedExitCode: 7 });
    expect(report.summary).toEqual({ pass: 1, fail: 0, notApplicable: 0, notRun: 1 });
    expect(report.capabilities.find(({ mode }) => mode === "keyboard")).toMatchObject({
      available: false,
      adapter: "keyboard-harness",
      registeredHarnessIds: ["keyboard-harness"],
      requiredHarnessIds: ["keyboard-harness", "missing-keyboard"],
      missingHarnessIds: ["missing-keyboard"],
    });
  });

  it("rejects duplicate and malformed host registrations before executing a harness", async () => {
    const run = () => validOutcome({} as RuntimeHarnessInvocationV1);
    const execute = (trustedRuntimeAdapters: readonly TrustedRuntimeHarnessAdapterV1[]) =>
      runContractAuditV1([keyboardContract()], createMemoryStaticAuditAdapter([]), {
        requestedModes: ["keyboard"],
        trustedRuntimeAdapters,
      });

    await expect(
      execute([
        adapter("keyboard-harness", ["keyboard"], run),
        adapter("keyboard-harness", ["keyboard"], run),
      ]),
    ).rejects.toThrow(/Duplicate trusted runtime adapter/u);
    await expect(
      execute([adapter("keyboard-harness", ["responsive", "keyboard"], run)]),
    ).rejects.toThrow(/registration is invalid/u);
    await expect(execute([adapter("keyboard-harness", ["static" as never], run)])).rejects.toThrow(
      /registration is invalid/u,
    );
  });

  it.each([
    [
      "empty pass evidence",
      {
        state: "pass",
        actualBehavior: "Claimed a pass without executed keyboard evidence.",
        projectPath: null,
        failureCode: null,
        context: emptyContext(),
      },
    ],
    [
      "unknown result field",
      {
        ...validOutcome({ assertion: { mode: "keyboard" } } as RuntimeHarnessInvocationV1),
        command: "run-untrusted-code",
      },
    ],
    [
      "unbounded behavior",
      {
        ...validOutcome({ assertion: { mode: "keyboard" } } as RuntimeHarnessInvocationV1),
        actualBehavior: "x".repeat(1_025),
      },
    ],
    [
      "duplicate observations",
      {
        ...validOutcome({ assertion: { mode: "keyboard" } } as RuntimeHarnessInvocationV1),
        context: {
          ...emptyContext(),
          keyboard: [
            { key: "Enter", action: "press", outcome: "First." },
            { key: "Enter", action: "press", outcome: "Second." },
          ],
        },
      },
    ],
  ])(
    "turns a malformed adapter result ($label) into incomplete evidence",
    async (_label, value) => {
      const report = await runContractAuditV1(
        [keyboardContract()],
        createMemoryStaticAuditAdapter([]),
        {
          requestedModes: ["keyboard"],
          trustedRuntimeAdapters: [adapter("keyboard-harness", ["keyboard"], () => value)],
        },
      );
      expect(report.state).toBe("incomplete");
      expect(report.recommendedExitCode).toBe(1);
      expect(report.results[0]).toMatchObject({
        state: "not-run",
        context: null,
        failure: { classification: "adapter-error", code: "AUDIT_HARNESS_RESULT_INVALID" },
      });
      expect(canonicalAuditJson(report)).not.toContain("run-untrusted-code");
    },
  );

  it("redacts adapter exceptions and bounds adapters that never settle", async () => {
    const secret = "PRIVATE_TOKEN_SHOULD_NOT_LEAK";
    const thrown = await runContractAuditV1(
      [keyboardContract()],
      createMemoryStaticAuditAdapter([]),
      {
        requestedModes: ["keyboard"],
        trustedRuntimeAdapters: [
          adapter("keyboard-harness", ["keyboard"], () => {
            throw new Error(secret);
          }),
        ],
      },
    );
    expect(thrown.state).toBe("incomplete");
    expect(thrown.results[0]?.failure?.code).toBe("AUDIT_HARNESS_FAILED");
    expect(canonicalAuditJson(thrown)).not.toContain(secret);

    const timedOut = await runContractAuditV1(
      [keyboardContract()],
      createMemoryStaticAuditAdapter([]),
      {
        requestedModes: ["keyboard"],
        runtimeTimeoutMs: 10,
        trustedRuntimeAdapters: [
          adapter("keyboard-harness", ["keyboard"], () => new Promise<never>(() => undefined)),
        ],
      },
    );
    expect(timedOut.state).toBe("incomplete");
    expect(timedOut.results[0]?.failure?.code).toBe("AUDIT_HARNESS_TIMEOUT");
  });

  it("normalizes adapter and observation ordering into deterministic reports", async () => {
    const definitions = [
      fullContract("zeta-contract", "dialog"),
      fullContract("alpha-contract", "button"),
    ];
    const shared = adapter("shared-harness", ["a11y", "browser", "responsive"]);
    const keyboard = adapter("keyboard-harness", ["keyboard"]);
    const options = {
      requestedModes: ["a11y", "browser", "keyboard", "responsive"] as const,
      trustedRuntimeAdapters: [shared, keyboard],
    };
    const first = await runContractAuditV1(
      definitions,
      createMemoryStaticAuditAdapter([]),
      options,
    );
    const second = await runContractAuditV1(
      [...definitions].reverse(),
      createMemoryStaticAuditAdapter([]),
      { ...options, trustedRuntimeAdapters: [...options.trustedRuntimeAdapters].reverse() },
    );
    expect(canonicalAuditJson(first)).toBe(canonicalAuditJson(second));
  });

  it("rejects forged capability state and noncanonical runtime report context", async () => {
    const report = await runContractAuditV1([fullContract()], createMemoryStaticAuditAdapter([]), {
      requestedModes: ["browser"],
      trustedRuntimeAdapters: [adapter("shared-harness", ["a11y", "browser", "responsive"])],
    });
    const forged = structuredClone(report) as unknown as {
      capabilities: { mode: string; available: boolean; limitation: string | null }[];
      results: { mode: string; context: { states: unknown[] } | null }[];
    };
    const browserCapability = forged.capabilities.find(({ mode }) => mode === "browser")!;
    browserCapability.available = false;
    browserCapability.limitation = null;
    const browserResult = forged.results.find(({ mode }) => mode === "browser")!;
    browserResult.context!.states.reverse();

    const validation = validateAuditReportV1(forged);
    expect(validation.valid).toBe(false);
    expect(validation.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "report.capability-state",
        "report.runtime-context",
        "report.aggregate",
      ]),
    );
  });

  it("rejects registry attempts to smuggle commands or network locations into harness declarations", () => {
    const definition = fullContract();
    const candidate = {
      ...definition,
      assertions: definition.assertions.map((assertion) =>
        assertion.mode === "browser"
          ? {
              ...assertion,
              adapter: {
                ...assertion.adapter,
                command: "playwright test",
                url: "https://untrusted.example.test/fixture",
              },
            }
          : assertion,
      ),
    };
    const validation = validateContractDefinitionV1(candidate);
    expect(validation.valid).toBe(false);
    expect(validation.issues.filter(({ code }) => code === "schema.unknown-field")).toHaveLength(2);
  });
});
