import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { createAxeCoreAdapter } from "../../../../packages/test-utils/src/adapters/axe-core.ts";
import { createDomSemanticQueryPort } from "../../../../packages/test-utils/src/adapters/dom-semantic.ts";
import { runAxeContract } from "../../../../packages/test-utils/src/runtime-contracts.ts";
import {
  querySemantically,
  type SemanticQuery,
} from "../../../../packages/test-utils/src/semantic-query.ts";
import "mergora-tokens/tokens.css";
import { Button } from "../../../../registry/source/components/button/button.tsx";
import { Combobox } from "../../../../registry/source/components/combobox/combobox.tsx";
import "../../../../registry/source/components/combobox/combobox.css";
import { Dialog } from "../../../../registry/source/components/dialog/dialog.tsx";
import "../../../../registry/source/components/dialog/dialog.css";
import {
  DataGrid,
  type DataGridColumn,
} from "../../../../registry/source/systems/data-grid/data-grid.tsx";
import "../../../../registry/source/systems/data-grid/data-grid.css";
import "./fixture.css";

const parameters = new URLSearchParams(window.location.search);
const theme = parameters.get("theme");
const contrast = parameters.get("contrast");
const density = parameters.get("density");
const direction = parameters.get("dir");

document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
document.documentElement.dataset.density = density === "touch" ? "touch" : "comfortable";
document.documentElement.dir = direction === "rtl" ? "rtl" : "ltr";
if (contrast === "enhanced") document.documentElement.dataset.contrast = "enhanced";

interface Incident {
  readonly id: string;
  readonly owner: string;
  readonly priority: number;
  readonly status: string;
}

const incidents: readonly Incident[] = [
  { id: "INC-104", owner: "Amara", priority: 2, status: "Investigating" },
  { id: "INC-105", owner: "Jonas", priority: 1, status: "Monitoring" },
  { id: "INC-106", owner: "Mei", priority: 3, status: "Resolved" },
];

const incidentColumns: readonly DataGridColumn<Incident>[] = [
  { id: "id", header: "Incident", accessor: (incident) => incident.id, sortable: true },
  { id: "status", header: "Status", accessor: (incident) => incident.status, sortable: true },
  { id: "owner", header: "Owner", accessor: (incident) => incident.owner },
  {
    id: "priority",
    header: "Priority",
    accessor: (incident) => incident.priority,
    sortable: true,
    alignment: "end",
  },
];

function ButtonSpecimen() {
  const [runCount, setRunCount] = useState(0);

  return (
    <section
      className="evidence-specimen"
      data-evidence-item="button"
      aria-labelledby="button-heading"
    >
      <h2 id="button-heading">Button</h2>
      <div className="evidence-actions">
        <Button onClick={() => setRunCount((count) => count + 1)}>Run evidence check</Button>
        <Button pending pendingLabel="Checking evidence" variant="secondary">
          Check evidence
        </Button>
      </div>
      <p className="evidence-status" aria-live="polite">
        Evidence checks run: {runCount}
      </p>
    </section>
  );
}

function DialogSpecimen() {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <section
      className="evidence-specimen"
      data-evidence-item="dialog"
      aria-labelledby="dialog-heading"
    >
      <h2 id="dialog-heading">Dialog</h2>
      <div className="evidence-actions">
        <Dialog.Root>
          <Dialog.Trigger>Open merge review</Dialog.Trigger>
          <Dialog.Overlay>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Review merge result</Dialog.Title>
              </Dialog.Header>
              <Dialog.Description>
                The local color edit and upstream focus fix are both preserved.
              </Dialog.Description>
              <Dialog.Footer>
                <Dialog.Close>Close merge review</Dialog.Close>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Root>
        <Dialog.Root>
          <Dialog.Trigger>Open explicit focus review</Dialog.Trigger>
          <Dialog.Overlay>
            <Dialog.Content initialFocusRef={closeRef}>
              <Dialog.Header>
                <Dialog.Title>Explicit focus review</Dialog.Title>
              </Dialog.Header>
              <Dialog.Description>
                This fixture verifies the documented initial focus override.
              </Dialog.Description>
              <Dialog.Footer>
                <Dialog.Close ref={closeRef}>Close explicit focus review</Dialog.Close>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Root>
      </div>
    </section>
  );
}

function App() {
  return (
    <main className="evidence-shell" id="evidence-root">
      <h1>P1 browser evidence workbench</h1>
      <p className="evidence-intro">
        This deterministic fixture renders the canonical Button, Dialog, Combobox, and Experimental
        Data Grid tracer without a private component fork.
      </p>

      <div className="evidence-rail">
        <ButtonSpecimen />

        <DialogSpecimen />

        <section
          className="evidence-specimen"
          data-evidence-item="combobox"
          aria-labelledby="combobox-heading"
        >
          <h2 id="combobox-heading">Combobox</h2>
          <Combobox.Root defaultValue="berlin">
            <Combobox.Label>Deployment region</Combobox.Label>
            <Combobox.Input placeholder="Choose a region" />
            <Combobox.Trigger />
            <Combobox.Description>Select the closest operational region.</Combobox.Description>
            <Combobox.Popover>
              <Combobox.ListBox aria-label="Deployment regions">
                <Combobox.Item id="berlin">Berlin</Combobox.Item>
                <Combobox.Item id="mumbai">Mumbai</Combobox.Item>
                <Combobox.Item id="tokyo">Tokyo</Combobox.Item>
              </Combobox.ListBox>
            </Combobox.Popover>
          </Combobox.Root>
        </section>

        <section
          className="evidence-specimen evidence-grid-specimen"
          data-evidence-item="data-grid"
          aria-labelledby="data-grid-heading"
        >
          <h2 id="data-grid-heading">Data Grid tracer</h2>
          <span className="evidence-experimental">Experimental architecture tracer</span>
          <DataGrid
            rows={incidents}
            columns={incidentColumns}
            getRowId={(incident) => incident.id}
            caption="Active incident queue"
            regionLabel="Active incidents: horizontally scrollable table"
            selectionMode="single"
            defaultSelectedRowId="INC-105"
            getRowLabel={(incident) => `Select incident ${incident.id}`}
          />
        </section>
      </div>
    </main>
  );
}

const root = document.querySelector("#root");
if (!(root instanceof HTMLElement)) throw new Error("The evidence fixture root is unavailable.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function semanticResult(query: SemanticQuery) {
  const fixture = document.querySelector("#evidence-root");
  if (!(fixture instanceof HTMLElement))
    throw new Error("The rendered evidence root is unavailable.");
  const element = querySemantically(createDomSemanticQueryPort(fixture), query);
  return {
    dataSlot: element.getAttribute("data-slot"),
    tagName: element.tagName.toLocaleLowerCase(),
    text: element.textContent?.trim() ?? "",
  };
}

window.__mergoraEvidence = {
  query: semanticResult,
  runAxe: async () =>
    runAxeContract(
      createAxeCoreAdapter({ document }),
      document,
      undefined,
      "2026-07-18T00:00:00.000Z",
    ),
};
