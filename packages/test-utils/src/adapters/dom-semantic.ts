import {
  getByDisplayValue,
  getByLabelText,
  getByPlaceholderText,
  getByRole,
  getByTestId,
  getByText,
  type ByRoleOptions,
  type MatcherOptions,
  type SelectorMatcherOptions,
} from "@testing-library/dom";

import { HarnessConfigurationError, RuntimeCapabilityError } from "../runtime-capability.js";
import type { SemanticQueryOptions, SemanticQueryPort, TextMatch } from "../semantic-query.js";

export interface DomSemanticQueryRuntime {
  getByRole(container: HTMLElement, role: string, options?: ByRoleOptions): HTMLElement;
  getByLabelText(container: HTMLElement, text: TextMatch, options?: MatcherOptions): HTMLElement;
  getByPlaceholderText(
    container: HTMLElement,
    text: TextMatch,
    options?: MatcherOptions,
  ): HTMLElement;
  getByText(container: HTMLElement, text: TextMatch, options?: SelectorMatcherOptions): HTMLElement;
  getByDisplayValue(container: HTMLElement, text: TextMatch, options?: MatcherOptions): HTMLElement;
  getByTestId(container: HTMLElement, testId: string): HTMLElement;
}

export interface DomSemanticQueryPortOptions {
  /** A test seam for browser runners. Omit it to use DOM Testing Library. */
  readonly runtime?: DomSemanticQueryRuntime;
}

const testingLibraryRuntime: DomSemanticQueryRuntime = {
  getByRole: (container, role, options) => getByRole(container, role, options),
  getByLabelText: (container, text, options) => getByLabelText(container, text, options),
  getByPlaceholderText: (container, text, options) =>
    getByPlaceholderText(container, text, options),
  getByText: (container, text, options) => getByText(container, text, options),
  getByDisplayValue: (container, text, options) => getByDisplayValue(container, text, options),
  getByTestId: (container, testId) => getByTestId(container, testId),
};

function fuzzyAccessibleName(value: string): (accessibleName: string) => boolean {
  const expected = value.toLocaleLowerCase();
  return (accessibleName) => accessibleName.toLocaleLowerCase().includes(expected);
}

function roleOptions(options: SemanticQueryOptions | undefined): ByRoleOptions | undefined {
  if (options === undefined) return undefined;

  const result: ByRoleOptions = {};
  if (options.hidden !== undefined) result.hidden = options.hidden;
  if (options.selected !== undefined) result.selected = options.selected;
  if (options.checked !== undefined) result.checked = options.checked;
  if (options.pressed !== undefined) result.pressed = options.pressed;
  if (options.expanded !== undefined) result.expanded = options.expanded;
  if (options.level !== undefined) result.level = options.level;
  if (options.description !== undefined) result.description = options.description;
  if (options.name !== undefined) {
    result.name =
      options.exact === false && typeof options.name === "string"
        ? fuzzyAccessibleName(options.name)
        : options.name;
  }
  return result;
}

function textOptions(
  options: SemanticQueryOptions | undefined,
  queryKind: "label" | "placeholder" | "text" | "display-value",
): MatcherOptions | SelectorMatcherOptions | undefined {
  if (options === undefined) return undefined;

  const unsupported = [
    options.hidden,
    options.name,
    options.description,
    options.selected,
    options.checked,
    options.pressed,
    options.expanded,
    options.level,
  ].some((value) => value !== undefined);
  if (unsupported) {
    throw new HarnessConfigurationError(
      "dom-semantic.unsupported-option",
      `${queryKind} queries only support the exact option; role-state filters must use a role query.`,
    );
  }

  return options.exact === undefined ? undefined : { exact: options.exact };
}

/**
 * Binds the framework-neutral semantic query port to DOM Testing Library.
 *
 * The container is deliberately explicit: importing this module in Node or SSR does not read a
 * global document, and an absent DOM fails instead of silently returning an empty result.
 */
export function createDomSemanticQueryPort(
  container: HTMLElement | undefined,
  options: DomSemanticQueryPortOptions = {},
): SemanticQueryPort<HTMLElement> {
  if (container === undefined || container.ownerDocument === undefined) {
    throw new RuntimeCapabilityError(
      "dom-document",
      "DOM semantic queries require an HTMLElement with an ownerDocument.",
    );
  }

  const runtime = options.runtime ?? testingLibraryRuntime;
  return {
    getByRole: (role, queryOptions) =>
      runtime.getByRole(container, role, roleOptions(queryOptions)),
    getByLabelText: (text, queryOptions) =>
      runtime.getByLabelText(container, text, textOptions(queryOptions, "label")),
    getByPlaceholderText: (text, queryOptions) =>
      runtime.getByPlaceholderText(container, text, textOptions(queryOptions, "placeholder")),
    getByText: (text, queryOptions) =>
      runtime.getByText(container, text, textOptions(queryOptions, "text")),
    getByDisplayValue: (text, queryOptions) =>
      runtime.getByDisplayValue(container, text, textOptions(queryOptions, "display-value")),
    getByTestId: (testId) => runtime.getByTestId(container, testId),
  };
}
