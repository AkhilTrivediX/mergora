import { HarnessConfigurationError } from "./runtime-capability.js";

export type TextMatch = string | RegExp;

export interface SemanticQueryOptions {
  readonly exact?: boolean;
  readonly hidden?: boolean;
  readonly name?: TextMatch;
  readonly description?: TextMatch;
  readonly selected?: boolean;
  readonly checked?: boolean;
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly level?: number;
}

export interface SemanticQueryPort<TNode> {
  getByRole(role: string, options?: SemanticQueryOptions): TNode;
  getByLabelText(text: TextMatch, options?: SemanticQueryOptions): TNode;
  getByPlaceholderText(text: TextMatch, options?: SemanticQueryOptions): TNode;
  getByText(text: TextMatch, options?: SemanticQueryOptions): TNode;
  getByDisplayValue(text: TextMatch, options?: SemanticQueryOptions): TNode;
  getByTestId(testId: string): TNode;
}

export type SemanticQuery =
  | {
      readonly kind: "role";
      readonly role: string;
      readonly options?: SemanticQueryOptions;
    }
  | {
      readonly kind: "label";
      readonly text: TextMatch;
      readonly options?: SemanticQueryOptions;
    }
  | {
      readonly kind: "placeholder";
      readonly text: TextMatch;
      readonly options?: SemanticQueryOptions;
    }
  | {
      readonly kind: "text";
      readonly text: TextMatch;
      readonly options?: SemanticQueryOptions;
    }
  | {
      readonly kind: "display-value";
      readonly text: TextMatch;
      readonly options?: SemanticQueryOptions;
    }
  | {
      readonly kind: "test-id";
      readonly testId: string;
      readonly justification: string;
      readonly use: "geometry" | "visual-mask" | "implementation-boundary";
    };

export const SEMANTIC_QUERY_PRIORITY = [
  "role",
  "label",
  "placeholder",
  "text",
  "display-value",
  "test-id",
] as const satisfies readonly SemanticQuery["kind"][];

function validateOptions(options: SemanticQueryOptions | undefined): void {
  if (options?.level !== undefined && (!Number.isSafeInteger(options.level) || options.level < 1)) {
    throw new HarnessConfigurationError(
      "semantic-query.invalid-heading-level",
      "A semantic heading level must be a positive integer.",
    );
  }
}

export function semanticQueryRank(query: SemanticQuery): number {
  return SEMANTIC_QUERY_PRIORITY.indexOf(query.kind);
}

export function querySemantically<TNode>(
  port: SemanticQueryPort<TNode>,
  query: SemanticQuery,
): TNode {
  if (query.kind === "test-id") {
    if (query.testId.trim().length === 0 || query.justification.trim().length === 0) {
      throw new HarnessConfigurationError(
        "semantic-query.unjustified-test-id",
        "Test-id queries require a non-empty id and a concrete geometry, mask, or boundary justification.",
      );
    }
    return port.getByTestId(query.testId);
  }

  validateOptions(query.options);
  switch (query.kind) {
    case "role":
      if (query.role.trim().length === 0) {
        throw new HarnessConfigurationError(
          "semantic-query.empty-role",
          "Role queries require a non-empty role.",
        );
      }
      return port.getByRole(query.role, query.options);
    case "label":
      return port.getByLabelText(query.text, query.options);
    case "placeholder":
      return port.getByPlaceholderText(query.text, query.options);
    case "text":
      return port.getByText(query.text, query.options);
    case "display-value":
      return port.getByDisplayValue(query.text, query.options);
  }
}
