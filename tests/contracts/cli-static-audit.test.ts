import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { auditProject, auditProjectExitCode } from "../../packages/cli/src/audit.js";
import { sha256, type CliError } from "../../packages/cli/src/contracts.js";
import { defineContractV1, type ContractDefinitionV1 } from "../../packages/contracts/src/index.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createProject(): {
  readonly root: string;
  readonly definitions: readonly ContractDefinitionV1[];
  readonly buttonPath: string;
} {
  const root = mkdtempSync(resolve(tmpdir(), "mergora-contract-audit-"));
  temporaryRoots.push(root);
  mkdirSync(resolve(root, ".mergora"), { recursive: true });
  mkdirSync(resolve(root, "src/components"), { recursive: true });
  writeFileSync(resolve(root, "package.json"), '{"name":"contract-fixture","private":true}\n');
  const buttonSource = 'export const Button = () => <button type="button" />;\n';
  const dialogSource = 'export const Dialog = () => <div role="dialog" />;\n';
  const buttonPath = resolve(root, "src/components/button.tsx");
  writeFileSync(buttonPath, buttonSource);
  writeFileSync(resolve(root, "src/components/dialog.tsx"), dialogSource);
  const buttonPayload = sha256("button-payload");
  const dialogPayload = sha256("dialog-payload");
  writeFileSync(
    resolve(root, ".mergora/manifest.json"),
    `${JSON.stringify(
      {
        $schema: "https://example.com/manifest-v1.schema.json",
        schemaVersion: 1,
        items: {
          "official:button": {
            registry: "official",
            itemId: "button",
            contractVersion: "1.0.0",
            payload: { digest: buttonPayload },
            files: [
              {
                logicalPath: "ui/button.tsx",
                target: "src/components/button.tsx",
                installed: sha256(buttonSource),
              },
            ],
            registryDependencies: [],
          },
          "official:dialog": {
            registry: "official",
            itemId: "dialog",
            contractVersion: "1.0.0",
            payload: { digest: dialogPayload },
            files: [
              {
                logicalPath: "ui/dialog.tsx",
                target: "src/components/dialog.tsx",
                installed: sha256(dialogSource),
              },
            ],
            registryDependencies: ["official:button"],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  const definitions = [
    defineContractV1({
      schemaVersion: 1,
      contractVersion: "1.0.0",
      contractId: "button-contract",
      registryId: "official",
      itemId: "button",
      payloadDigest: buttonPayload,
      conformanceClaim: "automated-evidence-only",
      limitations: [],
      assertions: [
        {
          id: "native-button",
          mode: "static",
          evidenceType: "static-source",
          target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
          expectedBehavior: "Button uses the native element.",
          severity: "S1",
          remediationUrl: "https://example.com/button",
          adapter: { kind: "text-includes", version: "1.0.0", value: "<button" },
        },
      ],
    }),
    defineContractV1({
      schemaVersion: 1,
      contractVersion: "1.0.0",
      contractId: "dialog-contract",
      registryId: "official",
      itemId: "dialog",
      payloadDigest: dialogPayload,
      conformanceClaim: "automated-evidence-only",
      limitations: [],
      assertions: [
        {
          id: "dialog-role",
          mode: "static",
          evidenceType: "static-source",
          target: { kind: "owned-file", logicalPath: "ui/dialog.tsx" },
          expectedBehavior: "Dialog source exposes dialog semantics.",
          severity: "S1",
          remediationUrl: "https://example.com/dialog",
          adapter: { kind: "text-includes", version: "1.0.0", value: 'role="dialog"' },
        },
      ],
    }),
  ] as const;
  return { root, definitions, buttonPath };
}

describe("CLI static Contract Audit", () => {
  it("audits selected installed items without exposing an absolute project path", async () => {
    const fixture = createProject();
    const report = await auditProject(fixture.root, {
      items: ["official:button"],
      definitions: fixture.definitions,
      requestedModes: ["static"],
    });
    expect(report.state).toBe("pass");
    expect(auditProjectExitCode(report)).toBe(0);
    expect(report.scope.itemIds).toEqual(["official:button"]);
    expect(JSON.stringify(report)).not.toContain(fixture.root);
    expect(report.results[0]?.target.projectPath).toBe("src/components/button.tsx");
  });

  it("uses changed-item dependent closure and returns assertion exit code 10", async () => {
    const fixture = createProject();
    writeFileSync(fixture.buttonPath, "export const Button = () => <div />;\n");
    const report = await auditProject(fixture.root, {
      changed: true,
      definitions: fixture.definitions,
      requestedModes: ["static"],
    });
    expect(report.scope.itemIds).toEqual(["official:button", "official:dialog"]);
    expect(report.state).toBe("fail");
    expect(auditProjectExitCode(report)).toBe(10);
    expect(report.results.find(({ itemId }) => itemId === "button")?.failure?.code).toBe(
      "AUDIT_REQUIRED_TEXT_MISSING",
    );
  });

  it("loads committed snapshots and reports runtime modes as unavailable evidence", async () => {
    const fixture = createProject();
    mkdirSync(resolve(fixture.root, ".mergora/contracts"), { recursive: true });
    for (const definition of fixture.definitions) {
      writeFileSync(
        resolve(
          fixture.root,
          `.mergora/contracts/${definition.registryId}--${definition.itemId}.json`,
        ),
        `${JSON.stringify(definition, null, 2)}\n`,
      );
    }
    const report = await auditProject(fixture.root, {
      items: ["button"],
      requestedModes: ["browser", "static"],
    });
    expect(report.state).toBe("incomplete");
    expect(auditProjectExitCode(report)).toBe(7);
    expect(report.capabilities.find(({ mode }) => mode === "browser")).toMatchObject({
      requested: true,
      available: false,
      adapter: null,
    });
  });

  it("accepts trusted runtime adapters programmatically while the default remains unavailable", async () => {
    const fixture = createProject();
    const button = fixture.definitions.find(({ itemId }) => itemId === "button");
    if (button === undefined) throw new Error("Expected the button definition fixture.");
    const runtimeDefinition = defineContractV1({
      ...button,
      assertions: [
        {
          id: "browser-state",
          mode: "browser",
          evidenceType: "browser-behavior",
          target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
          expectedBehavior: "The browser exposes the enabled button state.",
          severity: "S1",
          remediationUrl: "https://example.com/button-browser",
          adapter: { kind: "harness", version: "1.0.0", harnessId: "button-browser" },
        },
        ...button.assertions,
      ],
    });

    const unavailable = await auditProject(fixture.root, {
      items: ["button"],
      definitions: [runtimeDefinition],
      requestedModes: ["browser"],
    });
    expect(unavailable).toMatchObject({ state: "incomplete", recommendedExitCode: 7 });
    expect(unavailable.results[0]).toMatchObject({ state: "not-run", context: null });

    const executed = await auditProject(fixture.root, {
      items: ["button"],
      definitions: [runtimeDefinition],
      requestedModes: ["browser"],
      trustedRuntimeAdapters: [
        {
          harnessId: "button-browser",
          modes: ["browser"],
          run: () => ({
            state: "pass",
            actualBehavior: "The rendered button remained enabled.",
            projectPath: "src/components/button.tsx",
            failureCode: null,
            context: {
              role: "button",
              name: "Save",
              states: [{ name: "disabled", value: false }],
              keyboard: [],
              focus: [],
              announcements: [],
              axe: [],
              geometry: [],
            },
          }),
        },
      ],
    });
    expect(executed).toMatchObject({ state: "pass", recommendedExitCode: 0 });
    expect(executed.results[0]).toMatchObject({
      state: "pass",
      harnessId: "button-browser",
      context: { role: "button", name: "Save" },
    });
    expect(executed.capabilities.find(({ mode }) => mode === "browser")).toMatchObject({
      available: true,
      registeredHarnessIds: ["button-browser"],
      requiredHarnessIds: ["button-browser"],
      missingHarnessIds: [],
    });
    expect(JSON.stringify(executed)).not.toContain(fixture.root);
  });

  it("rejects stale Contract bindings as registry integrity failures", async () => {
    const fixture = createProject();
    const stale = { ...fixture.definitions[0]!, payloadDigest: `sha256:${"f".repeat(64)}` };
    await expect(
      auditProject(fixture.root, {
        items: ["button"],
        definitions: [stale],
      }),
    ).rejects.toMatchObject({
      code: "AUDIT_CONTRACT_BINDING_MISMATCH",
      exitCode: 5,
    } satisfies Partial<CliError>);
  });
});
