import { semanticConflict, type SemanticConflict } from "./merge-model.js";

export interface TextMergeOptions {
  readonly maxCharacters?: number;
  readonly maxLines?: number;
  readonly maxMatrixCells?: number;
  readonly remoteLineEndings?: "preserve-local" | "lf";
}

export interface TextMergeResult {
  readonly status: "no-op" | "fast-forward" | "keep-local" | "semantic-merge" | "conflict";
  readonly content: string | null;
  readonly conflictContent: string | null;
  readonly conflicts: readonly SemanticConflict[];
  readonly appliedRemoteKeys: readonly string[];
  readonly preservedLocalKeys: readonly string[];
}

interface TextLine {
  readonly text: string;
  readonly ending: "" | "\n" | "\r" | "\r\n";
}

interface DiffHunk {
  readonly baseStart: number;
  readonly baseEnd: number;
  readonly replacement: readonly TextLine[];
}

interface SideDiff {
  readonly hunks: readonly DiffHunk[];
  readonly baseToSide: ReadonlyMap<number, number>;
}

interface TaggedHunk extends DiffHunk {
  readonly source: "local" | "remote";
  readonly key: string;
}

class TextLimitError extends Error {}

const DEFAULT_MAX_CHARACTERS = 2_097_152;
const DEFAULT_MAX_LINES = 20_000;
const DEFAULT_MAX_MATRIX_CELLS = 2_000_000;

function splitLines(value: string): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "\n" && character !== "\r") continue;
    const ending = character === "\r" && value[index + 1] === "\n" ? "\r\n" : character;
    lines.push({ text: value.slice(start, index), ending });
    if (ending === "\r\n") index += 1;
    start = index + 1;
  }
  if (start < value.length) lines.push({ text: value.slice(start), ending: "" });
  return lines;
}

function lineContentEqual(left: TextLine, right: TextLine): boolean {
  return left.text === right.text;
}

function buildDiff(
  base: readonly TextLine[],
  side: readonly TextLine[],
  maxMatrixCells: number,
): SideDiff {
  const width = side.length + 1;
  const cells = (base.length + 1) * width;
  if (!Number.isSafeInteger(cells) || cells > maxMatrixCells) {
    throw new TextLimitError(`Diff matrix requires ${String(cells)} cells.`);
  }

  const matrix = new Uint32Array(cells);
  for (let baseIndex = base.length - 1; baseIndex >= 0; baseIndex -= 1) {
    for (let sideIndex = side.length - 1; sideIndex >= 0; sideIndex -= 1) {
      const cell = baseIndex * width + sideIndex;
      matrix[cell] = lineContentEqual(base[baseIndex]!, side[sideIndex]!)
        ? matrix[(baseIndex + 1) * width + sideIndex + 1]! + 1
        : Math.max(matrix[(baseIndex + 1) * width + sideIndex]!, matrix[cell + 1]!);
    }
  }

  const hunks: DiffHunk[] = [];
  const baseToSide = new Map<number, number>();
  let baseIndex = 0;
  let sideIndex = 0;
  while (baseIndex < base.length || sideIndex < side.length) {
    if (
      baseIndex < base.length &&
      sideIndex < side.length &&
      lineContentEqual(base[baseIndex]!, side[sideIndex]!)
    ) {
      baseToSide.set(baseIndex, sideIndex);
      baseIndex += 1;
      sideIndex += 1;
      continue;
    }

    const baseStart = baseIndex;
    const sideStart = sideIndex;
    while (baseIndex < base.length || sideIndex < side.length) {
      if (
        baseIndex < base.length &&
        sideIndex < side.length &&
        lineContentEqual(base[baseIndex]!, side[sideIndex]!)
      ) {
        break;
      }
      const deleteScore =
        baseIndex < base.length ? matrix[(baseIndex + 1) * width + sideIndex]! : -1;
      const insertScore = sideIndex < side.length ? matrix[baseIndex * width + sideIndex + 1]! : -1;
      if (baseIndex < base.length && (sideIndex >= side.length || deleteScore >= insertScore)) {
        baseIndex += 1;
      } else {
        sideIndex += 1;
      }
    }
    hunks.push({
      baseStart,
      baseEnd: baseIndex,
      replacement: side.slice(sideStart, sideIndex),
    });
  }

  return { hunks, baseToSide };
}

function replacementEqual(left: readonly TextLine[], right: readonly TextLine[]): boolean {
  return (
    left.length === right.length &&
    left.every((line, index) => lineContentEqual(line, right[index]!))
  );
}

