import { canonicalJson, CliError, sha256 } from "./contracts.js";
import { basePath, readManifest, readProjectFile } from "./source-operations.js";
import type { SemanticSourceDiff, SemanticSourceDiffFile } from "./semantic-update.js";

type DiffKind = "add" | "delete" | "equal";

interface DiffLine {
  readonly kind: DiffKind;
  readonly text: string;
  readonly oldBefore: number;
  readonly newBefore: number;
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

interface DiffHunk {
  readonly start: number;
  readonly end: number;
}

export interface SemanticDiffRenderOptions {
  readonly contextLines: number;
  readonly format: "side-by-side" | "unified";
}

const MAX_LCS_CELLS = 2_000_000;
const SIDE_COLUMN_WIDTH = 72;

function decodeText(bytes: Buffer | null, mediaType: string): readonly string[] | null {
  if (bytes === null) return [];
  if (!(mediaType.startsWith("text/") || mediaType.includes("json"))) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(bytes)
      .split(/\r\n|\n|\r/gu);
  } catch {
    return null;
  }
}

function line(kind: DiffKind, text: string, oldBefore: number, newBefore: number): DiffLine {
  return {
    kind,
    text,
    oldBefore,
    newBefore,
    oldLine: kind === "add" ? null : oldBefore + 1,
    newLine: kind === "delete" ? null : newBefore + 1,
  };
}

function coarseDiff(before: readonly string[], after: readonly string[]): readonly DiffLine[] {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) {
    suffix += 1;
  }
  const result: DiffLine[] = [];
  let oldCursor = 0;
  let newCursor = 0;
  for (let index = 0; index < prefix; index += 1) {
    result.push(line("equal", before[index]!, oldCursor, newCursor));
    oldCursor += 1;
    newCursor += 1;
  }
  for (let index = prefix; index < before.length - suffix; index += 1) {
    result.push(line("delete", before[index]!, oldCursor, newCursor));
    oldCursor += 1;
  }
  for (let index = prefix; index < after.length - suffix; index += 1) {
    result.push(line("add", after[index]!, oldCursor, newCursor));
    newCursor += 1;
  }
  for (let index = before.length - suffix; index < before.length; index += 1) {
    result.push(line("equal", before[index]!, oldCursor, newCursor));
    oldCursor += 1;
    newCursor += 1;
  }
  return result;
}

/**
 * Produces a deterministic line edit script. Normal component files use the exact LCS path;
 * unusually large inputs fall back to one conservative middle replacement rather than risking
 * quadratic memory use in an inspection command.
 */
function lineDiff(before: readonly string[], after: readonly string[]): readonly DiffLine[] {
  if ((before.length + 1) * (after.length + 1) > MAX_LCS_CELLS) {
    return coarseDiff(before, after);
  }
  const width = after.length + 1;
  const table = new Uint32Array((before.length + 1) * width);
  for (let oldIndex = before.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = after.length - 1; newIndex >= 0; newIndex -= 1) {
      const offset = oldIndex * width + newIndex;
      table[offset] =
        before[oldIndex] === after[newIndex]
          ? table[(oldIndex + 1) * width + newIndex + 1]! + 1
          : Math.max(table[(oldIndex + 1) * width + newIndex]!, table[offset + 1]!);
    }
  }
  const result: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < before.length || newIndex < after.length) {
    if (
      oldIndex < before.length &&
      newIndex < after.length &&
      before[oldIndex] === after[newIndex]
    ) {
      result.push(line("equal", before[oldIndex]!, oldIndex, newIndex));
      oldIndex += 1;
      newIndex += 1;
    } else if (
      newIndex < after.length &&
      (oldIndex === before.length ||
        table[oldIndex * width + newIndex + 1]! >= table[(oldIndex + 1) * width + newIndex]!)
    ) {
      result.push(line("add", after[newIndex]!, oldIndex, newIndex));
      newIndex += 1;
    } else {
      result.push(line("delete", before[oldIndex]!, oldIndex, newIndex));
      oldIndex += 1;
    }
  }
  return result;
}

function hunks(lines: readonly DiffLine[], context: number): readonly DiffHunk[] {
  const changes = lines
    .map((entry, index) => (entry.kind === "equal" ? -1 : index))
    .filter((index) => index >= 0);
  const result: DiffHunk[] = [];
  for (const index of changes) {
    const next = {
      start: Math.max(0, index - context),
      end: Math.min(lines.length, index + context + 1),
    };
    const previous = result.at(-1);
    if (previous !== undefined && next.start <= previous.end) {
      result[result.length - 1] = { start: previous.start, end: Math.max(previous.end, next.end) };
    } else result.push(next);
  }
  return result;
}

function hunkHeader(lines: readonly DiffLine[], hunk: DiffHunk): string {
  const selected = lines.slice(hunk.start, hunk.end);
  const oldCount = selected.filter(({ kind }) => kind !== "add").length;
  const newCount = selected.filter(({ kind }) => kind !== "delete").length;
  const first = selected[0];
  const oldStart =
    selected.find(({ oldLine }) => oldLine !== null)?.oldLine ?? first?.oldBefore ?? 0;
  const newStart =
    selected.find(({ newLine }) => newLine !== null)?.newLine ?? first?.newBefore ?? 0;
  return `@@ -${String(oldStart)},${String(oldCount)} +${String(newStart)},${String(newCount)} @@`;
}

