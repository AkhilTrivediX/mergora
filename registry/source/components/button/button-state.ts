export interface PreventableActivationEvent {
  preventDefault(): void;
  stopPropagation(): void;
}

export type ButtonActivationResult = "invoked" | "prevented-pending";

export function runButtonActivation<Event extends PreventableActivationEvent>(
  pending: boolean,
  event: Event,
  handler?: (event: Event) => void,
): ButtonActivationResult {
  if (pending) {
    event.preventDefault();
    event.stopPropagation();
    return "prevented-pending";
  }

  handler?.(event);
  return "invoked";
}

export type AccessibleNameSource =
  "aria-label" | "aria-labelledby" | "descendant-text" | "image-alt";

export type AccessibleNameInspection =
  | { readonly status: "present"; readonly source: AccessibleNameSource }
  | { readonly status: "missing" }
  | { readonly status: "indeterminate" };

interface ElementLike {
  readonly type?: unknown;
  readonly props?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function inspectDescendant(node: unknown): AccessibleNameInspection {
  if (typeof node === "number") {
    return { status: "present", source: "descendant-text" };
  }
  if (typeof node === "string") {
    return node.trim().length > 0
      ? { status: "present", source: "descendant-text" }
      : { status: "missing" };
  }
  if (node === null || node === undefined || typeof node === "boolean") {
    return { status: "missing" };
  }
  if (Array.isArray(node)) {
    const inspections = node.map(inspectDescendant);
    return (
      inspections.find((inspection) => inspection.status === "present") ??
      (inspections.some((inspection) => inspection.status === "indeterminate")
        ? { status: "indeterminate" }
        : { status: "missing" })
    );
  }
  if (!isRecord(node)) {
    return { status: "indeterminate" };
  }

  const element = node as ElementLike;
  const props = element.props;
  if (!isRecord(props)) {
    return { status: "indeterminate" };
  }
  if (hasNonEmptyText(props["aria-label"])) {
    return { status: "present", source: "aria-label" };
  }
  if (hasNonEmptyText(props["aria-labelledby"])) {
    return { status: "present", source: "aria-labelledby" };
  }

  if (typeof element.type === "string") {
    if (element.type === "svg") {
      if (props["aria-hidden"] === true || props["aria-hidden"] === "true") {
        return { status: "missing" };
      }
      const svgName = inspectDescendant(props.children);
      return svgName.status === "present" ? svgName : { status: "indeterminate" };
    }
    if (element.type === "img") {
      return hasNonEmptyText(props.alt)
        ? { status: "present", source: "image-alt" }
        : { status: "missing" };
    }
    if (props.dangerouslySetInnerHTML !== undefined) {
      return { status: "indeterminate" };
    }
  }

  if ("children" in props) {
    return inspectDescendant(props.children);
  }

  // A custom component can render text that is not inspectable from its props.
  return typeof element.type === "string" ? { status: "missing" } : { status: "indeterminate" };
}

export function inspectButtonAccessibleName(input: {
  readonly ariaLabel?: unknown;
  readonly ariaLabelledBy?: unknown;
  readonly children?: unknown;
  readonly title?: unknown;
}): AccessibleNameInspection {
  if (hasNonEmptyText(input.ariaLabel)) {
    return { status: "present", source: "aria-label" };
  }
  if (hasNonEmptyText(input.ariaLabelledBy)) {
    return { status: "present", source: "aria-labelledby" };
  }
  // A title can contribute a fallback name, but this source-level guard cannot
  // establish how the target browser/assistive-technology pair exposes it.
  if (hasNonEmptyText(input.title)) {
    return { status: "indeterminate" };
  }
  return inspectDescendant(input.children);
}

export const MISSING_BUTTON_NAME_DIAGNOSTIC =
  "[Mergora Button] An accessible name could not be found for this icon-only button. " +
  "Add visible text, a non-empty aria-label, or aria-labelledby that references visible or " +
  "screen-reader-readable text.";

const reportedDiagnostics = new Set<string>();

interface ProcessLike {
  readonly env?: { readonly NODE_ENV?: string };
}

declare const process: ProcessLike | undefined;

function isProductionRuntime(): boolean {
  const viteProduction = (
    import.meta as ImportMeta & { readonly env?: { readonly PROD?: boolean } }
  ).env?.PROD;
  if (viteProduction === true) return true;
  return typeof process !== "undefined" && process.env?.NODE_ENV === "production";
}

export function reportButtonNameDiagnostic(inspection: AccessibleNameInspection): void {
  if (
    inspection.status !== "missing" ||
    isProductionRuntime() ||
    reportedDiagnostics.has(MISSING_BUTTON_NAME_DIAGNOSTIC)
  ) {
    return;
  }

  reportedDiagnostics.add(MISSING_BUTTON_NAME_DIAGNOSTIC);
  console.error(MISSING_BUTTON_NAME_DIAGNOSTIC);
}
