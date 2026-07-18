import type { StoryEnvironment } from "./environment.js";
import { compareText, isCatalogId, issue, validationResult } from "./validation.js";
import type { ValidationIssue, ValidationResult } from "./validation.js";

export const REQUIRED_STORY_STATES = [
  "default",
  "hover",
  "active",
  "focus-visible",
  "disabled",
  "read-only",
  "invalid",
  "required",
  "loading",
  "empty",
  "populated",
  "partial",
  "success",
  "warning",
  "error",
  "destructive",
] as const;

export type RequiredStoryState = (typeof REQUIRED_STORY_STATES)[number];

export type StateApplicability =
  | { readonly status: "applicable" }
  | { readonly status: "not-applicable"; readonly reason: string };

export interface StoryStateCase {
  readonly id: string;
  readonly applicability: StateApplicability;
  readonly description?: string;
  readonly tags?: readonly string[];
}

export interface StoryStateMatrix {
  readonly schemaVersion: 1;
  readonly itemId: string;
  readonly states: readonly StoryStateCase[];
}

export interface StoryStateRun {
  readonly id: string;
  readonly itemId: string;
  readonly stateId: string;
  readonly environmentId: string;
  readonly state: StoryStateCase;
  readonly environment: StoryEnvironment;
}

const requiredStateOrder = new Map<string, number>(
  REQUIRED_STORY_STATES.map((state, index) => [state, index]),
);

function stateOrder(left: StoryStateCase, right: StoryStateCase): number {
  const leftIndex = requiredStateOrder.get(left.id);
  const rightIndex = requiredStateOrder.get(right.id);
  if (leftIndex !== undefined && rightIndex !== undefined) {
    return leftIndex - rightIndex;
  }
  if (leftIndex !== undefined) return -1;
  if (rightIndex !== undefined) return 1;
  return compareText(left.id, right.id);
}

export function validateStoryStateMatrix(
  matrix: StoryStateMatrix,
): ValidationResult<StoryStateMatrix> {
  const issues: ValidationIssue[] = [];
  const stateIds = new Set<string>();

  if (matrix.schemaVersion !== 1) {
    issues.push(issue("state-matrix.schema-version", "schemaVersion", "schemaVersion must be 1."));
  }
  if (!isCatalogId(matrix.itemId)) {
    issues.push(issue("state-matrix.item-id", "itemId", "itemId must be a catalog id."));
  }

  for (const [index, state] of matrix.states.entries()) {
    const path = `states[${index}]`;
    if (!isCatalogId(state.id)) {
      issues.push(issue("state-matrix.state-id", `${path}.id`, "State id must be a catalog id."));
    }
    if (stateIds.has(state.id)) {
      issues.push(
        issue(
          "state-matrix.duplicate-state",
          `${path}.id`,
          `State "${state.id}" must be declared exactly once.`,
        ),
      );
    }
    stateIds.add(state.id);

    if (
      state.applicability.status === "not-applicable" &&
      state.applicability.reason.trim().length === 0
    ) {
      issues.push(
        issue(
          "state-matrix.missing-not-applicable-reason",
          `${path}.applicability.reason`,
          "Not-applicable states require a concrete reason.",
        ),
      );
    }
    if (state.description !== undefined && state.description.trim().length === 0) {
      issues.push(
        issue(
          "state-matrix.empty-description",
          `${path}.description`,
          "Descriptions must be omitted instead of empty.",
        ),
      );
    }
    if (state.tags?.some((tag) => !isCatalogId(tag))) {
      issues.push(
        issue("state-matrix.invalid-tag", `${path}.tags`, "Every state tag must be a catalog id."),
      );
    }
  }

  for (const requiredState of REQUIRED_STORY_STATES) {
    if (!stateIds.has(requiredState)) {
      issues.push(
        issue(
          "state-matrix.missing-required-state",
          "states",
          `Required state "${requiredState}" must be explicitly applicable or not applicable.`,
        ),
      );
    }
  }

  const sorted = [...matrix.states].sort(stateOrder);
  if (sorted.some((entry, index) => entry.id !== matrix.states[index]?.id)) {
    issues.push(
      issue(
        "state-matrix.noncanonical-order",
        "states",
        "Required states must use policy order and extension states must follow lexically.",
      ),
    );
  }

  return validationResult(matrix, issues);
}

export function defineStoryStateMatrix(
  itemId: string,
  states: readonly StoryStateCase[],
): ValidationResult<StoryStateMatrix> {
  return validateStoryStateMatrix({ schemaVersion: 1, itemId, states });
}

export function expandStoryStateRuns(
  matrix: StoryStateMatrix,
  environments: readonly StoryEnvironment[],
): readonly StoryStateRun[] {
  const validation = validateStoryStateMatrix(matrix);
  if (!validation.ok) {
    throw new TypeError(validation.issues.map((entry) => entry.message).join("; "));
  }

  const applicableStates = matrix.states.filter(
    (state) => state.applicability.status === "applicable",
  );
  return applicableStates.flatMap((state) =>
    [...environments]
      .sort((left, right) => compareText(left.id, right.id))
      .map((environment) => ({
        id: `${matrix.itemId}--${state.id}--${environment.id}`,
        itemId: matrix.itemId,
        stateId: state.id,
        environmentId: environment.id,
        state,
        environment,
      })),
  );
}
