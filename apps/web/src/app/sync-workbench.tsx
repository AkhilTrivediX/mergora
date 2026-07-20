"use client";

import { useState } from "react";

import packedConsumerEvidence from "../../../../tests/packed-consumers/evidence.json";

interface TrackedLifecycleEvidence {
  readonly interruptedRecovery: {
    readonly injectedAt: string;
    readonly itemId: string;
    readonly recovery: string;
  };
  readonly overlappingUpdate: {
    readonly conflictPacket: string;
    readonly liveProjectDuringConflict: string;
    readonly release: string;
    readonly resolution: string;
    readonly target: string;
  };
  readonly ownershipAndRollback: {
    readonly removal: string;
    readonly rollback: string;
  };
}

const trackedLifecycle = packedConsumerEvidence.consumers.find(
  (consumer) => consumer.id === "next-source",
)?.publicCliLifecycle as TrackedLifecycleEvidence | null | undefined;

function readableEvidence(value: string | undefined): string {
  return value === undefined ? "not recorded" : value.replaceAll("-", " ");
}

const trackedConflict = trackedLifecycle?.overlappingUpdate;
const trackedRecovery = trackedLifecycle?.interruptedRecovery;
const trackedRollback = trackedLifecycle?.ownershipAndRollback;

const states = {
  base: {
    code: ['<Button variant="primary">', "  Save changes", "</Button>"],
    detail: "The immutable installed base recorded in provenance.",
    evidence: "API contract",
    metrics: [
      ["Pending UI", "absent"],
      ["Activation", "native"],
    ],
    result: "Immutable base",
  },
  local: {
    code: [
      '<Button variant="primary"',
      '  data-product="settings">',
      "  Save changes",
      "</Button>",
    ],
    detail: "Your local product hook remains a deliberate customization.",
    evidence: "API contract",
    metrics: [
      ["Local attribute", "preserved"],
      ["Pending UI", "absent"],
    ],
    result: "Local customization",
  },
  upstream: {
    code: [
      '<Button variant="primary"',
      "  pending={saving}",
      '  pendingLabel="Saving changes">',
      "  Save changes",
      "</Button>",
    ],
    detail: "Upstream adds an explicit pending-state accessible name.",
    evidence: "API contract",
    metrics: [
      ["Duplicate activation", "blocked while pending"],
      ["Busy semantics", "synchronized"],
    ],
    result: "Upstream refinement",
  },
  merged: {
    code: [
      '<Button variant="primary"',
      '  data-product="settings"',
      "  pending={saving}",
      '  pendingLabel="Saving changes">',
      "  Save changes",
      "</Button>",
    ],
    detail:
      trackedLifecycle === undefined
        ? "The deterministic merge is prepared, but no packed lifecycle record is available."
        : "The tracked exact-tarball lifecycle merged a disjoint upstream change while preserving the local customization.",
    evidence: trackedLifecycle === undefined ? "Prepared contract" : "Exact-tarball evidence",
    metrics: [
      ["Upstream change", trackedLifecycle === undefined ? "not recorded" : "merged"],
      ["Local customization", trackedLifecycle === undefined ? "not recorded" : "preserved"],
    ],
    result: trackedLifecycle === undefined ? "Evidence unavailable" : "Disjoint merge passed",
  },
  conflict: {
    code: [
      "mergora update data-grid --release-file <verified-release.json>",
      "mergora resolve <transaction-id> --list",
      `mergora resolve <transaction-id> --take-local ${trackedConflict?.target ?? "<target>"} --apply`,
    ],
    detail:
      trackedConflict === undefined
        ? "No exact-tarball conflict record is currently available."
        : `The ${trackedConflict.release} overlapping-update fixture isolated ${trackedConflict.target}; the live project remained ${readableEvidence(trackedConflict.liveProjectDuringConflict)} until ${readableEvidence(trackedConflict.resolution)}.`,
    evidence: trackedConflict === undefined ? "Evidence unavailable" : "Exact-tarball evidence",
    metrics: [
      ["Live project", readableEvidence(trackedConflict?.liveProjectDuringConflict)],
      ["Conflict packet", readableEvidence(trackedConflict?.conflictPacket)],
    ],
    result: trackedConflict === undefined ? "Not recorded" : "Conflict isolated",
  },
  rollback: {
    code: [
      "mergora recover --transaction <transaction-id> --strategy rollback --plan",
      "mergora recover --transaction <transaction-id> --strategy rollback --yes",
      "mergora rollback --last --plan",
    ],
    detail:
      trackedRecovery === undefined || trackedRollback === undefined
        ? "No exact-tarball recovery and rollback record is currently available."
        : `The fixture injected an interruption at ${trackedRecovery.injectedAt} for ${trackedRecovery.itemId}; recovery was ${readableEvidence(trackedRecovery.recovery)}, and completed-transaction rollback recorded ${readableEvidence(trackedRollback.rollback)}.`,
    evidence:
      trackedRecovery === undefined || trackedRollback === undefined
        ? "Evidence unavailable"
        : "Exact-tarball evidence",
    metrics: [
      ["Injected at", readableEvidence(trackedRecovery?.injectedAt)],
      ["Recovery", readableEvidence(trackedRecovery?.recovery)],
    ],
    result:
      trackedRecovery === undefined || trackedRollback === undefined
        ? "Not recorded"
        : "Byte-identical restore",
  },
} as const;

type SyncState = keyof typeof states;

export function SyncWorkbench() {
  const [active, setActive] = useState<SyncState>("merged");
  const current = states[active];
  return (
    <section aria-labelledby="sync-workbench-title" className="sync-workbench">
      <header className="sync-workbench__header">
        <div>
          <p className="site-eyebrow">Semantic Sync specimen</p>
          <h2 id="sync-workbench-title">Your edit and the upstream fix can coexist.</h2>
        </div>
        <span className="site-state-label">{current.evidence}</span>
      </header>
      <div aria-label="Choose source state" className="sync-workbench__tabs" role="group">
        {(Object.keys(states) as SyncState[]).map((state) => (
          <button
            aria-pressed={active === state}
            key={state}
            onClick={() => setActive(state)}
            type="button"
          >
            {state[0]!.toUpperCase() + state.slice(1)}
          </button>
        ))}
      </div>
      <div className="sync-workbench__body">
        <div aria-label={`${active} specimen`} className="sync-code" role="region">
          <ol>
            {current.code.map((line, index) => (
              <li key={`${active}-${String(index)}`}>
                <code>{line}</code>
              </li>
            ))}
          </ol>
        </div>
        <div className="sync-workbench__evidence">
          <span>Result</span>
          <strong>{current.result}</strong>
          <p>{current.detail}</p>
          <dl>
            {current.metrics.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
