import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import implementationMatrix from "../../registry/generated/implementation-matrix.v1.json";
import {
  HomepageProductionSpecimen,
  buildHomepageEvidenceRows,
  filterHomepageEvidenceRows,
  type HomepageEvidenceSource,
} from "../../apps/web/src/app/homepage-production-specimen";

const specimenIds = ["button", "dialog", "combobox", "data-grid"] as const;

function isHomepageLayer(value: string): value is HomepageEvidenceSource["layer"] {
  return value === "component" || value === "foundation" || value === "kit" || value === "system";
}

const evidence = specimenIds.map((id): HomepageEvidenceSource => {
  const item = implementationMatrix.items.find((candidate) => candidate.id === id);
  if (item === undefined) throw new Error(`Missing generated matrix item ${id}.`);
  if (!isHomepageLayer(item.layer)) throw new Error(`Invalid generated matrix layer for ${id}.`);
  return {
    id: item.id,
    displayName: item.displayName,
    family: item.family,
    layer: item.layer,
    implementationStatus: item.implementationStatus,
    sourceAvailable: item.sourceAvailable,
    publicationStatus: implementationMatrix.publicationStatus,
    parityStatus: item.packageSourceShadcnParity.assessment.status,
    maturityStatus: item.maturity.assessment.status,
    interactionStatus: item.interactionEvidence.status,
    accessibilityStatus: item.accessibilityEvidence.status,
    advantageStatus: item.mergoraAdvantage.status,
    advantageSummary: item.mergoraAdvantage.summary,
    optionalEnhancementSummary: item.optionalEnhancements.items[0]?.summary ?? "",
    accessibilitySummary: item.accessibilityEvidence.summary,
    remainingBlockers: item.remainingBlockers.map((blocker) => blocker.summary),
  };
});

describe("homepage production specimen model", () => {
  it("projects honest source, parity, maturity, and publication facts from the matrix", () => {
    const rows = buildHomepageEvidenceRows(evidence);

    expect(rows.map((row) => row.id)).toEqual(specimenIds);
    expect(rows.every((row) => row.source === "Present")).toBe(true);
    expect(rows.every((row) => row.parity === "Verified")).toBe(true);
    expect(rows.every((row) => row.maturity === "Not ready")).toBe(true);
    expect(rows.every((row) => row.publication === "Blocked unreleased")).toBe(true);
    expect(rows.every((row) => row.advantageStatus === "Evidence backed")).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/\b(?:Stable|Released)\b/u);
  });

  it("filters the evidence view without inventing component status", () => {
    const rows = buildHomepageEvidenceRows(evidence);

    expect(filterHomepageEvidenceRows(rows, "components").map((row) => row.id)).toEqual([
      "button",
      "dialog",
    ]);
    expect(filterHomepageEvidenceRows(rows, "systems").map((row) => row.id)).toEqual([
      "combobox",
      "data-grid",
    ]);
    expect(filterHomepageEvidenceRows(rows, "parity-verified")).toHaveLength(4);
    expect(filterHomepageEvidenceRows(rows, "manual-evidence-open")).toHaveLength(4);
  });

  it("uses public components and keeps each optional enhancement independently removable", () => {
    const source = readFileSync("apps/web/src/app/homepage-production-specimen.tsx", "utf8");

    expect(source).toContain('from "mergora-ui/button"');
    expect(source).toContain('from "mergora-ui/dialog"');
    expect(source).toContain('from "mergora-ui/combobox"');
    expect(source).toContain('from "mergora-ui/data-grid"');
    expect(source).toContain("<DataGrid<HomepageEvidenceRow>");
    expect(source).toContain("showComboboxClearAction ?");
    expect(source).toContain("showDialogDismissHint");
    expect(source).toContain("showSelectionSummary");
    expect(source).not.toMatch(/<table(?:\s|>)/u);
  });

  it("server-renders the public component semantics instead of a homepage mock", () => {
    const markup = renderToStaticMarkup(createElement(HomepageProductionSpecimen, { evidence }));

    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('data-slot="combobox-root"');
    expect(markup).toContain('data-slot="data-grid-table"');
    expect(markup).toContain("<table");
    expect(markup).toContain("Selected Button. Parity verified; maturity not ready.");
    expect(markup).not.toContain("Not verified");
  });

  it("removes optional combobox and DataGrid enhancement output when disabled", () => {
    const markup = renderToStaticMarkup(
      createElement(HomepageProductionSpecimen, {
        evidence,
        showComboboxClearAction: false,
        showDialogDismissHint: false,
        showSelectionSummary: false,
      }),
    );

    expect(markup).not.toContain('data-slot="combobox-clear"');
    expect(markup).not.toContain('data-slot="data-grid-selection-summary"');
    expect(markup).not.toContain('aria-live="polite" class="mrg-data-grid__selection-summary"');
  });

  it("grounds Semantic Sync conflict and rollback states in tracked lifecycle evidence", () => {
    const source = readFileSync("apps/web/src/app/sync-workbench.tsx", "utf8");

    expect(source).toContain("tests/packed-consumers/evidence.json");
    expect(source).toContain("trackedLifecycle?.overlappingUpdate");
    expect(source).toContain("trackedLifecycle?.interruptedRecovery");
    expect(source).toContain("trackedLifecycle?.ownershipAndRollback");
    expect(source).not.toContain("Local bytes dropped");
    expect(source).not.toContain("Unresolved conflicts");
  });
});
