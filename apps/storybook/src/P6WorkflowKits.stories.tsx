import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactElement } from "react";

import {
  AdminDashboardShell,
  createDeterministicAdminDashboardShellAdapter,
  type AdminDashboardShellAdapter,
} from "../../../registry/source/kits/admin-dashboard-shell/index.ts";
import {
  CommandCenter,
  createDeterministicCommandCenterAdapter,
  type CommandCenterAdapter,
} from "../../../registry/source/kits/command-center/index.ts";
import {
  CrudDataWorkspace,
  createDeterministicCrudDataWorkspaceAdapter,
  type CrudDataWorkspaceAdapter,
} from "../../../registry/source/kits/crud-data-workspace/index.ts";
import "mergora-tokens/tokens.css";

type Kind = "admin-dashboard-shell" | "command-center" | "crud-data-workspace";

interface WorkflowKitStoryProps {
  readonly announceResultCount: boolean;
  readonly bulkActions: boolean;
  readonly enableUndo: boolean;
  readonly globalShortcut: boolean;
  readonly interactiveChart: boolean;
  readonly kind: Kind;
  readonly mobileEntry: boolean;
  readonly optimisticMutations: boolean;
  readonly permissionFilteredNavigation: boolean;
  readonly recentCommands: boolean;
  readonly savedViews: boolean;
  readonly showActivityQueryTools: boolean;
  readonly showChartDataTable: boolean;
  readonly showExecutionPreview: boolean;
  readonly showMutationTimeline: boolean;
  readonly showNotifications: boolean;
  readonly showRoleContext: boolean;
  readonly showShortcuts: boolean;
}

const adminAdapter = createDeterministicAdminDashboardShellAdapter();
const commandAdapter = createDeterministicCommandCenterAdapter();
const crudAdapter = createDeterministicCrudDataWorkspaceAdapter();

const disabled = {
  announceResultCount: false,
  bulkActions: false,
  enableUndo: false,
  globalShortcut: false,
  interactiveChart: false,
  mobileEntry: false,
  optimisticMutations: false,
  permissionFilteredNavigation: false,
  recentCommands: false,
  savedViews: false,
  showActivityQueryTools: false,
  showChartDataTable: false,
  showExecutionPreview: false,
  showMutationTimeline: false,
  showNotifications: false,
  showRoleContext: false,
  showShortcuts: false,
} as const;

function WorkflowKitStory(args: WorkflowKitStoryProps): ReactElement {
  if (args.kind === "admin-dashboard-shell") {
    return (
      <AdminDashboardShell
        adapter={adminAdapter}
        interactiveChart={args.interactiveChart}
        permissionFilteredNavigation={args.permissionFilteredNavigation}
        role={args.permissionFilteredNavigation ? "analyst" : "owner"}
        showActivityQueryTools={args.showActivityQueryTools}
        showChartDataTable={args.showChartDataTable}
        showNotifications={args.showNotifications}
        showRoleContext={args.showRoleContext}
      />
    );
  }
  if (args.kind === "command-center") {
    return (
      <CommandCenter
        adapter={commandAdapter}
        announceResultCount={args.announceResultCount}
        defaultQuery={args.recentCommands ? "" : "component"}
        globalShortcut={args.globalShortcut ? "mod-k" : false}
        mobileEntryLabel={args.mobileEntry ? "Search workspace commands" : false}
        presentation={args.mobileEntry || args.globalShortcut ? "modal" : "embedded"}
        recentCommands={args.recentCommands}
        showExecutionPreview={args.showExecutionPreview}
        showShortcuts={args.showShortcuts}
      />
    );
  }
  return (
    <CrudDataWorkspace
      adapter={crudAdapter}
      bulkActions={args.bulkActions}
      enableUndo={args.enableUndo}
      optimisticMutations={args.optimisticMutations}
      savedViews={args.savedViews}
      showMutationTimeline={args.showMutationTimeline}
    />
  );
}

