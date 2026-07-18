import { semanticConflict, type SemanticConflict } from "./merge-model.js";
import { mergePlainTextThreeWay, type TextMergeOptions } from "./text-merge.js";

export interface KeepRegionMergeResult {
  readonly status: "no-op" | "fast-forward" | "keep-local" | "semantic-merge" | "conflict";
  readonly content: string | null;
  readonly conflictContent: string | null;
  readonly conflicts: readonly SemanticConflict[];
  readonly regionIds: readonly string[];
}

interface KeepRegion {
  readonly id: string;
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly body: string;
}

interface ParsedRegions {
  readonly regions: ReadonlyMap<string, KeepRegion>;
  readonly conflicts: readonly SemanticConflict[];
}

const MARKER =
  /^[\t ]*[/]{2}[\t ]+mergora:keep-(start|end)[\t ]+([a-z0-9]+(?:-[a-z0-9]+)*)[\t ]*$/u;
const MARKER_PREFIX = /^[\t ]*[/]{2}.*mergora:keep-/u;
const SENTINEL_PREFIX = "\u0000mergora-keep-body:";
const SENTINEL_SUFFIX = "\u0000";

function regionConflict(id: string, detail: string): SemanticConflict {
  return semanticConflict(`keep:${id}`, "invalid-keep-region", detail);
}

function scanRegions(source: string, label: "base" | "local" | "remote"): ParsedRegions {
  const regions = new Map<string, KeepRegion>();
  const conflicts: SemanticConflict[] = [];
  let open: { readonly id: string; readonly bodyStart: number } | null = null;
  let offset = 0;

  while (offset < source.length) {
    let lineEnd = offset;
    while (lineEnd < source.length && source[lineEnd] !== "\n" && source[lineEnd] !== "\r") {
      lineEnd += 1;
    }
    let nextOffset = lineEnd;
    if (source[nextOffset] === "\r" && source[nextOffset + 1] === "\n") nextOffset += 2;
    else if (source[nextOffset] === "\r" || source[nextOffset] === "\n") nextOffset += 1;

    const line = source.slice(offset, lineEnd);
    const marker = MARKER.exec(line);
    if (marker === null) {
      if (MARKER_PREFIX.test(line)) {
        conflicts.push(
          regionConflict(
            `${label}:${String(offset)}`,
            "A keep marker must occupy a comment line and use a unique lowercase kebab-case id.",
          ),
        );
      }
      offset = nextOffset;
      continue;
    }

    const kind = marker[1]!;
    const id = marker[2]!;
    if (kind === "start") {
      if (open !== null) {
        conflicts.push(regionConflict(id, `Keep regions cannot nest inside ${open.id}.`));
      } else if (regions.has(id)) {
        conflicts.push(regionConflict(id, "Keep region ids must be unique within a file."));
      } else {
        open = { id, bodyStart: nextOffset };
      }
    } else if (open === null) {
      conflicts.push(regionConflict(id, "A keep-end marker has no preceding keep-start marker."));
    } else if (open.id !== id) {
      conflicts.push(
        regionConflict(id, `Keep-end id ${id} does not match open keep region ${open.id}.`),
      );
    } else {
      regions.set(id, {
        id,
        bodyStart: open.bodyStart,
        bodyEnd: offset,
        body: source.slice(open.bodyStart, offset),
      });
      open = null;
    }
    offset = nextOffset;
  }

  if (open !== null) {
    conflicts.push(regionConflict(open.id, "A keep-start marker has no matching keep-end marker."));
  }
  return { regions, conflicts };
}

function maskRegions(source: string, regions: ReadonlyMap<string, KeepRegion>): string {
  const ordered = [...regions.values()].sort((left, right) => right.bodyStart - left.bodyStart);
  let masked = source;
  for (const region of ordered) {
    const sentinel = `${SENTINEL_PREFIX}${region.id}${SENTINEL_SUFFIX}`;
    masked = `${masked.slice(0, region.bodyStart)}${sentinel}${masked.slice(region.bodyEnd)}`;
  }
  return masked;
}

function restoreRegions(masked: string, bodies: ReadonlyMap<string, string>): string | null {
  let restored = masked;
  for (const [id, body] of [...bodies.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "en-US"),
  )) {
    const sentinel = `${SENTINEL_PREFIX}${id}${SENTINEL_SUFFIX}`;
    const first = restored.indexOf(sentinel);
    if (first < 0 || restored.indexOf(sentinel, first + sentinel.length) >= 0) return null;
    restored = `${restored.slice(0, first)}${body}${restored.slice(first + sentinel.length)}`;
  }
  return restored;
}