function verifiedFileBytes(
  root: string,
  file: SemanticSourceDiffFile,
): { readonly base: Buffer | null; readonly local: Buffer | null } {
  const base = file.baseDigest === null ? null : readProjectFile(root, basePath(file.baseDigest));
  const local = readProjectFile(root, file.target);
  if (
    (base === null ? null : sha256(base)) !== file.baseDigest ||
    (local === null ? null : sha256(local)) !== file.localDigest
  ) {
    throw new CliError(`Diff input ${file.target} changed during read-only rendering.`, {
      code: "DIFF_INPUT_STALE",
      exitCode: 8,
      target: file.target,
    });
  }
  return { base, local };
}

function plannedSummary(file: SemanticSourceDiffFile): string | null {
  if (file.planned === null || file.planned.remoteDigest === file.baseDigest) return null;
  return `planned ${file.planned.status}: R=${file.planned.remoteDigest ?? "deleted"}, proposed=${file.planned.proposedDigest ?? "deleted"}`;
}

function unifiedFile(
  root: string,
  file: SemanticSourceDiffFile,
  context: number,
): readonly string[] {
  const result = [`--- a/${file.target}`, `+++ b/${file.target}`];
  const { base, local } = verifiedFileBytes(root, file);
  const before = decodeText(base, file.mediaType);
  const after = decodeText(local, file.mediaType);
  if (before === null || after === null) {
    if (file.localChange !== "unchanged") result.push("Binary files differ");
  } else {
    const lines = lineDiff(before, after);
    for (const hunk of hunks(lines, context)) {
      result.push(hunkHeader(lines, hunk));
      for (const entry of lines.slice(hunk.start, hunk.end)) {
        result.push(
          `${entry.kind === "add" ? "+" : entry.kind === "delete" ? "-" : " "}${entry.text}`,
        );
      }
    }
  }
  const planned = plannedSummary(file);
  if (planned !== null) result.push(`# ${planned}`);
  return result;
}

function boundedColumn(value: string): string {
  const normalized = value.replaceAll("\t", "  ");
  return normalized.length <= SIDE_COLUMN_WIDTH
    ? normalized.padEnd(SIDE_COLUMN_WIDTH)
    : `${normalized.slice(0, SIDE_COLUMN_WIDTH - 1)}…`;
}

function sideBySideFile(
  root: string,
  file: SemanticSourceDiffFile,
  context: number,
): readonly string[] {
  const result = [`=== ${file.target} ===`];
  const { base, local } = verifiedFileBytes(root, file);
  const before = decodeText(base, file.mediaType);
  const after = decodeText(local, file.mediaType);
  if (before === null || after === null) {
    if (file.localChange !== "unchanged") result.push("Binary files differ");
  } else {
    const lines = lineDiff(before, after);
    for (const hunk of hunks(lines, context)) {
      result.push(hunkHeader(lines, hunk));
      const selected = lines.slice(hunk.start, hunk.end);
      for (let index = 0; index < selected.length; index += 1) {
        const entry = selected[index]!;
        if (entry.kind === "delete") {
          const deletes: DiffLine[] = [];
          const adds: DiffLine[] = [];
          while (selected[index]?.kind === "delete") deletes.push(selected[index++]!);
          while (selected[index]?.kind === "add") adds.push(selected[index++]!);
          index -= 1;
          const rows = Math.max(deletes.length, adds.length);
          for (let row = 0; row < rows; row += 1) {
            const removed = deletes[row];
            const added = adds[row];
            result.push(
              `${removed?.oldLine === undefined ? "" : String(removed.oldLine).padStart(5)} ${boundedColumn(removed?.text ?? "")} | ${added?.newLine === undefined ? "" : String(added.newLine).padStart(5)} ${added?.text ?? ""}`,
            );
          }
        } else if (entry.kind === "add") {
          result.push(
            `      ${boundedColumn("")} | ${String(entry.newLine).padStart(5)} ${entry.text}`,
          );
        } else {
          result.push(
            `${String(entry.oldLine).padStart(5)} ${boundedColumn(entry.text)} | ${String(entry.newLine).padStart(5)} ${entry.text}`,
          );
        }
      }
    }
  }
  const planned = plannedSummary(file);
  if (planned !== null) result.push(planned);
  return result;
}

/** Renders only verified manifest-owned B/L bytes and never creates a cache or transaction. */
export function renderSemanticSourceDiff(
  root: string,
  diff: SemanticSourceDiff,
  options: SemanticDiffRenderOptions,
): string {
  // Re-reading the manifest closes the small gap between classification and source rendering.
  const manifest = readManifest(root);
  if (sha256(canonicalJson(manifest.value)) !== diff.manifestDigest) {
    throw new CliError("The provenance manifest changed during read-only diff rendering.", {
      code: "DIFF_INPUT_STALE",
      exitCode: 8,
      target: ".mergora/manifest.json",
    });
  }
  const selected = diff.files.filter(
    (file) =>
      file.localChange !== "unchanged" ||
      (file.planned !== null && file.planned.remoteDigest !== file.baseDigest),
  );
  if (selected.length === 0) return "No differences.";
  const lines = selected.flatMap((file, index) => [
    ...(index === 0 ? [] : [""]),
    ...(options.format === "unified"
      ? unifiedFile(root, file, options.contextLines)
      : sideBySideFile(root, file, options.contextLines)),
  ]);
  return lines.join("\n");
}