function hunksOverlap(left: DiffHunk, right: DiffHunk): boolean {
  const leftInsertion = left.baseStart === left.baseEnd;
  const rightInsertion = right.baseStart === right.baseEnd;
  if (leftInsertion && rightInsertion) return left.baseStart === right.baseStart;
  if (leftInsertion) return left.baseStart >= right.baseStart && left.baseStart <= right.baseEnd;
  if (rightInsertion) return right.baseStart >= left.baseStart && right.baseStart <= left.baseEnd;
  return left.baseStart < right.baseEnd && right.baseStart < left.baseEnd;
}

function hunkKey(hunk: DiffHunk): string {
  const end = Math.max(hunk.baseStart + 1, hunk.baseEnd);
  return `lines:${String(hunk.baseStart + 1)}-${String(end)}`;
}

function dominantLineEnding(...sources: readonly TextLine[][]): "\n" | "\r" | "\r\n" {
  const counts = new Map<"\n" | "\r" | "\r\n", number>([
    ["\r\n", 0],
    ["\n", 0],
    ["\r", 0],
  ]);
  for (const source of sources) {
    for (const line of source) {
      if (line.ending !== "") counts.set(line.ending, counts.get(line.ending)! + 1);
    }
    if ([...counts.values()].some((count) => count > 0)) break;
  }
  return [...counts.entries()].sort((left, right) => {
    const countOrder = right[1] - left[1];
    return countOrder === 0 ? left[0].localeCompare(right[0], "en-US") : countOrder;
  })[0]![0];
}

function renderLines(lines: readonly TextLine[]): string {
  return lines.map((line) => `${line.text}${line.ending}`).join("");
}

function hasFinalLineEnding(value: string): boolean {
  return value.endsWith("\n") || value.endsWith("\r");
}

function conflictMarkers(base: string, local: string, remote: string, ending: string): string {
  const terminate = (value: string): string =>
    value.endsWith("\n") || value.endsWith("\r") || value === "" ? value : `${value}${ending}`;
  return [
    `<<<<<<< LOCAL${ending}`,
    terminate(local),
    `||||||| BASE${ending}`,
    terminate(base),
    `=======${ending}`,
    terminate(remote),
    `>>>>>>> REMOTE${ending}`,
  ].join("");
}

function trivial(
  status: "no-op" | "fast-forward" | "keep-local",
  content: string,
): TextMergeResult {
  return {
    status,
    content,
    conflictContent: null,
    conflicts: [],
    appliedRemoteKeys: [],
    preservedLocalKeys: [],
  };
}

