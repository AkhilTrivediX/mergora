export {
  mergeCssDeclarationsThreeWay,
  type CssMergeConflict,
  type CssMergeResult,
  type CssMergeStatus,
} from "./css-merge.js";
export {
  createConflictBundle,
  type ConflictBundle,
  type ConflictBundleMetadata,
} from "./conflict-bundle.js";
export {
  mergeDtcgThreeWay,
  type DtcgAccessibilityIssue,
  type DtcgMergeOptions,
  type DtcgMergeResult,
} from "./dtcg-merge.js";
export { classifyBlr, type BlrClassification } from "./file-classifier.js";
export {
  mergeJsonThreeWay,
  type JsonMergeFormat,
  type JsonMergeOptions,
  type JsonMergeResult,
} from "./json-merge.js";
export { mergeKeepRegionsThreeWay, type KeepRegionMergeResult } from "./keep-region-merge.js";
export type {
  FileBytes,
  FileMergeResult,
  FileMergeStatus,
  SemanticConflict,
  SemanticConflictReason,
} from "./merge-model.js";
export { planExplicitMove, type MovePlan } from "./move-policy.js";
export { mergeFileThreeWay, type SemanticFileMergeInput } from "./semantic-sync.js";
export {
  mergePlainTextThreeWay,
  type TextMergeOptions,
  type TextMergeResult,
} from "./text-merge.js";
export {
  mergeStructuredSourceThreeWay,
  STRUCTURED_SOURCE_MEDIA_TYPES,
  type StructuredSourceKind,
  type StructuredSourceMergeOptions,
  type StructuredSourceMergeResult,
} from "./structured-source-merge.js";