const meta: Meta<typeof WorkflowKitStory> = {
  title: "Kits/Workflow Operations",
  component: WorkflowKitStory,
  parameters: { layout: "padded", a11y: { test: "error" } },
  argTypes: {
    kind: {
      control: "select",
      options: ["admin-dashboard-shell", "command-center", "crud-data-workspace"],
    },
    announceResultCount: { control: "boolean" },
    bulkActions: { control: "boolean" },
    enableUndo: { control: "boolean" },
    globalShortcut: { control: "boolean" },
    interactiveChart: { control: "boolean" },
    mobileEntry: { control: "boolean" },
    optimisticMutations: { control: "boolean" },
    permissionFilteredNavigation: { control: "boolean" },
    recentCommands: { control: "boolean" },
    savedViews: { control: "boolean" },
    showActivityQueryTools: { control: "boolean" },
    showChartDataTable: { control: "boolean" },
    showExecutionPreview: { control: "boolean" },
    showMutationTimeline: { control: "boolean" },
    showNotifications: { control: "boolean" },
    showRoleContext: { control: "boolean" },
    showShortcuts: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicAdminDashboardShell: Story = {
  args: { ...disabled, kind: "admin-dashboard-shell" },
};
export const RecommendedAdminDashboardShell: Story = {
  args: {
    ...disabled,
    interactiveChart: true,
    kind: "admin-dashboard-shell",
    permissionFilteredNavigation: true,
    showActivityQueryTools: true,
    showChartDataTable: true,
    showNotifications: true,
    showRoleContext: true,
  },
};
export const BasicCommandCenter: Story = {
  args: { ...disabled, kind: "command-center" },
};
export const RecommendedCommandCenter: Story = {
  args: {
    ...disabled,
    announceResultCount: true,
    globalShortcut: true,
    kind: "command-center",
    mobileEntry: true,
    recentCommands: true,
    showExecutionPreview: true,
    showShortcuts: true,
  },
};
export const BasicCrudDataWorkspace: Story = {
  args: { ...disabled, kind: "crud-data-workspace" },
};
export const RecommendedCrudDataWorkspace: Story = {
  args: {
    ...disabled,
    bulkActions: true,
    enableUndo: true,
    kind: "crud-data-workspace",
    optimisticMutations: true,
    savedViews: true,
    showMutationTimeline: true,
  },
};

function ControlledCommandSpecimen() {
  const [query, setQuery] = useState("evidence");
  return (
    <div>
      <CommandCenter
        adapter={commandAdapter}
        announceResultCount
        onQueryChange={setQuery}
        query={query}
        showExecutionPreview
      />
      <output>Controlled query: {query || "empty"}</output>
    </div>
  );
}

export const ControlledCommandCenter: Story = {
  args: { ...disabled, kind: "command-center" },
  render: () => <ControlledCommandSpecimen />,
};

function ControlledAdminSpecimen() {
  const [sectionId, setSectionId] = useState("overview");
  return (
    <div>
      <AdminDashboardShell
        adapter={adminAdapter}
        currentSectionId={sectionId}
        onSectionChange={setSectionId}
      />
      <output>Controlled section: {sectionId}</output>
    </div>
  );
}

export const ControlledAdminDashboardShell: Story = {
  args: { ...disabled, kind: "admin-dashboard-shell" },
  render: () => <ControlledAdminSpecimen />,
};

const neverResolvingAdminAdapter: AdminDashboardShellAdapter = {
  async load() {
    return new Promise(() => undefined);
  },
};
const errorCommandAdapter: CommandCenterAdapter = {
  ...commandAdapter,
  async search() {
    throw new Error("Deterministic command search failure.");
  },
};
const readOnlyCrudAdapter: CrudDataWorkspaceAdapter = {
  ...createDeterministicCrudDataWorkspaceAdapter(),
  async load(signal) {
    const snapshot = await createDeterministicCrudDataWorkspaceAdapter().load(signal);
    return {
      ...snapshot,
      permissions: {
        canBulkUpdate: false,
        canCreate: false,
        canDelete: false,
        canUpdate: false,
      },
    };
  },
};
const emptyCrudAdapter: CrudDataWorkspaceAdapter = {
  ...createDeterministicCrudDataWorkspaceAdapter(),
  async load(signal) {
    if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    return {
      permissions: {
        canBulkUpdate: false,
        canCreate: true,
        canDelete: false,
        canUpdate: false,
      },
      records: [],
      savedViews: [],
    };
  },
};

export const WorkflowKitStateMatrix: Story = {
  args: { ...disabled, kind: "crud-data-workspace" },
  render: () => (
    <div style={{ display: "grid", gap: "2rem" }}>
      <section aria-label="Dashboard loading state">
        <AdminDashboardShell adapter={neverResolvingAdminAdapter} />
      </section>
      <section aria-label="Command error and retry state">
        <CommandCenter adapter={errorCommandAdapter} defaultQuery="failure" />
      </section>
      <section aria-label="Read-only records state">
        <CrudDataWorkspace adapter={readOnlyCrudAdapter} />
      </section>
      <section aria-label="Empty records state">
        <CrudDataWorkspace adapter={emptyCrudAdapter} />
      </section>
    </div>
  ),
};

export const CrudDataFormAndRecovery: Story = {
  args: { ...disabled, kind: "crud-data-workspace" },
  render: () => (
    <CrudDataWorkspace
      adapter={createDeterministicCrudDataWorkspaceAdapter()}
      enableUndo
      optimisticMutations
      showMutationTimeline
    />
  ),
};

export const OfflineWorkflowKits: Story = {
  args: { ...disabled, kind: "admin-dashboard-shell" },
  render: () => (
    <div style={{ display: "grid", gap: "2rem" }}>
      <AdminDashboardShell adapter={adminAdapter} offline />
      <CrudDataWorkspace adapter={createDeterministicCrudDataWorkspaceAdapter()} offline />
    </div>
  ),
};

export const NarrowRtlWorkflowKits: Story = {
  args: { ...disabled, kind: "admin-dashboard-shell" },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  render: () => (
    <div dir="rtl" lang="ar" style={{ display: "grid", gap: "2rem", maxWidth: 320 }}>
      <AdminDashboardShell
        adapter={adminAdapter}
        interactiveChart
        permissionFilteredNavigation
        role="analyst"
        showChartDataTable
        showNotifications
        showRoleContext
      />
      <CommandCenter
        adapter={commandAdapter}
        announceResultCount
        defaultQuery="component"
        showExecutionPreview
        showShortcuts
      />
      <CrudDataWorkspace
        adapter={createDeterministicCrudDataWorkspaceAdapter()}
        bulkActions
        savedViews
        showMutationTimeline
      />
    </div>
  ),
};
