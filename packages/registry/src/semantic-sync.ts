import { mergeCssDeclarationsThreeWay } from "./css-merge.js";
import { mergeDtcgThreeWay } from "./dtcg-merge.js";
import { classifyBlr, classificationConflictResult } from "./file-classifier.js";
import { mergeJsonThreeWay } from "./json-merge.js";
import {
  conflictedFileMerge,
  semanticConflict,
  type FileBytes,
  type FileMergeResult,
  type SemanticConflict,
} from "./merge-model.js";
import { mergePlainTextThreeWay } from "./text-merge.js";
import {
  mergeStructuredSourceThreeWay,
  STRUCTURED_SOURCE_MEDIA_TYPES,
} from "./structured-source-merge.js";

export interface SemanticFileMergeInput {
  readonly mediaType: string;
  readonly base: FileBytes;
  readonly local: FileBytes;
  readonly remote: FileBytes;
  readonly maxFileBytes?: number;
}

const DEFAULT_MAX_FILE_BYTES = 2_097_152;
const JSON_MEDIA = new Set(["application/json", "text/json"]);
const JSONC_MEDIA = new Set(["application/jsonc", "text/jsonc"]);
const DTCG_MEDIA = new Set(["application/dtcg+json", "application/vnd.design-tokens+json"]);
const PLAIN_TEXT_MEDIA = new Set(["text/plain"]);

function isTextMedia(mediaType: string): boolean {
  return (
    mediaType === "text/css" ||
    JSON_MEDIA.has(mediaType) ||
    JSONC_MEDIA.has(mediaType) ||
    DTCG_MEDIA.has(mediaType) ||
    PLAIN_TEXT_MEDIA.has(mediaType) ||
    STRUCTURED_SOURCE_MEDIA_TYPES.has(mediaType) ||
    mediaType.startsWith("text/")
  );
}

function encode(value: string | null): FileBytes {
  return value === null ? null : new TextEncoder().encode(value);
}

function decode(label: string, value: FileBytes): string | SemanticConflict {
  if (value === null) {
    return semanticConflict(`$${label}`, "utf8-decode", `${label} unexpectedly has no bytes.`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value);
  } catch {
    return semanticConflict(`$${label}`, "utf8-decode", `${label} is not valid UTF-8 text.`);
  }
}

function adapterResult(input: {
  readonly status: "no-op" | "fast-forward" | "keep-local" | "semantic-merge" | "conflict";
  readonly content: string | null;
  readonly conflictContent?: string | null;
  readonly conflicts: readonly SemanticConflict[];
  readonly appliedRemoteKeys: readonly string[];
  readonly preservedLocalKeys: readonly string[];
}): FileMergeResult {
  return {
    status: input.status,
    proposed: input.status === "conflict" ? null : encode(input.content),
    conflictProposal: encode(input.conflictContent ?? null),
    conflicts: input.conflicts,
    appliedRemoteKeys: input.appliedRemoteKeys,
    preservedLocalKeys: input.preservedLocalKeys,
    tombstone: false,
  };
}

/**
 * Shared, side-effect-free Semantic Sync entry point. It performs raw B/L/R
 * classification first and dispatches only declared media types. Unsupported
 * structured text fails closed instead of falling through to a lossy merge.
 */
export function mergeFileThreeWay(input: SemanticFileMergeInput): FileMergeResult {
  const maxFileBytes = input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  for (const [label, bytes] of [
    ["base", input.base],
    ["local", input.local],
    ["remote", input.remote],
  ] as const) {
    if (bytes !== null && bytes.byteLength > maxFileBytes) {
      return conflictedFileMerge([
        semanticConflict(
          `$${label}`,
          "input-limit",
          `${label} exceeds the configured per-file merge byte limit.`,
        ),
      ]);
    }
  }

  const binary = !isTextMedia(input.mediaType);
  const classification = classifyBlr({
    base: input.base,
    local: input.local,
    remote: input.remote,
    binary,
  });
  if (classification.kind === "resolved") return classification.result;
  if (classification.kind === "conflict") return classificationConflictResult(classification);

  const base = decode("base", input.base);
  const local = decode("local", input.local);
  const remote = decode("remote", input.remote);
  if (typeof base !== "string" || typeof local !== "string" || typeof remote !== "string") {
    const decodeConflicts: SemanticConflict[] = [];
    if (typeof base !== "string") decodeConflicts.push(base);
    if (typeof local !== "string") decodeConflicts.push(local);
    if (typeof remote !== "string") decodeConflicts.push(remote);
    return conflictedFileMerge(decodeConflicts);
  }

  if (DTCG_MEDIA.has(input.mediaType)) {
    const result = mergeDtcgThreeWay({ base, local, remote }, { maxCharacters: maxFileBytes });
    return adapterResult(result);
  }
  if (JSON_MEDIA.has(input.mediaType) || JSONC_MEDIA.has(input.mediaType)) {
    const result = mergeJsonThreeWay(
      { base, local, remote },
      {
        format: JSONC_MEDIA.has(input.mediaType) ? "jsonc" : "json",
        maxCharacters: maxFileBytes,
      },
    );
    return adapterResult({
      ...result,
      appliedRemoteKeys: result.appliedRemotePointers,
      preservedLocalKeys: result.preservedLocalPointers,
    });
  }
  if (input.mediaType === "text/css") {
    const result = mergeCssDeclarationsThreeWay({ base, local, remote });
    const conflicts = result.conflicts.map((entry) =>
      semanticConflict(
        entry.semanticKey,
        entry.reason === "parse-error" ? "parse-error" : "concurrent-edit",
        `CSS adapter refused ${entry.reason}.`,
        { base: entry.base, local: entry.local, remote: entry.remote },
      ),
    );
    return adapterResult({
      status: result.status,
      content: result.content,
      conflicts,
      appliedRemoteKeys: result.appliedRemoteKeys,
      preservedLocalKeys: result.preservedLocalKeys,
    });
  }
  if (PLAIN_TEXT_MEDIA.has(input.mediaType)) {
    const result = mergePlainTextThreeWay({ base, local, remote }, { maxCharacters: maxFileBytes });
    return adapterResult({
      ...result,
      appliedRemoteKeys: result.appliedRemoteKeys,
      preservedLocalKeys: result.preservedLocalKeys,
    });
  }
  const structuredKind = STRUCTURED_SOURCE_MEDIA_TYPES.get(input.mediaType);
  if (structuredKind !== undefined) {
    const result = mergeStructuredSourceThreeWay(
      { base, local, remote },
      { kind: structuredKind, maxCharacters: maxFileBytes },
    );
    return adapterResult({ ...result });
  }

  return conflictedFileMerge([
    semanticConflict(
      "$media",
      "unsupported-media-adapter",
      `No conservative semantic adapter is registered for ${input.mediaType}.`,
    ),
  ]);
}
