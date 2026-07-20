"use client";

import { Button } from "mergora-ui/button";
import { Combobox, type ComboboxKey } from "mergora-ui/combobox";
import { DataGrid, type DataGridColumn } from "mergora-ui/data-grid";
import { Dialog } from "mergora-ui/dialog";
import { MergoraProvider, type MergoraDensity } from "mergora-ui/provider";
import { useMemo, useRef, useState, type ReactElement } from "react";

export interface HomepageEvidenceSource {
  readonly id: string;
  readonly displayName: string;
  readonly family: string;
  readonly layer: "component" | "foundation" | "kit" | "system";
  readonly implementationStatus: string;
  readonly sourceAvailable: boolean;
  readonly publicationStatus: string;
  readonly parityStatus: string;
  readonly maturityStatus: string;
  readonly interactionStatus: string;
  readonly accessibilityStatus: string;
  readonly advantageStatus: string;
  readonly advantageSummary: string;
  readonly optionalEnhancementSummary: string;
  readonly accessibilitySummary: string;
  readonly remainingBlockers: readonly string[];
}

export interface HomepageEvidenceRow {
  readonly id: string;
  readonly component: string;
  readonly family: string;
  readonly layer: HomepageEvidenceSource["layer"];
  readonly source: string;
  readonly publication: string;
  readonly parity: string;
  readonly maturity: string;
  readonly interaction: string;
  readonly accessibility: string;
  readonly advantageStatus: string;
  readonly advantageSummary: string;
  readonly optionalEnhancementSummary: string;
  readonly accessibilitySummary: string;
  readonly remainingBlockers: readonly string[];
}

export type HomepageEvidenceFilter =
  "all" | "components" | "systems" | "parity-verified" | "manual-evidence-open";

interface HomepageEvidenceFilterOption {
  readonly id: HomepageEvidenceFilter;
  readonly label: string;
  readonly description: string;
}

export const homepageEvidenceFilters: readonly HomepageEvidenceFilterOption[] = [
  {
    id: "all",
    label: "All evidence",
    description: "Button, Dialog, Combobox, and Data Grid",
  },
  {
    id: "components",
    label: "Components",
    description: "Action and overlay components",
  },
  {
    id: "systems",
    label: "Systems",
    description: "Collection and advanced-data systems",
  },
  {
    id: "parity-verified",
    label: "Parity verified",
    description: "Package, source, native registry, and Shadcn agree",
  },
  {
    id: "manual-evidence-open",
    label: "Manual evidence open",
    description: "Automated evidence exists; manual review remains",
  },
] as const;

function sentenceCase(value: string): string {
  const normalized = value.replaceAll("-", " ").trim();
  return normalized.length === 0
    ? "Unknown"
    : `${normalized[0]!.toUpperCase()}${normalized.slice(1)}`;
}

export function buildHomepageEvidenceRows(
  sources: readonly HomepageEvidenceSource[],
): readonly HomepageEvidenceRow[] {
  return sources.map((source) => ({
    id: source.id,
    component: source.displayName,
    family: sentenceCase(source.family),
    layer: source.layer,
    source:
      source.sourceAvailable && source.implementationStatus === "source-present-unreleased"
        ? "Present"
        : sentenceCase(source.implementationStatus),
    publication: sentenceCase(source.publicationStatus),
    parity: sentenceCase(source.parityStatus),
    maturity: sentenceCase(source.maturityStatus),
    interaction: sentenceCase(source.interactionStatus),
    accessibility: sentenceCase(source.accessibilityStatus),
    advantageStatus: sentenceCase(source.advantageStatus),
    advantageSummary: source.advantageSummary,
    optionalEnhancementSummary: source.optionalEnhancementSummary,
    accessibilitySummary: source.accessibilitySummary,
    remainingBlockers: source.remainingBlockers,
  }));
}

export function filterHomepageEvidenceRows(
  rows: readonly HomepageEvidenceRow[],
  filter: HomepageEvidenceFilter,
): readonly HomepageEvidenceRow[] {
  switch (filter) {
    case "all":
      return rows;
    case "components":
      return rows.filter((row) => row.layer === "component");
    case "systems":
      return rows.filter((row) => row.layer === "system");
    case "parity-verified":
      return rows.filter((row) => row.parity === "Verified");
    case "manual-evidence-open":
      return rows.filter((row) => row.accessibility !== "Verified");
  }
}

function isEvidenceFilter(value: ComboboxKey | null): value is HomepageEvidenceFilter {
  return (
    typeof value === "string" &&
    homepageEvidenceFilters.some((filterOption) => filterOption.id === value)
  );
}

