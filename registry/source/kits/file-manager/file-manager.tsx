"use client";

import "./file-manager.css";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { Button } from "../../components/button/button.js";
import { TreeView, type TreeViewItem } from "../../components/tree-view/tree-view.js";
import { UploadProgress } from "../../components/upload-progress/upload-progress.js";
import {
  type FileManagerAdapter,
  type FileManagerFile,
  type FileManagerFolder,
  type FileManagerSnapshot,
} from "./file-manager-adapter.js";
import { useFileManager } from "./file-manager-state.js";

export type FileManagerView = "grid" | "list";

export interface FileManagerVirtualWindow {
  /** Zero-based index of the first file rendered in the consumer-controlled window. */
  readonly startIndex: number;
  /** Positive number of files rendered from `startIndex`. */
  readonly windowSize: number;
}

export interface FileManagerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Consumer adapter that owns file data, authorization, storage, mutations, and recovery. */
  readonly adapter: FileManagerAdapter;
  /** Adds polite operation feedback; false removes its live region and announcements. */
  readonly announceOperations?: boolean;
  /** Initial folder identifier for uncontrolled navigation. */
  readonly defaultFolderId?: string;
  /** Initial selected file identifier for uncontrolled selection. */
  readonly defaultSelectedFileId?: string;
  /** Initial grid or list presentation for uncontrolled use. */
  readonly defaultView?: FileManagerView;
  /** Disables navigation and file operations while preserving readable workspace context. */
  readonly disabled?: boolean;
  /** Adds bounded restore actions after removal; false removes receipt state and undo UI. */
  readonly enableRecoveryActions?: boolean;
  /** Controlled current folder identifier; use with `onFolderIdChange`. */
  readonly folderId?: string;
  /** Optional server-provided snapshot that bypasses the initial adapter load. */
  readonly initialSnapshot?: FileManagerSnapshot;
  /** Accessible and visible workspace name, defaulting to `File manager`. */
  readonly label?: ReactNode;
  /** Prevents adapter requests and presents explicit offline recovery context. */
  readonly offline?: boolean;
  /** Reports controlled or uncontrolled folder navigation changes. */
  readonly onFolderIdChange?: (folderId: string) => void;
  /** Reports controlled or uncontrolled file selection changes. */
  readonly onSelectedFileIdChange?: (fileId: string | null) => void;
  /** Reports controlled or uncontrolled grid/list presentation changes. */
  readonly onViewChange?: (view: FileManagerView) => void;
  /** Prevents file mutations while retaining navigation, selection, and review. */
  readonly readOnly?: boolean;
  /** Adds consumer-owned selected-file preview content; omission removes the preview surface. */
  readonly renderPreview?: (file: FileManagerFile) => ReactNode;
  /** Controlled selected file identifier or null; use with its change callback. */
  readonly selectedFileId?: string | null;
  /** Adds local/remote conflict comparison and supported resolution actions. */
  readonly showConflictGuidance?: boolean;
  /** Adds capacity and usage context when the snapshot provides it; false removes the summary. */
  readonly showStorageContext?: boolean;
  /** Controlled grid or list presentation; use with `onViewChange`. */
  readonly view?: FileManagerView;
  /** Enables bounded file rendering; false renders every matching file without virtual semantics. */
  readonly virtualWindow?: false | FileManagerVirtualWindow;
}

function folderItems(
  folders: readonly FileManagerFolder[],
  disabled: boolean,
): readonly TreeViewItem[] {
  return folders.map((folder) => ({
    ...(folder.children === undefined ? {} : { children: folderItems(folder.children, disabled) }),
    disabled,
    id: folder.id,
    label: folder.label,
    textValue: folder.label,
  }));
}

function flattenFolders(folders: readonly FileManagerFolder[]): readonly FileManagerFolder[] {
  return folders.flatMap((folder) => [
    folder,
    ...(folder.children === undefined ? [] : flattenFolders(folder.children)),
  ]);
}

