import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalAuditJson,
  defineContractV1,
  runContractAuditV1,
  validateAuditReportV1,
  validateContractDefinitionV1,
  type ContractDefinitionV1,
} from "../../packages/contracts/src/index.js";
import { createMemoryStaticAuditAdapter } from "../../tooling/contract-runner/src/index.js";

const payloadDigest = `sha256:${"a".repeat(64)}`;

function contract(): ContractDefinitionV1 {
  return defineContractV1({
    schemaVersion: 1,
    contractVersion: "1.0.0",
    contractId: "button-contract",
    registryId: "official",
    itemId: "button",
    payloadDigest,
    conformanceClaim: "automated-evidence-only",
    limitations: ["A consumer-provided label is not statically knowable."],
    assertions: [
      {
        id: "has-native-button",
        mode: "static",
        evidenceType: "static-source",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "The root preserves native button semantics.",
        severity: "S1",
        remediationUrl: "https://example.com/remediation/button-semantics",
        adapter: { kind: "text-includes", version: "1.0.0", value: "<button" },
      },
      {
        id: "keyboard-activation",
        mode: "keyboard",
        evidenceType: "keyboard-behavior",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "Enter and Space activate the control once.",
        severity: "S1",
        remediationUrl: "https://example.com/remediation/button-keyboard",
        adapter: { kind: "harness", version: "1.0.0", harnessId: "button-keyboard" },
      },
      {
        id: "no-dangerous-html",
        mode: "static",
        evidenceType: "static-source",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "The component does not inject raw HTML.",
        severity: "S0",
        remediationUrl: "https://example.com/remediation/raw-html",
        adapter: {
          kind: "text-excludes",
          version: "1.0.0",
          value: "dangerouslySetInnerHTML",
        },
      },
    ],
  });
}

describe("public executable Contract v1", () => {
  it("ships stable public schema subpaths for definitions and reports", () => {
    const packageRoot = resolve(import.meta.dirname, "../../packages/contracts");
    const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
      readonly exports: Record<string, unknown>;
      readonly publishConfig: { readonly exports: Record<string, unknown> };
    };
    const definitionSchema = JSON.parse(
      readFileSync(resolve(packageRoot, "schemas/executable-contract-v1.schema.json"), "utf8"),
    ) as { readonly $id: string; readonly $schema: string };
    const reportSchema = JSON.parse(
      readFileSync(resolve(packageRoot, "schemas/audit-report-v1.schema.json"), "utf8"),
    ) as { readonly $id: string; readonly $schema: string };

    for (const subpath of [
      "./schemas/executable-contract-v1.json",
      "./schemas/audit-report-v1.json",
    ]) {
      expect(packageJson.exports).toHaveProperty(subpath);
      expect(packageJson.publishConfig.exports).toHaveProperty(subpath);
    }
    expect(definitionSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(definitionSchema.$id).toMatch(/executable-contract-v1\.schema\.json$/u);
    expect(reportSchema.$id).toMatch(/audit-report-v1\.schema\.json$/u);
  });

  it("rejects misleading claim boundaries and nondeterministic assertion order", () => {
    const candidate = {
      ...contract(),
      conformanceClaim: "wcag-certified",
      unsupportedFutureField: true,
      assertions: [...contract().assertions].reverse(),
    };
    const validation = validateContractDefinitionV1(candidate);
    expect(validation.valid).toBe(false);
    expect(validation.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "schema.unknown-field",
        "contract.claim-boundary",
        "contract.assertion-order",
      ]),
    );
  });

  it("emits deterministic source-safe static results and stable exit 10 failures", async () => {
    const adapter = createMemoryStaticAuditAdapter([
      {
        registryId: "official",
        itemId: "button",
        logicalPath: "ui/button.tsx",
        projectPath: "src/components/button.tsx",
        content:
          "const privateValue = 'SECRET_SHOULD_NOT_LEAK';\nexport const Button = () => <div />;\n",
      },
    ]);
    const first = await runContractAuditV1([contract()], adapter, {
      requestedModes: ["static"],
    });
    const second = await runContractAuditV1([contract()], adapter, {
      requestedModes: ["static"],
    });

    expect(canonicalAuditJson(first)).toBe(canonicalAuditJson(second));
    expect(first.state).toBe("fail");
    expect(first.recommendedExitCode).toBe(10);
    expect(first.summary).toEqual({ pass: 1, fail: 1, notApplicable: 0, notRun: 0 });
    expect(first.results[0]?.failure).toEqual({
      classification: "assertion-failed",
      code: "AUDIT_REQUIRED_TEXT_MISSING",
    });
    expect(canonicalAuditJson(first)).not.toContain("SECRET_SHOULD_NOT_LEAK");
    expect(validateAuditReportV1(first)).toMatchObject({ valid: true, issues: [] });
  });

  it("labels unavailable runtime capabilities as incomplete rather than skipped or passed", async () => {
    const report = await runContractAuditV1(
      [contract()],
      createMemoryStaticAuditAdapter([
        {
          registryId: "official",
          itemId: "button",
          logicalPath: "ui/button.tsx",
          projectPath: "src/components/button.tsx",
          content: "export const Button = () => <button />;",
        },
      ]),
      { requestedModes: ["keyboard", "static"] },
    );

    expect(report.state).toBe("incomplete");
    expect(report.recommendedExitCode).toBe(7);
    expect(report.results.find(({ mode }) => mode === "keyboard")).toMatchObject({
      state: "not-run",
      failure: {
        classification: "capability-unavailable",
        code: "AUDIT_KEYBOARD_HARNESS_REQUIRED",
      },
    });
    expect(report.limitations.join(" ")).toContain("not a claim of complete WCAG conformance");
  });

  it("fails closed when a target adapter throws", async () => {
    const report = await runContractAuditV1(
      [contract()],
      {
        id: "throwing-adapter",
        readTarget: () => {
          throw new Error("private adapter detail");
        },
      },
      { requestedModes: ["static"] },
    );
    expect(report.state).toBe("incomplete");
    expect(report.recommendedExitCode).toBe(1);
    expect(canonicalAuditJson(report)).not.toContain("private adapter detail");
    expect(report.results.every(({ state }) => state === "not-run")).toBe(true);
  });
});