const evidenceColumns: readonly DataGridColumn<HomepageEvidenceRow>[] = [
  {
    id: "component",
    header: "Component",
    accessor: (row) => row.component,
    sortable: true,
    width: "11rem",
  },
  {
    id: "family",
    header: "Family",
    accessor: (row) => row.family,
    sortable: true,
    width: "11rem",
  },
  {
    id: "source",
    header: "Source",
    accessor: (row) => row.source,
    width: "8rem",
  },
  {
    id: "parity",
    header: "Parity",
    accessor: (row) => row.parity,
    cell: (value) => (
      <span data-evidence-status={String(value).toLowerCase()}>{String(value)}</span>
    ),
    sortable: true,
    width: "8rem",
  },
  {
    id: "maturity",
    header: "Maturity",
    accessor: (row) => row.maturity,
    cell: (value) => (
      <span data-evidence-status={String(value).toLowerCase().replaceAll(" ", "-")}>
        {String(value)}
      </span>
    ),
    width: "8rem",
  },
] as const;

export interface HomepageProductionSpecimenProps {
  readonly evidence: readonly HomepageEvidenceSource[];
  readonly showComboboxClearAction?: boolean;
  readonly showDialogDismissHint?: boolean;
  readonly showSelectionSummary?: boolean;
}

