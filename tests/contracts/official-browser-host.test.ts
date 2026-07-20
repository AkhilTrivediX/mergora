import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { auditProject } from "../../packages/cli/src/audit.js";
import { sha256 } from "../../packages/cli/src/contracts.js";
import {
  canonicalAuditJson,
  createOfficialBrowserHostAdaptersV1,
  defineContractV1,
  OFFICIAL_BROWSER_HOST_ID,
  OFFICIAL_BROWSER_HOST_PROTOCOL_VERSION,
  runContractAuditV1,
  type AuditRuntimeContextV1,
  type ContractDefinitionV1,
  type OfficialBrowserHostExecutionV1,
  type OfficialBrowserHostRequestV1,
  type OfficialBrowserHostV1,
  type RuntimeHarnessOutcomeV1,
} from "../../packages/contracts/src/index.js";
import { createMemoryStaticAuditAdapter } from "../../tooling/contract-runner/src/index.js";

const payloadDigest = `sha256:${"a".repeat(64)}`;
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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

function contract(harnessId = "official-button-runtime"): ContractDefinitionV1 {
  return defineContractV1({
    schemaVersion: 1,
    contractVersion: "1.0.0",
    contractId: "button-contract",
    registryId: "official",
    itemId: "button",
    payloadDigest,
    conformanceClaim: "automated-evidence-only",
    limitations: ["Automated browser evidence does not establish complete conformance."],
    assertions: [
      {
        id: "a11y-name",
        mode: "a11y",
        evidenceType: "accessibility-tree",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "The button exposes its role and accessible name.",
        severity: "S1",
        remediationUrl: "https://example.com/remediation/a11y-name",
        adapter: { kind: "harness", version: "1.0.0", harnessId },
      },
      {
        id: "browser-state",
        mode: "browser",
        evidenceType: "browser-behavior",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "Pressed state changes exactly once.",
        severity: "S2",
        remediationUrl: "https://example.com/remediation/browser-state",
        adapter: { kind: "harness", version: "1.0.0", harnessId },
      },
      {
        id: "keyboard-activation",
        mode: "keyboard",
        evidenceType: "keyboard-behavior",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "Enter activates once and focus remains visible.",
        severity: "S1",
        remediationUrl: "https://example.com/remediation/keyboard-activation",
        adapter: { kind: "harness", version: "1.0.0", harnessId },
      },
      {
        id: "responsive-reflow",
        mode: "responsive",
        evidenceType: "responsive-geometry",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "The control does not overflow at 320 CSS pixels.",
        severity: "S1",
        remediationUrl: "https://example.com/remediation/responsive-reflow",
        adapter: { kind: "harness", version: "1.0.0", harnessId },
      },
    ],
  });
}

function successfulOutcome(request: OfficialBrowserHostRequestV1): RuntimeHarnessOutcomeV1 {
  const base = {
    state: "pass" as const,
    projectPath: "src/components/button.tsx",
    failureCode: null,
  };
  if (request.assertion.mode === "a11y") {
    return {
      ...base,
      actualBehavior: "Role button, accessible name Save, and zero axe violations were observed.",
      context: {
        ...emptyContext(),
        role: "button",
        name: "Save",
        states: [{ name: "disabled", value: false }],
        announcements: [{ text: "Saved", politeness: "polite" }],
        axe: [{ ruleId: "button-name", impact: null, nodeCount: 0 }],
      },
    };
  }
  if (request.assertion.mode === "browser") {
    return {
      ...base,
      actualBehavior: "The pressed state changed exactly once.",
      context: {
        ...emptyContext(),
        role: "button",
        states: [{ name: "pressed", value: true }],
      },
    };
  }
  if (request.assertion.mode === "keyboard") {
    return {
      ...base,
      actualBehavior: "Enter activated once and focus remained visible and unobscured.",
      context: {
        ...emptyContext(),
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
    ...base,
    actualBehavior: "No horizontal overflow was measured at 320 CSS pixels.",
    context: {
      ...emptyContext(),
      geometry: [
        { metric: "horizontal-overflow", value: 0, unit: "px" },
        { metric: "viewport-width", value: 320, unit: "px" },
      ],
    },
  };
}

function officialHost(
  execute: OfficialBrowserHostV1["execute"] = successfulOutcome,
  assertionIds = ["a11y-name", "browser-state", "keyboard-activation", "responsive-reflow"],
): OfficialBrowserHostV1 {
  return {
    hostId: OFFICIAL_BROWSER_HOST_ID,
    protocolVersion: OFFICIAL_BROWSER_HOST_PROTOCOL_VERSION,
    harnesses: [
      {
        harnessId: "official-button-runtime",
        modes: ["a11y", "browser", "keyboard", "responsive"],
        contracts: [
          {
            registryId: "official",
            itemId: "button",
            contractId: "button-contract",
            contractVersion: "1.0.0",
            payloadDigest,
            assertionIds,
          },
        ],
      },
    ],
    execute,
  };
}

async function runWithHost(
  host: OfficialBrowserHostV1,
  options: { readonly maxOutputBytes?: number; readonly runtimeTimeoutMs?: number } = {},
) {
  return runContractAuditV1([contract()], createMemoryStaticAuditAdapter([]), {
    requestedModes: ["a11y", "browser", "keyboard", "responsive"],
    trustedRuntimeAdapters: createOfficialBrowserHostAdaptersV1(host, {
      ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
    }),
    ...(options.runtimeTimeoutMs === undefined
      ? {}
      : { runtimeTimeoutMs: options.runtimeTimeoutMs }),
  });
}

function projectSnapshot(root: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    )) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else result[relative(root, path).replaceAll("\\", "/")] = sha256(readFileSync(path));
    }
  };
  visit(root);
  return result;
}

