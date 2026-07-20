import { describe, expect, it } from "vitest";

import { defineContractV1 } from "../../packages/contracts/src/index.js";
import {
  createMemoryStaticAuditAdapter,
  runDeclarativeContractAudit,
  type RuntimeHarnessInvocationV1,
  type RuntimeHarnessOutcomeV1,
  type TrustedRuntimeHarnessAdapterV1,
} from "../../tooling/contract-runner/src/index.js";

const payloadDigest = `sha256:${"b".repeat(64)}`;

const definition = defineContractV1({
  schemaVersion: 1,
  contractVersion: "1.0.0",
  contractId: "dialog-contract",
  registryId: "official",
  itemId: "dialog",
  payloadDigest,
  conformanceClaim: "automated-evidence-only",
  limitations: [],
  assertions: [
    {
      id: "escape-key",
      mode: "keyboard",
      evidenceType: "keyboard-behavior",
      target: { kind: "owned-file", logicalPath: "ui/dialog.tsx" },
      expectedBehavior: "Escape closes the dialog and restores trigger focus.",
      severity: "S1",
      remediationUrl: "https://example.com/dialog-keyboard",
      adapter: { kind: "harness", version: "1.0.0", harnessId: "dialog-keyboard" },
    },
  ],
});

describe("declarative runner trusted adapter forwarding", () => {
  it("forwards a minimal immutable invocation and binds output identity to the Contract", async () => {
    let observed: RuntimeHarnessInvocationV1 | undefined;
    const outcome: RuntimeHarnessOutcomeV1 = {
      state: "pass",
      actualBehavior: "Escape closed the dialog and restored focus to Open dialog.",
      projectPath: "src/components/dialog.tsx",
      failureCode: null,
      context: {
        role: "dialog",
        name: "Edit profile",
        states: [{ name: "open", value: false }],
        keyboard: [{ key: "Escape", action: "press", outcome: "Closed once." }],
        focus: [
          {
            step: "after-close",
            target: "Open dialog",
            visible: true,
            occluded: false,
          },
        ],
        announcements: [],
        axe: [],
        geometry: [],
      },
    };
    const trusted: TrustedRuntimeHarnessAdapterV1 = {
      harnessId: "dialog-keyboard",
      modes: ["keyboard"],
      run: (input) => {
        observed = input;
        (input.contract as { contractId: string }).contractId = "mutated-contract";
        (input.assertion as { assertionId: string }).assertionId = "mutated-assertion";
        return outcome;
      },
    };

    const report = await runDeclarativeContractAudit(
      [definition],
      createMemoryStaticAuditAdapter([]),
      { requestedModes: ["keyboard"], trustedRuntimeAdapters: [trusted] },
    );

    expect(observed).toEqual(
      expect.objectContaining({
        harnessId: "dialog-keyboard",
        contract: expect.objectContaining({
          registryId: "official",
          itemId: "dialog",
          payloadDigest,
        }),
        assertion: expect.objectContaining({
          mode: "keyboard",
          expectedBehavior: definition.assertions[0]?.expectedBehavior,
        }),
      }),
    );
    expect(report.results[0]).toMatchObject({
      contractId: "dialog-contract",
      assertionId: "escape-key",
      payloadDigest,
      state: "pass",
    });
  });
});