/** Deterministic, bounded, line-based diff3 for explicitly plain-text media. */
export function mergePlainTextThreeWay(
  input: { readonly base: string; readonly local: string; readonly remote: string },
  options: TextMergeOptions = {},
): TextMergeResult {
  const maxCharacters = options.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxMatrixCells = options.maxMatrixCells ?? DEFAULT_MAX_MATRIX_CELLS;
  for (const [label, value] of Object.entries(input)) {
    if (value.length > maxCharacters) {
      return {
        status: "conflict",
        content: null,
        conflictContent: null,
        conflicts: [
          semanticConflict(
            `$${label}`,
            "input-limit",
            `${label} exceeds the bounded text adapter character limit.`,
          ),
        ],
        appliedRemoteKeys: [],
        preservedLocalKeys: [],
      };
    }
  }

  const baseLines = splitLines(input.base);
  const localLines = splitLines(input.local);
  const remoteLines = splitLines(input.remote);
  if (Math.max(baseLines.length, localLines.length, remoteLines.length) > maxLines) {
    return {
      status: "conflict",
      content: null,
      conflictContent: null,
      conflicts: [
        semanticConflict("$file", "input-limit", "Text input exceeds the bounded line limit."),
      ],
      appliedRemoteKeys: [],
      preservedLocalKeys: [],
    };
  }

  if (input.local === input.remote) return trivial("no-op", input.local);
  if (input.local === input.base) return trivial("fast-forward", input.remote);
  if (input.remote === input.base) return trivial("keep-local", input.local);

  let localDiff: SideDiff;
  let remoteDiff: SideDiff;
  try {
    localDiff = buildDiff(baseLines, localLines, maxMatrixCells);
    remoteDiff = buildDiff(baseLines, remoteLines, maxMatrixCells);
  } catch (error) {
    if (!(error instanceof TextLimitError)) throw error;
    return {
      status: "conflict",
      content: null,
      conflictContent: null,
      conflicts: [semanticConflict("$file", "input-limit", error.message)],
      appliedRemoteKeys: [],
      preservedLocalKeys: [],
    };
  }

  const localFinalEndingChanged =
    hasFinalLineEnding(input.local) !== hasFinalLineEnding(input.base);
  const upstreamTouchesEnd = remoteDiff.hunks.some((hunk) => hunk.baseEnd === baseLines.length);
  if (localFinalEndingChanged && upstreamTouchesEnd) {
    const lineEnding = dominantLineEnding(localLines, baseLines, remoteLines);
    return {
      status: "conflict",
      content: null,
      conflictContent: conflictMarkers(input.base, input.local, input.remote, lineEnding),
      conflicts: [
        semanticConflict(
          "lines:eof",
          "overlapping-text-edit",
          "A local final-newline edit overlaps an upstream end-of-file hunk.",
        ),
      ],
      appliedRemoteKeys: [],
      preservedLocalKeys: ["lines:eof"],
    };
  }

  const localHunks: TaggedHunk[] = localDiff.hunks.map((hunk) => ({
    ...hunk,
    source: "local",
    key: hunkKey(hunk),
  }));
  const acceptedRemote: TaggedHunk[] = [];
  const conflicts: SemanticConflict[] = [];
  for (const remoteHunk of remoteDiff.hunks) {
    const overlapping = localHunks.filter((localHunk) => hunksOverlap(localHunk, remoteHunk));
    if (overlapping.length === 0) {
      acceptedRemote.push({ ...remoteHunk, source: "remote", key: hunkKey(remoteHunk) });
      continue;
    }
    if (
      overlapping.length === 1 &&
      overlapping[0]!.baseStart === remoteHunk.baseStart &&
      overlapping[0]!.baseEnd === remoteHunk.baseEnd &&
      replacementEqual(overlapping[0]!.replacement, remoteHunk.replacement)
    ) {
      continue;
    }
    const key = hunkKey(remoteHunk);
    conflicts.push(
      semanticConflict(
        key,
        "overlapping-text-edit",
        "Local and upstream line edits overlap and have unequal replacements.",
        {
          base: renderLines(baseLines.slice(remoteHunk.baseStart, remoteHunk.baseEnd)),
          local: overlapping.map((hunk) => renderLines(hunk.replacement)).join(""),
          remote: renderLines(remoteHunk.replacement),
        },
      ),
    );
  }

  const lineEnding = dominantLineEnding(localLines, baseLines, remoteLines);
  if (conflicts.length > 0) {
    return {
      status: "conflict",
      content: null,
      conflictContent: conflictMarkers(input.base, input.local, input.remote, lineEnding),
      conflicts,
      appliedRemoteKeys: [],
      preservedLocalKeys: localHunks.map(({ key }) => key),
    };
  }

  const mergedHunks = [...localHunks, ...acceptedRemote].sort((left, right) => {
    const startOrder = left.baseStart - right.baseStart;
    if (startOrder !== 0) return startOrder;
    const sourceOrder = left.source.localeCompare(right.source, "en-US");
    return sourceOrder === 0 ? left.baseEnd - right.baseEnd : sourceOrder;
  });
  const output: TextLine[] = [];
  let cursor = 0;
  const appendUnchangedLocal = (until: number): void => {
    while (cursor < until) {
      const localIndex = localDiff.baseToSide.get(cursor);
      output.push(localIndex === undefined ? baseLines[cursor]! : localLines[localIndex]!);
      cursor += 1;
    }
  };

  for (const hunk of mergedHunks) {
    appendUnchangedLocal(hunk.baseStart);
    if (hunk.source === "local") {
      output.push(...hunk.replacement);
    } else {
      output.push(
        ...hunk.replacement.map((line): TextLine => {
          const ending: TextLine["ending"] =
            line.ending === "" ? "" : options.remoteLineEndings === "lf" ? "\n" : lineEnding;
          return { text: line.text, ending };
        }),
      );
    }
    cursor = hunk.baseEnd;
  }
  appendUnchangedLocal(baseLines.length);

  return {
    status: "semantic-merge",
    content: renderLines(output),
    conflictContent: null,
    conflicts: [],
    appliedRemoteKeys: acceptedRemote.map(({ key }) => key),
    preservedLocalKeys: localHunks.map(({ key }) => key),
  };
}
