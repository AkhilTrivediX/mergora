export interface ManualEvidenceMatrixItemInput {
  readonly id: string;
  readonly displayName: string;
  readonly family: string;
  readonly layer?: string;
  readonly maturity?: { readonly target?: string };
}

export interface ManualEvidenceMatrixInput {
  readonly items: readonly ManualEvidenceMatrixItemInput[];
}

export interface ManualEvidencePreparationItem {
  readonly id: string;
  readonly displayName: string;
  readonly family: string;
  readonly layer: string | undefined;
  readonly targetMaturity: string;
  readonly status: "not-run";
  readonly reviewer: null;
  readonly environmentRecord: null;
  readonly taskRecord: null;
  readonly artifactReferences: readonly never[];
}

export interface ManualEvidencePreparation {
  readonly schemaVersion: 1;
  readonly artifactKind: "manual-evidence-preparation";
  readonly commit: string;
  readonly workingTreeState: "clean" | "dirty";
  readonly evidenceStatus: "not-run";
  readonly evidenceClaim: "none";
  readonly instructions: readonly string[];
  readonly items: readonly ManualEvidencePreparationItem[];
}

export function createManualEvidencePreparation(
  matrix: ManualEvidenceMatrixInput,
  commit: string,
  workingTreeState: "clean" | "dirty",
): ManualEvidencePreparation;

export function renderManualEvidenceChecklist(preparation: ManualEvidencePreparation): string;
