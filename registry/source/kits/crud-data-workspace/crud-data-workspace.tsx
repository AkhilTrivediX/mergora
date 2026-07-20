"use client";

import "./crud-data-workspace.css";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
} from "react";

import { Alert } from "../../components/alert/alert.js";
import { Badge } from "../../components/badge/badge.js";
import { Button } from "../../components/button/button.js";
import {
  DataTable,
  normalizeDataTableQuery,
  type DataTableColumn,
  type DataTableQuery,
} from "../../components/data-table/data-table.js";
import { Dialog } from "../../components/dialog/dialog.js";
import { Skeleton } from "../../components/skeleton/skeleton.js";
import type {
  CrudDataRecord,
  CrudDataRecordInput,
  CrudDataRecordStatus,
  CrudDataWorkspaceAdapter,
} from "./crud-data-workspace-adapter.js";
import { useCrudDataWorkspace } from "./crud-data-workspace-state.js";

export interface CrudDataWorkspaceProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onChange" | "role"
> {
  /** Consumer adapter that owns record data, authorization, persistence, and recovery. */
  readonly adapter: CrudDataWorkspaceAdapter;
  /** Adds selection and bulk status controls when permitted; false removes their UI and events. */
  readonly bulkActions?: boolean;
  /** Adds deleted-record restoration when supported; false removes undo state and actions. */
  readonly enableUndo?: boolean;
  /** Prevents adapter requests and presents explicit offline recovery context. */
  readonly offline?: boolean;
  /** Applies reversible local mutation previews; false waits for canonical adapter results. */
  readonly optimisticMutations?: boolean;
  /** Adds saved-view selection and authoring when supported; false removes that surface. */
  readonly savedViews?: boolean;
  /** Adds visible recent mutation feedback; false removes the timeline output. */
  readonly showMutationTimeline?: boolean;
}

interface RecordDraft {
  readonly category: string;
  readonly name: string;
  readonly status: CrudDataRecordStatus;
}

const EMPTY_DRAFT: RecordDraft = { category: "Component", name: "", status: "draft" };

function statusVariant(status: CrudDataRecordStatus): "info" | "neutral" | "success" {
  return status === "active" ? "success" : status === "archived" ? "neutral" : "info";
}

