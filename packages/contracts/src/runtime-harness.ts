import type {
  AuditAnnouncementObservationV1,
  AuditAxeObservationV1,
  AuditFocusObservationV1,
  AuditGeometryObservationV1,
  AuditKeyboardObservationV1,
  AuditRuntimeContextV1,
  AuditStateObservationV1,
  JsonPrimitive,
  RuntimeAuditMode,
  RuntimeHarnessOutcomeV1,
} from "./model.js";

const MAX_OBSERVATIONS = 32;
const catalogIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const failureCodePattern = /^[A-Z][A-Z0-9_]{0,127}$/u;
const projectSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasDisallowedControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if ((code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const observed = Object.keys(value).sort(compareText);
  const required = [...expected].sort(compareText);
  if (
    observed.length !== required.length ||
    observed.some((entry, index) => entry !== required[index])
  ) {
    throw new TypeError(`${label} fields are invalid.`);
  }
}

function text(value: unknown, maximum: number, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum ||
    value.normalize("NFC") !== value ||
    hasDisallowedControl(value)
  ) {
    throw new TypeError(`${label} must be bounded normalized text.`);
  }
  return value;
}

function nullableText(value: unknown, maximum: number, label: string): string | null {
  return value === null ? null : text(value, maximum, label);
}

function catalogId(value: unknown, label: string): string {
  const result = text(value, 128, label);
  if (!catalogIdPattern.test(result)) throw new TypeError(`${label} must be a catalog id.`);
  return result;
}

function list(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > MAX_OBSERVATIONS) {
    throw new TypeError(`${label} must be an array of at most ${String(MAX_OBSERVATIONS)} items.`);
  }
  return value;
}

function sortedUnique<T>(
  entries: readonly T[],
  key: (entry: T) => string,
  label: string,
): readonly T[] {
  const result = [...entries].sort((left, right) => compareText(key(left), key(right)));
  const keys = result.map(key);
  if (new Set(keys).size !== keys.length) throw new TypeError(`${label} contains duplicates.`);
  return result;
}

function primitive(value: unknown, label: string): JsonPrimitive {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000) {
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "string") return text(value, 512, label);
  throw new TypeError(`${label} must be a bounded JSON primitive.`);
}

function states(value: unknown): readonly AuditStateObservationV1[] {
  const entries = list(value, "Runtime state observations").map((entry, index) => {
    const observed = record(entry, `Runtime state observation ${String(index)}`);
    exactKeys(observed, ["name", "value"], `Runtime state observation ${String(index)}`);
    return {
      name: catalogId(observed.name, `Runtime state observation ${String(index)} name`),
      value: primitive(observed.value, `Runtime state observation ${String(index)} value`),
    };
  });
  return sortedUnique(entries, ({ name }) => name, "Runtime state observations");
}

function keyboard(value: unknown): readonly AuditKeyboardObservationV1[] {
  const entries = list(value, "Runtime keyboard observations").map((entry, index) => {
    const observed = record(entry, `Runtime keyboard observation ${String(index)}`);
    exactKeys(
      observed,
      ["key", "action", "outcome"],
      `Runtime keyboard observation ${String(index)}`,
    );
    return {
      key: text(observed.key, 64, `Runtime keyboard observation ${String(index)} key`),
      action: text(observed.action, 256, `Runtime keyboard observation ${String(index)} action`),
      outcome: text(observed.outcome, 512, `Runtime keyboard observation ${String(index)} outcome`),
    };
  });
  return sortedUnique(
    entries,
    ({ action, key }) => `${key}\u0000${action}`,
    "Runtime keyboard observations",
  );
}

function focus(value: unknown): readonly AuditFocusObservationV1[] {
  const entries = list(value, "Runtime focus observations").map((entry, index) => {
    const observed = record(entry, `Runtime focus observation ${String(index)}`);
    exactKeys(
      observed,
      ["step", "target", "visible", "occluded"],
      `Runtime focus observation ${String(index)}`,
    );
    if (
      !(observed.visible === null || typeof observed.visible === "boolean") ||
      !(observed.occluded === null || typeof observed.occluded === "boolean")
    ) {
      throw new TypeError(`Runtime focus observation ${String(index)} visibility is invalid.`);
    }
    return {
      step: catalogId(observed.step, `Runtime focus observation ${String(index)} step`),
      target: nullableText(
        observed.target,
        512,
        `Runtime focus observation ${String(index)} target`,
      ),
      visible: observed.visible,
      occluded: observed.occluded,
    };
  });
  return sortedUnique(entries, ({ step }) => step, "Runtime focus observations");
}

function announcements(value: unknown): readonly AuditAnnouncementObservationV1[] {
  const entries = list(value, "Runtime announcement observations").map((entry, index) => {
    const observed = record(entry, `Runtime announcement observation ${String(index)}`);
    exactKeys(
      observed,
      ["text", "politeness"],
      `Runtime announcement observation ${String(index)}`,
    );
    if (!["assertive", "off", "polite"].includes(observed.politeness as never)) {
      throw new TypeError(
        `Runtime announcement observation ${String(index)} politeness is invalid.`,
      );
    }
    return {
      text: text(observed.text, 512, `Runtime announcement observation ${String(index)} text`),
      politeness: observed.politeness as AuditAnnouncementObservationV1["politeness"],
    };
  });
  return sortedUnique(
    entries,
    ({ politeness, text: value }) => `${politeness}\u0000${value}`,
    "Runtime announcement observations",
  );
}

