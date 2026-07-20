"use client";

import { schemaFor } from "mergora-schema";
import { tokenVariable } from "mergora-tokens";
import { Button } from "mergora-ui/button";
import { Combobox } from "mergora-ui/combobox";
import { DataGrid, type DataGridColumn } from "mergora-ui/data-grid";
import { DatePicker } from "mergora-ui/date-picker";
import { Dialog } from "mergora-ui/dialog";
import { FileUpload } from "mergora-ui/file-upload";

const schemaDialect = schemaFor("config").$schema ?? "missing";
interface ArtifactRow {
  readonly id: string;
  readonly name: string;
  readonly state: string;
}
const artifactRows: readonly ArtifactRow[] = [
  { id: "registry", name: "Registry bundle", state: "Ready" },
  { id: "storybook", name: "Storybook export", state: "Review" },
];
const artifactColumns: readonly DataGridColumn<ArtifactRow>[] = [
  { accessor: (row) => row.name, header: "Artifact", id: "name", sortable: true },
  { accessor: (row) => row.state, header: "State", id: "state" },
];

export function Showcase() {
  return (
    <section
      aria-label="Package subpath components"
      className="consumer-stack"
      data-consumer-mode="package"
      data-schema-dialect={schemaDialect}
      style={{ background: tokenVariable("semantic.color.background.canvas") }}
    >
      <Button variant="primary">Packed Button</Button>
      <Dialog.Root>
        <Dialog.Trigger>Open packed Dialog</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content>
            <Dialog.Title>Packed Dialog</Dialog.Title>
            <Dialog.Description>Built from the exact UI tarball.</Dialog.Description>
            <Dialog.Close>Close</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
      <Combobox.Root defaultValue="alpha">
        <Combobox.Label>Packed Combobox</Combobox.Label>
        <Combobox.Input />
        <Combobox.Trigger />
        <Combobox.Popover>
          <Combobox.ListBox>
            <Combobox.Item id="alpha">Alpha</Combobox.Item>
            <Combobox.Item id="beta">Beta</Combobox.Item>
          </Combobox.ListBox>
        </Combobox.Popover>
      </Combobox.Root>
      <DatePicker defaultValue="2026-07-20" inputLabel="Packed review date" showDateContext />
      <FileUpload
        acceptedFileTypes={["application/json"]}
        label="Packed evidence files"
        maxFiles={3}
        validateFileSize
      />
      <DataGrid
        caption="Packed artifact readiness"
        columns={artifactColumns}
        defaultSelectedRowId="registry"
        getRowId={(row) => row.id}
        getRowLabel={(row) => `Select ${row.name}`}
        renderSelectionSummary={(row) =>
          row === null ? "No artifact selected" : `${row.name}: ${row.state}`
        }
        rows={artifactRows}
        selectionMode="single"
      />
    </section>
  );
}