function conflictResult(
  conflicts: readonly SemanticConflict[],
  regionIds: readonly string[],
  conflictContent: string | null = null,
): KeepRegionMergeResult {
  return {
    status: "conflict",
    content: null,
    conflictContent,
    conflicts,
    regionIds,
  };
}

/**
 * Treats every valid keep body as one atomic semantic unit, masks it during
 * diff3, then restores the selected exact bytes. Marker movement is supported;
 * removal, nesting, ambiguity, or unequal concurrent body edits fail closed.
 */
export function mergeKeepRegionsThreeWay(
  input: { readonly base: string; readonly local: string; readonly remote: string },
  options: TextMergeOptions = {},
): KeepRegionMergeResult {
  for (const [label, source] of Object.entries(input)) {
    if (source.includes(SENTINEL_PREFIX)) {
      return conflictResult(
        [
          regionConflict(
            label,
            "Source contains the reserved internal keep-region sentinel sequence.",
          ),
        ],
        [],
      );
    }
  }

  const base = scanRegions(input.base, "base");
  const local = scanRegions(input.local, "local");
  const remote = scanRegions(input.remote, "remote");
  const scanConflicts = [...base.conflicts, ...local.conflicts, ...remote.conflicts];
  const allIds = [
    ...new Set([...base.regions.keys(), ...local.regions.keys(), ...remote.regions.keys()]),
  ].sort((left, right) => left.localeCompare(right, "en-US"));
  if (scanConflicts.length > 0) return conflictResult(scanConflicts, allIds);

  const bodies = new Map<string, string>();
  const conflicts: SemanticConflict[] = [];
  for (const id of allIds) {
    const baseRegion = base.regions.get(id);
    const localRegion = local.regions.get(id);
    const remoteRegion = remote.regions.get(id);
    if (baseRegion !== undefined && localRegion === undefined) {
      conflicts.push(
        regionConflict(id, "The local file removed or renamed an enrolled keep region."),
      );
      continue;
    }
    if (baseRegion !== undefined && remoteRegion === undefined) {
      conflicts.push(
        semanticConflict(
          `keep:${id}`,
          "remote-region-removed",
          "The upstream file removed or renamed an enrolled keep region.",
        ),
      );
      continue;
    }

    const baseBody = baseRegion?.body;
    const localBody = localRegion?.body;
    const remoteBody = remoteRegion?.body;
    if (localBody === remoteBody && localBody !== undefined) {
      bodies.set(id, localBody);
    } else if (localBody === baseBody && remoteBody !== undefined) {
      bodies.set(id, remoteBody);
    } else if (remoteBody === baseBody && localBody !== undefined) {
      bodies.set(id, localBody);
    } else if (baseBody === undefined && localBody === undefined && remoteBody !== undefined) {
      bodies.set(id, remoteBody);
    } else if (baseBody === undefined && remoteBody === undefined && localBody !== undefined) {
      bodies.set(id, localBody);
    } else {
      conflicts.push(
        semanticConflict(
          `keep:${id}`,
          "concurrent-edit",
          "Local and upstream keep-region bodies changed unequally.",
          { base: baseBody ?? null, local: localBody ?? null, remote: remoteBody ?? null },
        ),
      );
    }
  }
  if (conflicts.length > 0) return conflictResult(conflicts, allIds);

  if (input.local === input.remote) {
    return {
      status: "no-op",
      content: input.local,
      conflictContent: null,
      conflicts: [],
      regionIds: allIds,
    };
  }
  if (input.local === input.base) {
    return {
      status: "fast-forward",
      content: input.remote,
      conflictContent: null,
      conflicts: [],
      regionIds: allIds,
    };
  }
  if (input.remote === input.base) {
    return {
      status: "keep-local",
      content: input.local,
      conflictContent: null,
      conflicts: [],
      regionIds: allIds,
    };
  }

  const textResult = mergePlainTextThreeWay(
    {
      base: maskRegions(input.base, base.regions),
      local: maskRegions(input.local, local.regions),
      remote: maskRegions(input.remote, remote.regions),
    },
    options,
  );
  if (textResult.status === "conflict" || textResult.content === null) {
    return conflictResult(textResult.conflicts, allIds, textResult.conflictContent);
  }
  const restored = restoreRegions(textResult.content, bodies);
  if (restored === null) {
    return conflictResult(
      [regionConflict("$file", "Keep-region identity became ambiguous during text merge.")],
      allIds,
    );
  }
  return {
    status: "semantic-merge",
    content: restored,
    conflictContent: null,
    conflicts: [],
    regionIds: allIds,
  };
}