function axe(value: unknown): readonly AuditAxeObservationV1[] {
  const entries = list(value, "Runtime axe observations").map((entry, index) => {
    const observed = record(entry, `Runtime axe observation ${String(index)}`);
    exactKeys(
      observed,
      ["ruleId", "impact", "nodeCount"],
      `Runtime axe observation ${String(index)}`,
    );
    if (
      !(
        observed.impact === null ||
        ["critical", "minor", "moderate", "serious"].includes(observed.impact as never)
      ) ||
      !Number.isSafeInteger(observed.nodeCount) ||
      Number(observed.nodeCount) < 0 ||
      Number(observed.nodeCount) > 100_000
    ) {
      throw new TypeError(`Runtime axe observation ${String(index)} values are invalid.`);
    }
    return {
      ruleId: catalogId(observed.ruleId, `Runtime axe observation ${String(index)} ruleId`),
      impact: observed.impact as AuditAxeObservationV1["impact"],
      nodeCount: Number(observed.nodeCount),
    };
  });
  return sortedUnique(entries, ({ ruleId }) => ruleId, "Runtime axe observations");
}

function geometry(value: unknown): readonly AuditGeometryObservationV1[] {
  const entries = list(value, "Runtime geometry observations").map((entry, index) => {
    const observed = record(entry, `Runtime geometry observation ${String(index)}`);
    exactKeys(
      observed,
      ["metric", "value", "unit"],
      `Runtime geometry observation ${String(index)}`,
    );
    if (
      typeof observed.value !== "number" ||
      !Number.isFinite(observed.value) ||
      Math.abs(observed.value) > 1_000_000_000 ||
      !["count", "px", "ratio"].includes(observed.unit as never)
    ) {
      throw new TypeError(`Runtime geometry observation ${String(index)} values are invalid.`);
    }
    return {
      metric: catalogId(observed.metric, `Runtime geometry observation ${String(index)} metric`),
      value: Object.is(observed.value, -0) ? 0 : observed.value,
      unit: observed.unit as AuditGeometryObservationV1["unit"],
    };
  });
  return sortedUnique(entries, ({ metric }) => metric, "Runtime geometry observations");
}

export function normalizeRuntimeAuditContextV1(value: unknown): AuditRuntimeContextV1 {
  const context = record(value, "Runtime audit context");
  exactKeys(
    context,
    ["role", "name", "states", "keyboard", "focus", "announcements", "axe", "geometry"],
    "Runtime audit context",
  );
  return {
    role: nullableText(context.role, 128, "Runtime role"),
    name: nullableText(context.name, 512, "Runtime accessible name"),
    states: states(context.states),
    keyboard: keyboard(context.keyboard),
    focus: focus(context.focus),
    announcements: announcements(context.announcements),
    axe: axe(context.axe),
    geometry: geometry(context.geometry),
  };
}

export function runtimeContextHasModeEvidenceV1(
  mode: RuntimeAuditMode,
  context: AuditRuntimeContextV1,
): boolean {
  if (mode === "keyboard") return context.keyboard.length > 0 || context.focus.length > 0;
  if (mode === "responsive") return context.geometry.length > 0;
  if (mode === "a11y") {
    return (
      context.role !== null ||
      context.name !== null ||
      context.states.length > 0 ||
      context.focus.length > 0 ||
      context.announcements.length > 0 ||
      context.axe.length > 0
    );
  }
  return (
    context.role !== null ||
    context.name !== null ||
    context.states.length > 0 ||
    context.keyboard.length > 0 ||
    context.focus.length > 0 ||
    context.announcements.length > 0 ||
    context.axe.length > 0 ||
    context.geometry.length > 0
  );
}

function isProjectRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return false;
  if (value !== value.normalize("NFC") || value.includes("\\") || value.startsWith("/")) {
    return false;
  }
  return value
    .split("/")
    .every(
      (segment) =>
        segment !== "." &&
        segment !== ".." &&
        !segment.endsWith(".") &&
        !segment.endsWith(" ") &&
        projectSegmentPattern.test(segment),
    );
}

export function normalizeRuntimeHarnessOutcomeV1(
  value: unknown,
  mode: RuntimeAuditMode,
): RuntimeHarnessOutcomeV1 {
  const outcome = record(value, "Runtime harness outcome");
  exactKeys(
    outcome,
    ["state", "actualBehavior", "projectPath", "failureCode", "context"],
    "Runtime harness outcome",
  );
  if (!["fail", "not-applicable", "pass"].includes(outcome.state as never)) {
    throw new TypeError("Runtime harness outcome state is invalid.");
  }
  if (!(outcome.projectPath === null || isProjectRelativePath(outcome.projectPath))) {
    throw new TypeError("Runtime harness outcome projectPath is invalid.");
  }
  const state = outcome.state as RuntimeHarnessOutcomeV1["state"];
  if (
    (state === "fail" &&
      (typeof outcome.failureCode !== "string" || !failureCodePattern.test(outcome.failureCode))) ||
    (state !== "fail" && outcome.failureCode !== null)
  ) {
    throw new TypeError("Runtime harness outcome failureCode does not match its state.");
  }
  const context = normalizeRuntimeAuditContextV1(outcome.context);
  if (state !== "not-applicable" && !runtimeContextHasModeEvidenceV1(mode, context)) {
    throw new TypeError("Runtime harness outcome has no mode-relevant evidence.");
  }
  return {
    state,
    actualBehavior: text(outcome.actualBehavior, 1_024, "Runtime actual behavior"),
    projectPath: outcome.projectPath,
    failureCode: outcome.failureCode as string | null,
    context,
  };
}

export function isCanonicalRuntimeAuditContextV1(value: unknown): value is AuditRuntimeContextV1 {
  try {
    return JSON.stringify(value) === JSON.stringify(normalizeRuntimeAuditContextV1(value));
  } catch {
    return false;
  }
}