export function HomepageProductionSpecimen({
  evidence,
  showComboboxClearAction = true,
  showDialogDismissHint = true,
  showSelectionSummary = true,
}: HomepageProductionSpecimenProps): ReactElement {
  const rows = useMemo(() => buildHomepageEvidenceRows(evidence), [evidence]);
  const [activeFilter, setActiveFilter] = useState<HomepageEvidenceFilter | null>("all");
  const [filterInput, setFilterInput] = useState("All evidence");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(() => rows[0]?.id ?? null);
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [density, setDensity] = useState<MergoraDensity>("comfortable");
  const [dialogOpen, setDialogOpen] = useState(false);
  const inspectButtonRef = useRef<HTMLButtonElement>(null);
  const visibleRows = useMemo(
    () => filterHomepageEvidenceRows(rows, activeFilter ?? "all"),
    [activeFilter, rows],
  );
  const sourcePresentCount = rows.filter((row) => row.source === "Present").length;
  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null;

  function selectFilter(nextValue: ComboboxKey | null): void {
    const nextFilter = isEvidenceFilter(nextValue) ? nextValue : null;
    const nextRows = filterHomepageEvidenceRows(rows, nextFilter ?? "all");
    const nextOption = homepageEvidenceFilters.find((option) => option.id === nextFilter);
    setActiveFilter(nextFilter);
    setFilterInput(nextValue === null ? "" : (nextOption?.label ?? ""));
    setSelectedRowId((current) =>
      nextRows.some((row) => row.id === current) ? current : (nextRows[0]?.id ?? null),
    );
  }

  return (
    <section className="homepage-production-specimen site-section">
      <header className="site-section__intro">
        <p className="site-eyebrow">Production-state specimen</p>
        <h2>Inspect the component evidence with the components themselves.</h2>
        <p>
          This public API slice uses Mergora controls for filtering, semantic selection, direction,
          density, and a focus-restoring evidence dialog. The rows come from the generated
          implementation matrix.
        </p>
      </header>

      <MergoraProvider density={density} direction={direction}>
        <div
          className="homepage-production-specimen__workbench"
          data-density={density}
          data-direction={direction}
        >
          <div className="homepage-production-specimen__toolbar">
            <div>
              <strong>Generated implementation evidence</strong>
              <span>
                {sourcePresentCount} source-present entries / publication{" "}
                {rows[0]?.publication ?? "Unknown"}
              </span>
            </div>
            <div aria-label="Specimen presentation" className="homepage-production-specimen__modes">
              <Button
                aria-pressed={direction === "rtl"}
                onClick={() => setDirection((current) => (current === "ltr" ? "rtl" : "ltr"))}
                size="small"
                variant="quiet"
              >
                {direction === "ltr" ? "Preview RTL" : "Preview LTR"}
              </Button>
              <Button
                aria-pressed={density === "touch"}
                onClick={() =>
                  setDensity((current) => (current === "touch" ? "comfortable" : "touch"))
                }
                size="small"
                variant="quiet"
              >
                {density === "touch" ? "Comfortable density" : "Touch density"}
              </Button>
            </div>
          </div>

          <div className="homepage-production-specimen__body">
            <aside
              aria-label="Evidence view controls"
              className="homepage-production-specimen__controls"
            >
              <Combobox.Root
                inputValue={filterInput}
                menuTrigger="manual"
                onInputValueChange={setFilterInput}
                onValueChange={selectFilter}
                value={activeFilter}
              >
                <Combobox.Label>Evidence view</Combobox.Label>
                <Combobox.Input placeholder="Type to find a view" />
                {showComboboxClearAction ? <Combobox.Clear label="Clear evidence view" /> : null}
                <Combobox.Trigger label="Show evidence views" />
                <Combobox.Description>
                  Select a layer or evidence state. Typing filters these view options.
                </Combobox.Description>
                <Combobox.Popover>
                  <Combobox.ListBox emptyContent="No matching evidence views">
                    {homepageEvidenceFilters.map((filterOption) => (
                      <Combobox.Item
                        className="homepage-production-specimen__filter-option"
                        id={filterOption.id}
                        key={filterOption.id}
                        textValue={filterOption.label}
                      >
                        <span>
                          <strong>{filterOption.label}</strong>
                          <small>{filterOption.description}</small>
                        </span>
                      </Combobox.Item>
                    ))}
                  </Combobox.ListBox>
                </Combobox.Popover>
              </Combobox.Root>

              <output aria-live="polite" className="homepage-production-specimen__result-count">
                {visibleRows.length} {visibleRows.length === 1 ? "entry" : "entries"} in this view
              </output>
              <p>
                Automated interaction evidence is current. Partial accessibility status means
                required manual assistive-technology records remain open.
              </p>
            </aside>

            <div className="homepage-production-specimen__grid">
              <DataGrid<HomepageEvidenceRow>
                caption="Generated Mergora implementation evidence"
                columns={evidenceColumns}
                getRowId={(row) => row.id}
                getRowLabel={(row) => `Inspect ${row.component} evidence`}
                onSelectedRowIdChange={setSelectedRowId}
                regionLabel="Generated implementation evidence table"
                rows={visibleRows}
                selectedRowId={selectedRowId}
                selectionMode="single"
                {...(showSelectionSummary
                  ? {
                      renderSelectionSummary: (row: HomepageEvidenceRow | null) =>
                        row === null
                          ? "No component evidence selected"
                          : `Selected ${row.component}. Parity ${row.parity.toLowerCase()}; maturity ${row.maturity.toLowerCase()}.`,
                    }
                  : {})}
              />

              <Dialog.Root
                finalFocusRef={inspectButtonRef}
                onOpenChange={setDialogOpen}
                open={dialogOpen}
              >
                <div className="homepage-production-specimen__inspection-rail">
                  <p>
                    {selectedRow === null
                      ? "Choose a row to inspect its generated evidence."
                      : `${selectedRow.component} selected / ${selectedRow.maturity}`}
                  </p>
                  <Button
                    aria-controls="homepage-evidence-dialog"
                    aria-expanded={dialogOpen}
                    aria-haspopup="dialog"
                    disabled={selectedRow === null}
                    onClick={() => setDialogOpen(true)}
                    ref={inspectButtonRef}
                    variant="primary"
                  >
                    Inspect selected evidence
                  </Button>
                </div>
                <Dialog.Overlay>
                  <Dialog.Content
                    id="homepage-evidence-dialog"
                    {...(showDialogDismissHint
                      ? {
                          dismissHint:
                            "Press Escape, use the close action, or activate outside this surface to return to the selected row.",
                        }
                      : {})}
                  >
                    <Dialog.Header>
                      <Dialog.Title>
                        {selectedRow?.component ?? "Component"} evidence checkpoint
                      </Dialog.Title>
                    </Dialog.Header>
                    <Dialog.Description>
                      Generated implementation-matrix facts. No maturity promotion or release claim
                      is made.
                    </Dialog.Description>
                    {selectedRow === null ? null : (
                      <div className="homepage-production-specimen__dialog-evidence">
                        <dl>
                          <div>
                            <dt>Source</dt>
                            <dd>
                              {selectedRow.source} / {selectedRow.publication}
                            </dd>
                          </div>
                          <div>
                            <dt>Package / source / Shadcn parity</dt>
                            <dd>{selectedRow.parity}</dd>
                          </div>
                          <div>
                            <dt>Honest maturity</dt>
                            <dd>{selectedRow.maturity}</dd>
                          </div>
                          <div>
                            <dt>Interaction evidence</dt>
                            <dd>{selectedRow.interaction}</dd>
                          </div>
                          <div>
                            <dt>Accessibility evidence</dt>
                            <dd>{selectedRow.accessibility}</dd>
                          </div>
                        </dl>
                        <section>
                          <h3>Mergora advantage / {selectedRow.advantageStatus}</h3>
                          <p>{selectedRow.advantageSummary}</p>
                          <p>{selectedRow.optionalEnhancementSummary}</p>
                        </section>
                        <section>
                          <h3>Open evidence</h3>
                          <p>{selectedRow.accessibilitySummary}</p>
                          <ul>
                            {selectedRow.remainingBlockers.map((blocker) => (
                              <li key={blocker}>{blocker}</li>
                            ))}
                          </ul>
                        </section>
                      </div>
                    )}
                    <Dialog.Footer>
                      <Dialog.Close>Return to evidence table</Dialog.Close>
                    </Dialog.Footer>
                  </Dialog.Content>
                </Dialog.Overlay>
              </Dialog.Root>
            </div>
          </div>
        </div>
      </MergoraProvider>
    </section>
  );
}
