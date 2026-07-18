import {
  bytesEqual,
  cloneBytes,
  semanticConflict,
  type FileBytes,
  type SemanticConflict,
} from "./merge-model.js";

export type MovePlan =
  | {
      readonly status: "move";
      readonly oldTarget: string;
      readonly newTarget: string;
      readonly proposed: Uint8Array;
      readonly deleteOld: true;
      readonly requiresTemporaryRename: boolean;
      readonly conflicts: readonly [];
    }
  | {
      readonly status: "merge-required";
      readonly oldTarget: string;
      readonly newTarget: string;
      readonly base: Uint8Array;
      readonly local: Uint8Array;
      readonly remote: Uint8Array;
      readonly conflicts: readonly [];
    }
  | {
      readonly status: "conflict";
      readonly oldTarget: string;
      readonly newTarget: string;
      readonly conflicts: readonly SemanticConflict[];
    };

function portableCaseFold(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

function validTarget(value: string): boolean {
  return (
    value.length > 0 &&
    value === value.normalize("NFC") &&
    !value.startsWith("/") &&
    !value.startsWith("\\") &&
    !value.includes("\\") &&
    !value.includes(":") &&
    !/^[a-zA-Z]:/u.test(value) &&
    !value.split(/[\\/]/u).some((segment) => segment === "" || segment === "." || segment === "..")
  );
}

function moveConflict(oldTarget: string, newTarget: string, conflict: SemanticConflict): MovePlan {
  return { status: "conflict", oldTarget, newTarget, conflicts: [conflict] };
}

/** Plans only registry-declared logical moves; it never infers deletion from similarity. */
export function planExplicitMove(input: {
  readonly oldTarget: string;
  readonly newTarget: string;
  readonly base: FileBytes;
  readonly localOld: FileBytes;
  readonly remoteNew: FileBytes;
  readonly existingNew: FileBytes;
}): MovePlan {
  const { oldTarget, newTarget } = input;
  if (!validTarget(oldTarget) || !validTarget(newTarget) || oldTarget === newTarget) {
    return moveConflict(
      oldTarget,
      newTarget,
      semanticConflict(
        "$move",
        "invalid-move",
        "A move requires two distinct portable project-relative targets.",
      ),
    );
  }
  if (input.base === null || input.remoteNew === null) {
    return moveConflict(
      oldTarget,
      newTarget,
      semanticConflict(
        "$move",
        "invalid-move",
        "A declared move requires an enrolled base and new upstream bytes.",
      ),
    );
  }
  if (input.existingNew !== null) {
    return moveConflict(
      oldTarget,
      newTarget,
      semanticConflict("$move", "move-collision", "The declared new target is already occupied."),
    );
  }
  if (input.localOld === null) {
    return moveConflict(
      oldTarget,
      newTarget,
      semanticConflict(
        "$move",
        "delete-modify",
        "The old target was deleted locally before the upstream move.",
      ),
    );
  }
  if (bytesEqual(input.base, input.localOld)) {
    return {
      status: "move",
      oldTarget,
      newTarget,
      proposed: cloneBytes(input.remoteNew)!,
      deleteOld: true,
      requiresTemporaryRename: portableCaseFold(oldTarget) === portableCaseFold(newTarget),
      conflicts: [],
    };
  }
  return {
    status: "merge-required",
    oldTarget,
    newTarget,
    base: cloneBytes(input.base)!,
    local: cloneBytes(input.localOld)!,
    remote: cloneBytes(input.remoteNew)!,
    conflicts: [],
  };
}
