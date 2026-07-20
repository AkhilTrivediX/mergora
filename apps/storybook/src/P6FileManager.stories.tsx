import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type ReactElement } from "react";

import {
  createDeterministicFileManagerAdapter,
  createDeterministicFileManagerSnapshot,
  FileManager,
  type FileManagerView,
} from "../../../registry/source/kits/file-manager/index.ts";
import "mergora-tokens/tokens.css";

interface StoryProps {
  readonly announceOperations: boolean;
  readonly enableRecoveryActions: boolean;
  readonly showConflictGuidance: boolean;
  readonly showStorageContext: boolean;
  readonly virtualized: boolean;
}

function FileManagerStory(args: StoryProps): ReactElement {
  const adapter = useMemo(() => createDeterministicFileManagerAdapter(), []);
  return (
    <FileManager
      adapter={adapter}
      announceOperations={args.announceOperations}
      defaultFolderId="working-set"
      enableRecoveryActions={args.enableRecoveryActions}
      initialSnapshot={createDeterministicFileManagerSnapshot()}
      renderPreview={(file) => (
        <p>Preview metadata for {file.name}. Content loading stays adapter-owned.</p>
      )}
      showConflictGuidance={args.showConflictGuidance}
      showStorageContext={args.showStorageContext}
      virtualWindow={args.virtualized ? { startIndex: 0, windowSize: 1 } : false}
    />
  );
}

const disabled: StoryProps = {
  announceOperations: false,
  enableRecoveryActions: false,
  showConflictGuidance: false,
  showStorageContext: false,
  virtualized: false,
};

const meta = {
  title: "Kits/File Manager",
  component: FileManagerStory,
  parameters: { layout: "padded", a11y: { test: "error" } },
  argTypes: {
    announceOperations: { control: "boolean" },
    enableRecoveryActions: { control: "boolean" },
    showConflictGuidance: { control: "boolean" },
    showStorageContext: { control: "boolean" },
    virtualized: { control: "boolean" },
  },
} satisfies Meta<typeof FileManagerStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicFileManager: Story = { args: disabled, name: "File Manager · basic" };
export const RecommendedFileManager: Story = {
  args: {
    announceOperations: true,
    enableRecoveryActions: true,
    showConflictGuidance: true,
    showStorageContext: true,
    virtualized: false,
  },
  name: "File Manager · Recommended Mergora",
};

function ControlledExample(): ReactElement {
  const adapter = useMemo(() => createDeterministicFileManagerAdapter(), []);
  const [folderId, setFolderId] = useState("working-set");
  const [selectedFileId, setSelectedFileId] = useState<string | null>("interface-map");
  const [view, setView] = useState<FileManagerView>("list");
  return (
    <FileManager
      adapter={adapter}
      enableRecoveryActions
      folderId={folderId}
      initialSnapshot={createDeterministicFileManagerSnapshot()}
      onFolderIdChange={setFolderId}
      onSelectedFileIdChange={setSelectedFileId}
      onViewChange={setView}
      selectedFileId={selectedFileId}
      view={view}
    />
  );
}

export const ControlledFileManager: Story = {
  args: disabled,
  render: () => <ControlledExample />,
};

export const FileManagerStateMatrix: Story = {
  args: disabled,
  render: () => (
    <div style={{ display: "grid", gap: "2rem" }}>
      <FileManagerStory {...disabled} />
      <FileManager
        adapter={createDeterministicFileManagerAdapter()}
        disabled
        initialSnapshot={createDeterministicFileManagerSnapshot()}
        label="Disabled file workspace"
      />
      <FileManager
        adapter={createDeterministicFileManagerAdapter()}
        initialSnapshot={createDeterministicFileManagerSnapshot()}
        label="Read-only file workspace"
        readOnly
      />
      <FileManager
        adapter={createDeterministicFileManagerAdapter()}
        initialSnapshot={createDeterministicFileManagerSnapshot()}
        label="Offline cached workspace"
        offline
      />
    </div>
  ),
};

export const NarrowRtlFileManager: Story = {
  args: disabled,
  render: () => (
    <div dir="rtl" style={{ inlineSize: 320, maxInlineSize: "100%" }}>
      <FileManagerStory {...disabled} enableRecoveryActions showConflictGuidance />
    </div>
  ),
};

export const FileManagerPreferences: Story = {
  args: { ...disabled, announceOperations: true, enableRecoveryActions: true },
  render: (args) => (
    <div>
      <p>Use the folder-tree arrows, Tab through file actions, and Enter to activate controls.</p>
      <FileManagerStory {...args} />
    </div>
  ),
};