function createAuditProject(): string {
  const root = mkdtempSync(resolve(tmpdir(), "mergora-official-browser-host-"));
  temporaryRoots.push(root);
  mkdirSync(resolve(root, ".mergora"), { recursive: true });
  mkdirSync(resolve(root, "src/components"), { recursive: true });
  const source = 'export const Button = () => <button type="button">Save</button>;\n';
  writeFileSync(resolve(root, "package.json"), '{"name":"browser-host-fixture","private":true}\n');
  writeFileSync(resolve(root, "src/components/button.tsx"), source);
  writeFileSync(
    resolve(root, ".mergora/manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        items: {
          "official:button": {
            registry: "official",
            itemId: "button",
            contractVersion: "1.0.0",
            payload: { digest: payloadDigest },
            files: [
              {
                logicalPath: "ui/button.tsx",
                target: "src/components/button.tsx",
                installed: sha256(source),
              },
            ],
            registryDependencies: [],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

describe("official browser Contract Audit host", () => {
  it("executes only immutable compiled routes and returns actionable official evidence", async () => {
    const requests: OfficialBrowserHostRequestV1[] = [];
    const report = await runWithHost(
      officialHost((request) => {
        requests.push(request);
        expect(Object.isFrozen(request)).toBe(true);
        expect(Object.isFrozen(request.contract)).toBe(true);
        expect(Object.isFrozen(request.assertion)).toBe(true);
        return successfulOutcome(request);
      }),
    );

    expect(report).toMatchObject({
      state: "pass",
      recommendedExitCode: 0,
      summary: { pass: 4, fail: 0, notApplicable: 0, notRun: 0 },
    });
    expect(report.results.find(({ mode }) => mode === "a11y")).toMatchObject({
      target: { projectPath: "src/components/button.tsx" },
      context: {
        role: "button",
        name: "Save",
        states: [{ name: "disabled", value: false }],
        announcements: [{ text: "Saved", politeness: "polite" }],
        axe: [{ ruleId: "button-name", impact: null, nodeCount: 0 }],
      },
    });
    expect(report.results.find(({ mode }) => mode === "keyboard")?.context).toMatchObject({
      keyboard: [{ key: "Enter", action: "press", outcome: "Activated once." }],
      focus: [{ target: "Save button", visible: true, occluded: false }],
    });
    expect(requests).toHaveLength(4);
    const dispatchJson = canonicalAuditJson(requests);
    expect(dispatchJson).not.toContain("expectedBehavior");
    expect(dispatchJson).not.toContain("remediationUrl");
    expect(dispatchJson).not.toContain("https://");
    expect(dispatchJson).not.toContain("command");
  });

  it("preserves fail and not-applicable as distinct audited outcomes", async () => {
    const failed = await runWithHost(
      officialHost((request) => ({
        ...successfulOutcome(request),
        state: "fail",
        actualBehavior: "Focus moved to the document body after activation.",
        failureCode: "AUDIT_FOCUS_TARGET_MISMATCH",
      })),
    );
    expect(failed).toMatchObject({ state: "fail", recommendedExitCode: 10 });
    expect(failed.results[0]?.failure).toMatchObject({
      classification: "assertion-failed",
    });

    const notApplicable = await runContractAuditV1(
      [contract()],
      createMemoryStaticAuditAdapter([]),
      {
        requestedModes: ["keyboard"],
        trustedRuntimeAdapters: createOfficialBrowserHostAdaptersV1(
          officialHost(() => ({
            state: "not-applicable",
            actualBehavior: "This compiled route is not applicable to the selected native mode.",
            projectPath: "src/components/button.tsx",
            failureCode: null,
            context: emptyContext(),
          })),
        ),
      },
    );
    expect(notApplicable).toMatchObject({
      state: "not-applicable",
      recommendedExitCode: 0,
      summary: { pass: 0, fail: 0, notApplicable: 1, notRun: 0 },
    });
  });

  it("keeps unknown or non-compiled harness routes incomplete and never executes them", async () => {
    let executions = 0;
    const host = officialHost((request) => {
      executions += 1;
      return successfulOutcome(request);
    });
    const unknown = await runContractAuditV1(
      [contract("unknown-browser-runtime")],
      createMemoryStaticAuditAdapter([]),
      {
        requestedModes: ["browser"],
        trustedRuntimeAdapters: createOfficialBrowserHostAdaptersV1(host),
      },
    );
    expect(unknown).toMatchObject({ state: "incomplete", recommendedExitCode: 7 });
    expect(unknown.results[0]).toMatchObject({
      state: "not-run",
      failure: { classification: "capability-unavailable" },
    });

    const uncompiled = await runContractAuditV1([contract()], createMemoryStaticAuditAdapter([]), {
      requestedModes: ["browser"],
      trustedRuntimeAdapters: createOfficialBrowserHostAdaptersV1(
        officialHost(host.execute, ["different-assertion"]),
      ),
    });
    expect(uncompiled).toMatchObject({ state: "incomplete", recommendedExitCode: 1 });
    expect(uncompiled.results[0]).toMatchObject({
      state: "not-run",
      failure: { classification: "adapter-error", code: "AUDIT_HARNESS_FAILED" },
    });
    expect(executions).toBe(0);
  });

  it("rejects malformed and duplicate host registrations before dispatch", () => {
    const valid = officialHost();
    const malformed = {
      ...valid,
      harnesses: [{ ...valid.harnesses[0], command: "playwright test" }],
    } as unknown as OfficialBrowserHostV1;
    expect(() => createOfficialBrowserHostAdaptersV1(malformed)).toThrow(
      /harness registration is invalid/u,
    );
    const duplicate = {
      ...valid,
      harnesses: [valid.harnesses[0], valid.harnesses[0]],
    } as OfficialBrowserHostV1;
    expect(() => createOfficialBrowserHostAdaptersV1(duplicate)).toThrow(/repeats a harness id/u);
    expect(() =>
      createOfficialBrowserHostAdaptersV1({
        ...valid,
        protocolVersion: "registry-selected-version",
      } as unknown as OfficialBrowserHostV1),
    ).toThrow(/registration is invalid/u);
  });

  it("bounds, cancels, and redacts failed official host execution", async () => {
    const secret = "PRIVATE_TOKEN_SHOULD_NOT_LEAK";
    const thrown = await runWithHost(
      officialHost(() => {
        throw new Error(secret);
      }),
    );
    expect(thrown).toMatchObject({ state: "incomplete", recommendedExitCode: 1 });
    expect(canonicalAuditJson(thrown)).not.toContain(secret);

    let aborted = false;
    const timedOut = await runWithHost(
      officialHost(
        (_request: OfficialBrowserHostRequestV1, execution: OfficialBrowserHostExecutionV1) =>
          new Promise<never>((_resolve, reject) => {
            execution.signal.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(new Error(secret));
              },
              { once: true },
            );
          }),
      ),
      { runtimeTimeoutMs: 10 },
    );
    expect(timedOut).toMatchObject({ state: "incomplete", recommendedExitCode: 1 });
    expect(timedOut.results[0]?.failure?.code).toBe("AUDIT_HARNESS_TIMEOUT");
    expect(aborted).toBe(true);
    expect(canonicalAuditJson(timedOut)).not.toContain(secret);

    const oversized = await runWithHost(
      officialHost((request) => ({
        ...successfulOutcome(request),
        actualBehavior: "x".repeat(600),
      })),
      { maxOutputBytes: 512 },
    );
    expect(oversized).toMatchObject({ state: "incomplete", recommendedExitCode: 1 });
    expect(oversized.results[0]?.failure?.code).toBe("AUDIT_HARNESS_FAILED");
  });

  it("opts into the CLI audit boundary without exposing or mutating consumer files", async () => {
    const root = createAuditProject();
    const before = projectSnapshot(root);
    const requests: OfficialBrowserHostRequestV1[] = [];
    const report = await auditProject(root, {
      definitions: [contract()],
      requestedModes: ["a11y"],
      officialBrowserHost: officialHost((request) => {
        requests.push(request);
        return successfulOutcome(request);
      }),
    });

    expect(report).toMatchObject({ state: "pass", recommendedExitCode: 0 });
    expect(projectSnapshot(root)).toEqual(before);
    expect(canonicalAuditJson(report)).not.toContain(root);
    expect(canonicalAuditJson(requests)).not.toContain(root);
  });
});