export function CrudDataWorkspace({
  "aria-label": ariaLabel = "Records workspace",
  adapter,
  bulkActions = false,
  className,
  enableUndo = false,
  offline = false,
  optimisticMutations = false,
  savedViews = false,
  showMutationTimeline = false,
  ...props
}: CrudDataWorkspaceProps) {
  const workspace = useCrudDataWorkspace({ adapter, offline, optimisticMutations });
  const [query, setQuery] = useState<DataTableQuery>(() => normalizeDataTableQuery());
  const [category, setCategory] = useState("all");
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecordDraft>(EMPTY_DRAFT);
  const [validationError, setValidationError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<CrudDataRecord | null>(null);
  const [viewName, setViewName] = useState("");
  const deleteOpenerRef = useRef<HTMLButtonElement | null>(null);
  const editorOpenerRef = useRef<HTMLElement | null>(null);
  const keepRecordRef = useRef<HTMLButtonElement | null>(null);
  const instanceId = `mrg-crud-workspace-${useId().replaceAll(":", "")}`;
  const snapshot = workspace.snapshot;
  const categories = useMemo(
    () => [...new Set(snapshot?.records.map((record) => record.category) ?? [])].sort(),
    [snapshot],
  );
  const visibleRecords = useMemo(
    () =>
      snapshot?.records.filter((record) => category === "all" || record.category === category) ??
      [],
    [category, snapshot],
  );

  useEffect(() => {
    if (pendingDelete === null) return;
    keepRecordRef.current?.focus({ preventScroll: true });
  }, [pendingDelete]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setValidationError("");
    setEditorOpen(true);
  };
  const openEdit = (record: CrudDataRecord) => {
    setEditingId(record.id);
    setDraft({ category: record.category, name: record.name, status: record.status });
    setValidationError("");
    setEditorOpen(true);
  };
  const resetEditor = () => {
    const record = snapshot?.records.find((item) => item.id === editingId);
    setDraft(
      record === undefined
        ? EMPTY_DRAFT
        : { category: record.category, name: record.name, status: record.status },
    );
    setValidationError("");
  };
  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.name.trim() === "" || draft.category.trim() === "") {
      setValidationError("Enter a record name and category before saving.");
      return;
    }
    const input: CrudDataRecordInput = {
      category: draft.category.trim(),
      name: draft.name.trim(),
      status: draft.status,
    };
    if (editingId === null) void workspace.createRecord(input);
    else void workspace.updateRecord(editingId, input);
    setEditorOpen(false);
  };

  const columns = useMemo<readonly DataTableColumn<CrudDataRecord>[]>(
    () => [
      {
        cell: (record) => record.name,
        filterValue: (record) => `${record.name} ${record.category} ${record.status}`,
        header: "Name",
        id: "name",
        sortable: true,
        sortValue: (record) => record.name,
      },
      {
        cell: (record) => record.category,
        filterValue: (record) => record.category,
        header: "Category",
        id: "category",
        sortable: true,
        sortValue: (record) => record.category,
      },
      {
        cell: (record) => (
          <Badge kind="status" variant={statusVariant(record.status)}>
            {record.status}
          </Badge>
        ),
        filterValue: (record) => record.status,
        header: "Status",
        id: "status",
        sortable: true,
        sortValue: (record) => record.status,
      },
      {
        align: "end",
        cell: (record) => (
          <span className="mrg-crud-data-workspace__row-actions">
            {snapshot?.permissions.canUpdate ? (
              <Button
                onClick={(event) => {
                  editorOpenerRef.current = event.currentTarget;
                  openEdit(record);
                }}
                size="small"
                variant="quiet"
              >
                Edit {record.name}
              </Button>
            ) : null}
            {snapshot?.permissions.canDelete ? (
              <Button
                onClick={(event) => {
                  deleteOpenerRef.current = event.currentTarget;
                  setPendingDelete(record);
                }}
                size="small"
                variant="quiet"
              >
                Delete {record.name}
              </Button>
            ) : null}
          </span>
        ),
        header: "Actions",
        id: "actions",
      },
    ],
    [snapshot?.permissions.canDelete, snapshot?.permissions.canUpdate],
  );

  return (
    <div
      {...props}
      aria-label={ariaLabel}
      className={
        className === undefined ? "mrg-crud-data-workspace" : `mrg-crud-data-workspace ${className}`
      }
      data-slot="crud-data-workspace"
      role="region"
    >
      <div data-slot="crud-data-workspace-heading">
        <div>
          <h1>Records workspace</h1>
          <p>Search, filter, review, and change adapter-owned records with explicit recovery.</p>
        </div>
        {snapshot?.permissions.canCreate ? (
          <>
            <Button
              onClick={(event) => {
                editorOpenerRef.current = event.currentTarget;
                openCreate();
              }}
            >
              Create record
            </Button>
            <Dialog.Root
              finalFocusRef={editorOpenerRef}
              onOpenChange={(nextOpen) => {
                setEditorOpen(nextOpen);
                if (!nextOpen) setValidationError("");
              }}
              open={editorOpen}
            >
              <Dialog.Overlay>
                <Dialog.Content>
                  <Dialog.Header>
                    <Dialog.Title>
                      {editingId === null ? "Create record" : "Edit record"}
                    </Dialog.Title>
                    <Dialog.Description>
                      Changes are sent through the consumer adapter after local validation.
                    </Dialog.Description>
                  </Dialog.Header>
                  <form id={`${instanceId}-editor`} onReset={resetEditor} onSubmit={submitEditor}>
                    <label htmlFor={`${instanceId}-name`}>Name</label>
                    <input
                      aria-describedby={
                        validationError === "" ? undefined : `${instanceId}-editor-error`
                      }
                      aria-invalid={validationError === "" ? undefined : true}
                      autoComplete="off"
                      id={`${instanceId}-name`}
                      name="name"
                      onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
                      value={draft.name}
                    />
                    <label htmlFor={`${instanceId}-category`}>Category</label>
                    <input
                      aria-describedby={
                        validationError === "" ? undefined : `${instanceId}-editor-error`
                      }
                      aria-invalid={validationError === "" ? undefined : true}
                      autoComplete="off"
                      id={`${instanceId}-category`}
                      name="category"
                      onChange={(event) =>
                        setDraft({ ...draft, category: event.currentTarget.value })
                      }
                      value={draft.category}
                    />
                    <label htmlFor={`${instanceId}-status`}>Status</label>
                    <select
                      id={`${instanceId}-status`}
                      name="status"
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          status: event.currentTarget.value as CrudDataRecordStatus,
                        })
                      }
                      value={draft.status}
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                    {validationError === "" ? null : (
                      <p id={`${instanceId}-editor-error`} role="alert">
                        {validationError}
                      </p>
                    )}
                  </form>
                  <Dialog.Footer>
                    <Button form={`${instanceId}-editor`} type="reset" variant="secondary">
                      Reset fields
                    </Button>
                    <Dialog.Close>Cancel</Dialog.Close>
                    <Button
                      form={`${instanceId}-editor`}
                      pending={workspace.mutationState === "pending"}
                      type="submit"
                    >
                      Save record
                    </Button>
                  </Dialog.Footer>
                </Dialog.Content>
              </Dialog.Overlay>
            </Dialog.Root>
          </>
        ) : null}
      </div>

      {workspace.state === "loading" ? (
        <div
          aria-busy="true"
          aria-label="Loading records"
          data-slot="crud-data-workspace-loading"
          role="status"
        >
          <Skeleton blockSize={40} />
          <Skeleton blockSize={180} />
          <span>Loading records…</span>
        </div>
      ) : null}
      {workspace.state === "error" && workspace.mutationState !== "error" ? (
        <Alert
          actions={<Button onClick={() => void workspace.reload()}>Retry records</Button>}
          description={workspace.error || "The records could not be loaded."}
          title="Records unavailable"
          variant="error"
        />
      ) : null}
      {workspace.state === "offline" ? (
        <Alert
          description="Reconnect before changing records. Network, storage, authorization, and conflict policy remain consumer-owned."
          title="Records are offline"
          variant="warning"
        />
      ) : null}
      {workspace.mutationState === "error" ? (
        <Alert
          actions={<Button onClick={workspace.clearError}>Dismiss error</Button>}
          description={`${workspace.error} ${optimisticMutations ? "The optimistic change was rolled back." : "No local change was applied."}`}
          title="Change not saved"
          variant="error"
        />
      ) : null}
      {workspace.mutationState === "pending" ? (
        <Alert
          actions={<Button onClick={workspace.cancelMutation}>Cancel change</Button>}
          description="The consumer adapter is processing the requested change."
          title="Saving change"
          variant="info"
        />
      ) : null}
      {showMutationTimeline && workspace.lastOperation !== "" ? (
        <output aria-live="polite" data-slot="crud-data-workspace-mutation-timeline">
          {workspace.lastOperation}
        </output>
      ) : null}
      {enableUndo && workspace.lastDeleted !== null && adapter.restore !== undefined ? (
        <Alert
          actions={<Button onClick={() => void workspace.restoreDeleted()}>Undo delete</Button>}
          description={`${workspace.lastDeleted.name} was removed through the consumer adapter.`}
          title="Record deleted"
          variant="info"
        />
      ) : null}
      {pendingDelete === null ? null : (
        <Alert
          actions={
            <span className="mrg-crud-data-workspace__confirm-actions">
              <Button
                ref={keepRecordRef}
                onClick={() => {
                  setPendingDelete(null);
                  queueMicrotask(() => deleteOpenerRef.current?.focus({ preventScroll: true }));
                }}
                variant="secondary"
              >
                Keep record
              </Button>
              <Button
                onClick={() => {
                  void workspace.deleteRecord(pendingDelete.id);
                  setPendingDelete(null);
                }}
                variant="destructive"
              >
                Confirm delete
              </Button>
            </span>
          }
          description={`This removes ${pendingDelete.name}. The adapter decides retention and authorization.`}
          title="Confirm record deletion"
          variant="warning"
        />
      )}

      {snapshot === null ? null : (
        <>
          <section aria-label="Record filters" data-slot="crud-data-workspace-tools">
            <label htmlFor={`${instanceId}-category-filter`}>Category</label>
            <select
              id={`${instanceId}-category-filter`}
              onChange={(event) => setCategory(event.currentTarget.value)}
              value={category}
            >
              <option value="all">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {savedViews ? (
              <>
                <label htmlFor={`${instanceId}-saved-view`}>Saved view</label>
                <select
                  defaultValue=""
                  id={`${instanceId}-saved-view`}
                  onChange={(event) => {
                    const view = snapshot.savedViews.find(
                      (item) => item.id === event.currentTarget.value,
                    );
                    if (view === undefined) return;
                    setCategory(view.category ?? "all");
                    setQuery(normalizeDataTableQuery({ search: view.search ?? "" }));
                  }}
                >
                  <option value="">Choose a view</option>
                  {snapshot.savedViews.map((view) => (
                    <option key={view.id} value={view.id}>
                      {view.label}
                    </option>
                  ))}
                </select>
                {adapter.saveView === undefined ? null : (
                  <span data-slot="crud-data-workspace-save-view">
                    <label htmlFor={`${instanceId}-view-name`}>New view name</label>
                    <input
                      id={`${instanceId}-view-name`}
                      onChange={(event) => setViewName(event.currentTarget.value)}
                      value={viewName}
                    />
                    <Button
                      disabled={viewName.trim() === ""}
                      onClick={() => {
                        void workspace.saveView(viewName, query.search, category);
                        setViewName("");
                      }}
                      variant="secondary"
                    >
                      Save current view
                    </Button>
                  </span>
                )}
              </>
            ) : null}
          </section>
          {bulkActions && snapshot.permissions.canBulkUpdate && adapter.bulkUpdate !== undefined ? (
            <section aria-label="Bulk record actions" data-slot="crud-data-workspace-bulk-actions">
              <span>{selectedIds.length} selected</span>
              <Button
                disabled={selectedIds.length === 0}
                onClick={() => void workspace.bulkSetStatus(selectedIds, "archived")}
                variant="secondary"
              >
                Archive selected
              </Button>
              <Button
                disabled={selectedIds.length === 0}
                onClick={() => setSelectedIds([])}
                variant="quiet"
              >
                Clear selection
              </Button>
            </section>
          ) : null}
          <DataTable
            caption="Workspace records"
            columns={columns}
            emptyContent="No records match the current search and category."
            getRowId={(record) => record.id}
            onQueryChange={setQuery}
            onSelectedRowIdsChange={setSelectedIds}
            paginated
            query={query}
            rows={visibleRecords}
            searchable
            selectable={
              bulkActions && snapshot.permissions.canBulkUpdate && adapter.bulkUpdate !== undefined
            }
            selectedRowIds={selectedIds}
            showQuerySummary
          />
          {!snapshot.permissions.canCreate &&
          !snapshot.permissions.canUpdate &&
          !snapshot.permissions.canDelete ? (
            <p data-slot="crud-data-workspace-permission-note">
              Read-only access. The consumer adapter remains the authorization source of truth.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export const CrudDataWorkspacePage = CrudDataWorkspace;
