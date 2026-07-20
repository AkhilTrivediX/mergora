export type CrudDataRecordStatus = "active" | "archived" | "draft";

export interface CrudDataRecord {
  /** Human-readable category used for filtering and editing. */
  readonly category: string;
  /** Stable unique record identifier used for selection and mutations. */
  readonly id: string;
  /** Required human-readable record name. */
  readonly name: string;
  /** Record lifecycle used for filtering, bulk updates, and status treatment. */
  readonly status: CrudDataRecordStatus;
  /** ISO-compatible mutation instant used for localized display and sorting. */
  readonly updatedAt: string;
}

export interface CrudDataRecordInput {
  /** Required human-readable category for a created or updated record. */
  readonly category: string;
  /** Required human-readable name for a created or updated record. */
  readonly name: string;
  /** Desired lifecycle for a created or updated record. */
  readonly status: CrudDataRecordStatus;
}

export interface CrudDataPermissions {
  /** Whether bulk mutation controls may be exposed and executed. */
  readonly canBulkUpdate: boolean;
  /** Whether record creation controls may be exposed and executed. */
  readonly canCreate: boolean;
  /** Whether destructive record actions may be exposed and executed. */
  readonly canDelete: boolean;
  /** Whether record editing controls may be exposed and executed. */
  readonly canUpdate: boolean;
}

export interface CrudDataSavedView {
  /** Optional category filter restored by this saved view. */
  readonly category?: string;
  /** Stable unique view identifier used for selection and replacement. */
  readonly id: string;
  /** Human-readable saved-view label. */
  readonly label: string;
  /** Optional search query restored by this saved view. */
  readonly search?: string;
}

export interface CrudDataWorkspaceSnapshot {
  /** Authorization snapshot controlling which mutation surfaces are available. */
  readonly permissions: CrudDataPermissions;
  /** Immutable records available to the workspace table. */
  readonly records: readonly CrudDataRecord[];
  /** Immutable consumer-owned saved query and category views. */
  readonly savedViews: readonly CrudDataSavedView[];
}

export interface CrudDataWorkspaceAdapter {
  /** Optionally applies a patch to many records; omission cleanly removes bulk mutation behavior. */
  readonly bulkUpdate?: (
    recordIds: readonly string[],
    patch: Partial<CrudDataRecordInput>,
    signal: AbortSignal,
  ) => Promise<readonly CrudDataRecord[]>;
  /** Creates a record and returns its canonical server-owned representation. */
  readonly create: (input: CrudDataRecordInput, signal: AbortSignal) => Promise<CrudDataRecord>;
  /** Permanently deletes one record through the consumer service. */
  readonly delete: (recordId: string, signal: AbortSignal) => Promise<void>;
  /** Loads the current immutable records, permissions, and saved views. */
  readonly load: (signal: AbortSignal) => Promise<CrudDataWorkspaceSnapshot>;
  /** Optionally restores a deleted record; omission cleanly removes undo behavior. */
  readonly restore?: (record: CrudDataRecord, signal: AbortSignal) => Promise<CrudDataRecord>;
  /** Optionally persists a saved view; omission cleanly removes saved-view authoring. */
  readonly saveView?: (view: CrudDataSavedView, signal: AbortSignal) => Promise<void>;
  /** Updates one record and returns its canonical server-owned representation. */
  readonly update: (
    recordId: string,
    input: CrudDataRecordInput,
    signal: AbortSignal,
  ) => Promise<CrudDataRecord>;
}

const FIXTURE_TIMES = {
  current: "1970-01-01T00:00:00.000Z",
  older: "1969-12-30T01:45:00.000Z",
  prior: "1969-12-31T05:30:00.000Z",
} as const;

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
}

export function createDeterministicCrudDataWorkspaceAdapter(): CrudDataWorkspaceAdapter {
  let records: CrudDataRecord[] = [
    {
      category: "Documentation",
      id: "record-guidance",
      name: "Keyboard guidance",
      status: "active",
      updatedAt: FIXTURE_TIMES.current,
    },
    {
      category: "Component",
      id: "record-selector",
      name: "Locale selector",
      status: "draft",
      updatedAt: FIXTURE_TIMES.prior,
    },
    {
      category: "Evidence",
      id: "record-touch",
      name: "Touch interaction record",
      status: "active",
      updatedAt: FIXTURE_TIMES.older,
    },
  ];
  let sequence = records.length;
  return {
    async bulkUpdate(recordIds, patch, signal) {
      abortIfNeeded(signal);
      const ids = new Set(recordIds);
      records = records.map((record) =>
        ids.has(record.id) ? { ...record, ...patch, updatedAt: FIXTURE_TIMES.current } : record,
      );
      return records.filter((record) => ids.has(record.id));
    },
    async create(input, signal) {
      abortIfNeeded(signal);
      sequence += 1;
      const record: CrudDataRecord = {
        ...input,
        id: `record-${sequence}`,
        updatedAt: FIXTURE_TIMES.current,
      };
      records = [...records, record];
      return record;
    },
    async delete(recordId, signal) {
      abortIfNeeded(signal);
      records = records.filter((record) => record.id !== recordId);
    },
    async load(signal) {
      abortIfNeeded(signal);
      return {
        permissions: {
          canBulkUpdate: true,
          canCreate: true,
          canDelete: true,
          canUpdate: true,
        },
        records,
        savedViews: [
          { id: "view-active", label: "Active records", search: "active" },
          { category: "Evidence", id: "view-evidence", label: "Evidence only" },
        ],
      };
    },
    async restore(record, signal) {
      abortIfNeeded(signal);
      records = [...records.filter((item) => item.id !== record.id), record];
      return record;
    },
    async saveView(_view, signal) {
      abortIfNeeded(signal);
    },
    async update(recordId, input, signal) {
      abortIfNeeded(signal);
      const updated: CrudDataRecord = {
        ...input,
        id: recordId,
        updatedAt: FIXTURE_TIMES.current,
      };
      records = records.map((record) => (record.id === recordId ? updated : record));
      return updated;
    },
  };
}
