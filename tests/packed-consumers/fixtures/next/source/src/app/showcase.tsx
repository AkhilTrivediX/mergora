"use client";

import { schemaFor } from "mergora-schema";
import { tokenVariable } from "mergora-tokens";
import {
  AdminDashboardShell,
  createDeterministicAdminDashboardShellAdapter,
} from "../components/admin-dashboard-shell";
import { Button } from "../components/button/button";
import { Combobox } from "../components/combobox/combobox";
import { DataGrid, type DataGridColumn } from "../components/data-grid";
import { DatePicker } from "../components/date-picker";
import { Dialog } from "../components/dialog";
import { FileUpload } from "../components/file-upload";

const schemaDialect = schemaFor("config").$schema ?? "missing";
const dashboardAdapter = createDeterministicAdminDashboardShellAdapter();
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
      aria-label="CLI-copied source components"
      className="consumer-stack"
      data-consumer-mode="source"
      data-schema-dialect={schemaDialect}
      style={{ background: tokenVariable("semantic.color.background.canvas") }}
    >
      <Button variant="primary">Source Button</Button>
      <Dialog.Root>
        <Dialog.Trigger>Open source Dialog</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content>
            <Dialog.Title>Source Dialog</Dialog.Title>
            <Dialog.Description>Installed by the exact packed CLI.</Dialog.Description>
            <Dialog.Close>Close</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
      <Combobox.Root defaultValue="alpha">
        <Combobox.Label>Source Combobox</Combobox.Label>
        <Combobox.Input />
        <Combobox.Trigger />
        <Combobox.Popover>
          <Combobox.ListBox>
            <Combobox.Item id="alpha">Alpha</Combobox.Item>
            <Combobox.Item id="beta">Beta</Combobox.Item>
          </Combobox.ListBox>
        </Combobox.Popover>
      </Combobox.Root>
      <DatePicker defaultValue="2026-07-20" inputLabel="Source review date" showDateContext />
      <FileUpload
        acceptedFileTypes={["application/json"]}
        label="Source evidence files"
        maxFiles={3}
        validateFileSize
      />
      <DataGrid
        caption="Source artifact readiness"
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
      <AdminDashboardShell adapter={dashboardAdapter} showRoleContext />
    </section>
  );
}