function formatBytes(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    style: "unit",
    unit: value >= 1_048_576 ? "megabyte" : "kilobyte",
    unitDisplay: "short",
  }).format(value / (value >= 1_048_576 ? 1_048_576 : 1024));
}

function assertVirtualWindow(
  virtualWindow: false | FileManagerVirtualWindow,
  length: number,
): void {
  if (virtualWindow === false) return;
  if (
    !Number.isSafeInteger(virtualWindow.startIndex) ||
    virtualWindow.startIndex < 0 ||
    !Number.isSafeInteger(virtualWindow.windowSize) ||
    virtualWindow.windowSize < 1 ||
    (length > 0 && virtualWindow.startIndex >= length)
  ) {
    throw new RangeError("Mergora FileManager virtualWindow requires a bounded start and size.");
  }
}

export const FileManager = forwardRef<HTMLDivElement, FileManagerProps>(function FileManager(
  {
    adapter,
    announceOperations = false,
    className,
    defaultFolderId,
    defaultSelectedFileId,
    defaultView = "list",
    disabled = false,
    enableRecoveryActions = false,
    folderId,
    initialSnapshot,
    label = "File manager",
    offline = false,
    onFolderIdChange,
    onSelectedFileIdChange,
    onViewChange,
    readOnly = false,
    renderPreview,
    selectedFileId,
    showConflictGuidance = false,
    showStorageContext = false,
    view,
    virtualWindow = false,
    ...props
  },
  ref,
) {
  if (view !== undefined && defaultView !== "list") {
    throw new Error("Mergora FileManager controlled view cannot be combined with defaultView.");
  }
  if (folderId !== undefined && defaultFolderId !== undefined) {
    throw new Error(
      "Mergora FileManager controlled folderId cannot be combined with defaultFolderId.",
    );
  }
  if (selectedFileId !== undefined && defaultSelectedFileId !== undefined) {
    throw new Error(
      "Mergora FileManager controlled selectedFileId cannot be combined with defaultSelectedFileId.",
    );
  }
  const manager = useFileManager({
    adapter,
    ...(initialSnapshot === undefined ? {} : { initialSnapshot }),
    offline,
  });
  const instanceId = `mrg-file-manager-${useId().replaceAll(":", "")}`;
  const [localView, setLocalView] = useState(defaultView);
  const [localFolderId, setLocalFolderId] = useState(defaultFolderId);
  const [localSelectedFileId, setLocalSelectedFileId] = useState<string | null>(
    defaultSelectedFileId ?? null,
  );
  const [renaming, setRenaming] = useState(false);
  const resolvedView = view ?? localView;
  const folders = useMemo(
    () => flattenFolders(manager.snapshot?.folders ?? []),
    [manager.snapshot?.folders],
  );
  const resolvedFolderId = folderId ?? localFolderId ?? folders[0]?.id;
  const resolvedSelectedFileId = selectedFileId ?? localSelectedFileId;
  const files = useMemo(
    () =>
      (manager.snapshot?.files ?? []).filter(
        (file) => resolvedFolderId === undefined || file.folderId === resolvedFolderId,
      ),
    [manager.snapshot?.files, resolvedFolderId],
  );
  assertVirtualWindow(virtualWindow, files.length);
  const visibleFiles =
    virtualWindow === false
      ? files
      : files.slice(virtualWindow.startIndex, virtualWindow.startIndex + virtualWindow.windowSize);
  const selectedFile = manager.snapshot?.files.find((file) => file.id === resolvedSelectedFileId);
  const busy = manager.operationState === "pending";

  useEffect(() => {
    if (resolvedFolderId !== undefined || folders[0] === undefined) return;
    setLocalFolderId(folders[0].id);
  }, [folders, resolvedFolderId]);
  useEffect(() => {
    if (resolvedSelectedFileId === null || resolvedSelectedFileId === undefined) return;
    if (manager.snapshot?.files.some((file) => file.id === resolvedSelectedFileId)) return;
    if (selectedFileId === undefined) setLocalSelectedFileId(null);
    onSelectedFileIdChange?.(null);
  }, [manager.snapshot?.files, onSelectedFileIdChange, resolvedSelectedFileId, selectedFileId]);

  const setFolder = (next: string): void => {
    if (disabled) return;
    if (folderId === undefined) setLocalFolderId(next);
    onFolderIdChange?.(next);
    if (selectedFileId === undefined) setLocalSelectedFileId(null);
    onSelectedFileIdChange?.(null);
  };
  const setSelectedFile = (next: string): void => {
    if (disabled) return;
    if (selectedFileId === undefined) setLocalSelectedFileId(next);
    onSelectedFileIdChange?.(next);
    setRenaming(false);
  };
  const setView = (next: FileManagerView): void => {
    if (disabled) return;
    if (view === undefined) setLocalView(next);
    onViewChange?.(next);
  };

  if (manager.snapshot === null) {
    return (
      <div
        {...props}
        aria-busy={manager.state === "loading" || undefined}
        className={className === undefined ? "mrg-file-manager" : `mrg-file-manager ${className}`}
        data-slot="file-manager"
        ref={ref}
      >
        <h1>{label}</h1>
        {manager.state === "loading" ? <p role="status">Loading files…</p> : null}
        {manager.state === "offline" ? (
          <div role="alert">Files are unavailable while this workspace is offline.</div>
        ) : null}
        {manager.state === "error" ? (
          <div role="alert">
            <p>{manager.error}</p>
            <Button onClick={() => void manager.reload()} variant="secondary">
              Retry loading
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const currentFolder = folders.find((folder) => folder.id === resolvedFolderId);
  const canManageSelected =
    selectedFile !== undefined &&
    selectedFile.permission !== "read-only" &&
    !disabled &&
    !readOnly &&
    !offline &&
    manager.state !== "offline";

  return (
    <div
      {...props}
      aria-busy={busy || undefined}
      className={className === undefined ? "mrg-file-manager" : `mrg-file-manager ${className}`}
      data-offline={manager.state === "offline" || undefined}
      data-slot="file-manager"
      ref={ref}
    >
      <header data-slot="file-manager-header">
        <div>
          <h1>{label}</h1>
          <p>Browse, inspect, and recover workspace files without hidden storage behavior.</p>
        </div>
        <div aria-label="File presentation" data-slot="file-manager-view" role="group">
          <Button
            aria-pressed={resolvedView === "list"}
            disabled={disabled}
            onClick={() => setView("list")}
            variant="secondary"
          >
            List
          </Button>
          <Button
            aria-pressed={resolvedView === "grid"}
            disabled={disabled}
            onClick={() => setView("grid")}
            variant="secondary"
          >
            Grid
          </Button>
        </div>
      </header>

      {manager.state === "offline" ? (
        <div data-slot="file-manager-offline" role="alert">
          Offline: cached file details remain visible. Mutations are unavailable.
        </div>
      ) : null}
      {manager.operationState === "error" ? (
        <div data-slot="file-manager-error" role="alert">
          {manager.operationError}
        </div>
      ) : null}

      <aside aria-labelledby={`${instanceId}-folders-heading`} data-slot="file-manager-folders">
        <h2 id={`${instanceId}-folders-heading`}>Folders</h2>
        {manager.snapshot.folders.length === 0 ? (
          <p>No folders are available.</p>
        ) : (
          <TreeView
            defaultExpandedIds={manager.snapshot.folders.map((folder) => folder.id)}
            direction={props.dir === "rtl" ? "rtl" : "ltr"}
            items={folderItems(manager.snapshot.folders, disabled)}
            label="Folders"
            onSelectedIdsChange={(ids) => {
              const next = ids[0];
              if (next !== undefined) setFolder(next);
            }}
            selectedIds={resolvedFolderId === undefined ? [] : [resolvedFolderId]}
          />
        )}
      </aside>

      <main data-slot="file-manager-content">
        <section aria-labelledby={`${instanceId}-files-heading`} data-slot="file-manager-files">
          <div data-slot="file-manager-section-heading">
            <div>
              <h2 id={`${instanceId}-files-heading`}>{currentFolder?.label ?? "Files"}</h2>
              <p>{files.length} items</p>
            </div>
          </div>
          {files.length === 0 ? (
            <div data-slot="file-manager-empty">
              <h3>This folder is empty</h3>
              <p>Choose another folder or connect a consumer-owned upload flow.</p>
            </div>
          ) : (
            <ul data-slot="file-manager-file-list" data-view={resolvedView}>
              {visibleFiles.map((file, index) => (
                <li
                  aria-posinset={
                    virtualWindow === false ? undefined : virtualWindow.startIndex + index + 1
                  }
                  aria-setsize={virtualWindow === false ? undefined : files.length}
                  data-status={file.status ?? "available"}
                  key={file.id}
                >
                  <button
                    aria-pressed={file.id === resolvedSelectedFileId}
                    disabled={disabled}
                    onClick={() => setSelectedFile(file.id)}
                    type="button"
                  >
                    <span aria-hidden="true" data-slot="file-manager-file-mark">
                      {file.mimeType.startsWith("image/") ? "IMG" : "DOC"}
                    </span>
                    <span data-slot="file-manager-file-copy">
                      <strong>{file.name}</strong>
                      <span>
                        {formatBytes(file.size)} · {file.status ?? "available"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selectedFile === undefined ? null : (
          <aside aria-label="File preview" data-slot="file-manager-preview">
            <div data-slot="file-manager-section-heading">
              <div>
                <h2>{selectedFile.name}</h2>
                <p>{selectedFile.mimeType}</p>
              </div>
              <span data-status={selectedFile.status}>{selectedFile.status ?? "available"}</span>
            </div>
            <div data-slot="file-manager-preview-content">
              {renderPreview?.(selectedFile) ?? (
                <dl>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytes(selectedFile.size)}</dd>
                  </div>
                  <div>
                    <dt>Last modified</dt>
                    <dd>
                      <time dateTime={selectedFile.modifiedAt}>
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(selectedFile.modifiedAt))}
                      </time>
                    </dd>
                  </div>
                </dl>
              )}
            </div>
            {canManageSelected ? (
              <div data-slot="file-manager-actions">
                <Button onClick={() => setRenaming(true)} variant="secondary">
                  Rename
                </Button>
                {enableRecoveryActions ? (
                  <Button
                    onClick={() => void manager.moveToRecovery(selectedFile.id)}
                    variant="destructive"
                  >
                    Move to recovery
                  </Button>
                ) : null}
              </div>
            ) : null}
            {renaming && canManageSelected ? (
              <form
                data-slot="file-manager-rename"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const nextName = new FormData(event.currentTarget).get("fileName");
                  if (typeof nextName !== "string") return;
                  void manager.rename(selectedFile.id, nextName).then((result) => {
                    if (result !== null) setRenaming(false);
                  });
                }}
              >
                <label htmlFor={`${instanceId}-name`}>File name</label>
                <input
                  autoComplete="off"
                  defaultValue={selectedFile.name}
                  id={`${instanceId}-name`}
                  maxLength={255}
                  name="fileName"
                  required
                />
                <Button pending={busy} pendingLabel="Renaming" type="submit">
                  Save name
                </Button>
                <Button onClick={() => setRenaming(false)} type="button" variant="quiet">
                  Cancel
                </Button>
              </form>
            ) : null}
            {canManageSelected && folders.length > 1 ? (
              <form
                data-slot="file-manager-move"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const target = new FormData(event.currentTarget).get("targetFolder");
                  if (typeof target === "string") void manager.move(selectedFile.id, target);
                }}
              >
                <label htmlFor={`${instanceId}-target`}>Move to folder</label>
                <select
                  defaultValue={selectedFile.folderId}
                  id={`${instanceId}-target`}
                  name="targetFolder"
                >
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.label}
                    </option>
                  ))}
                </select>
                <Button pending={busy} pendingLabel="Moving" type="submit" variant="secondary">
                  Move file
                </Button>
              </form>
            ) : null}
          </aside>
        )}

        {manager.snapshot.uploads.length === 0 ? null : (
          <section aria-labelledby={`${instanceId}-uploads`} data-slot="file-manager-uploads">
            <h2 id={`${instanceId}-uploads`}>Upload queue</h2>
            {manager.snapshot.uploads.map((upload) => (
              <div key={upload.id}>
                <UploadProgress
                  announceProgress={announceOperations}
                  label={upload.name}
                  {...(upload.error === undefined ? {} : { message: upload.error })}
                  status={upload.status}
                  totalBytes={upload.totalBytes}
                  uploadedBytes={upload.uploadedBytes}
                  {...(upload.progress === undefined ? {} : { value: upload.progress })}
                />
                <div data-slot="file-manager-actions">
                  {adapter.cancelUpload === undefined || upload.status !== "uploading" ? null : (
                    <Button
                      disabled={disabled || readOnly || offline}
                      onClick={() => void manager.cancelUpload(upload.id)}
                      variant="quiet"
                    >
                      Cancel upload
                    </Button>
                  )}
                  {adapter.retryUpload === undefined || upload.status !== "error" ? null : (
                    <Button
                      disabled={disabled || readOnly || offline}
                      onClick={() => void manager.retryUpload(upload.id)}
                      variant="secondary"
                    >
                      Retry upload
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {showConflictGuidance && manager.snapshot.conflicts.length > 0 ? (
          <section aria-labelledby={`${instanceId}-conflicts`} data-slot="file-manager-conflicts">
            <h2 id={`${instanceId}-conflicts`}>Version conflicts</h2>
            {manager.snapshot.conflicts.map((conflict) => (
              <article key={conflict.id}>
                <h3>{conflict.summary}</h3>
                <dl>
                  <div>
                    <dt>Local copy</dt>
                    <dd>{conflict.localDescription}</dd>
                  </div>
                  <div>
                    <dt>Remote copy</dt>
                    <dd>{conflict.remoteDescription}</dd>
                  </div>
                </dl>
                {adapter.resolveConflict === undefined ? null : (
                  <div data-slot="file-manager-actions">
                    <Button
                      disabled={disabled || readOnly || offline}
                      onClick={() => void manager.resolveConflict(conflict.id, "keep-local")}
                      variant="secondary"
                    >
                      Keep local copy
                    </Button>
                    <Button
                      disabled={disabled || readOnly || offline}
                      onClick={() => void manager.resolveConflict(conflict.id, "keep-remote")}
                      variant="secondary"
                    >
                      Keep remote copy
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </section>
        ) : null}

        {showStorageContext && manager.snapshot.storage !== undefined ? (
          <aside aria-labelledby={`${instanceId}-storage-heading`} data-slot="file-manager-storage">
            <h2 id={`${instanceId}-storage-heading`}>Storage</h2>
            <meter
              max={manager.snapshot.storage.totalBytes}
              value={manager.snapshot.storage.usedBytes}
            >
              {Math.round(
                (manager.snapshot.storage.usedBytes / manager.snapshot.storage.totalBytes) * 100,
              )}
              % used
            </meter>
            <p>
              {formatBytes(manager.snapshot.storage.usedBytes)} of{" "}
              {formatBytes(manager.snapshot.storage.totalBytes)} used
            </p>
          </aside>
        ) : null}

        {enableRecoveryActions && manager.lastRecovery !== null ? (
          <aside data-slot="file-manager-recovery" role="status">
            <span>{manager.lastRecovery.file.name} moved to recovery.</span>
            <Button
              disabled={disabled || readOnly || offline || manager.state === "offline" || busy}
              onClick={() => void manager.restore()}
              variant="secondary"
            >
              Undo
            </Button>
          </aside>
        ) : null}
        {announceOperations ? (
          <output aria-live="polite" data-slot="file-manager-announcer">
            {manager.operationState === "pending"
              ? "File operation in progress."
              : manager.operationState === "success"
                ? "File operation completed."
                : ""}
          </output>
        ) : null}
      </main>
    </div>
  );
});

FileManager.displayName = "FileManager";
export const FileManagerPage = FileManager;
