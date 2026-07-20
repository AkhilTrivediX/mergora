import { resolveStorybookId, type StorybookPointer } from "./specimen-frame-model";

export interface DocumentationStoryPointer extends StorybookPointer {
  readonly matrixStatus?: string | null;
  readonly mode?: string | null;
  readonly status: string;
}

export interface DocumentationStateRecord {
  readonly applicability: string;
  readonly id: string;
  readonly rationale: string | null;
  readonly story: DocumentationStoryPointer | null;
}

export interface DocumentationContractItem {
  readonly displayName: string;
  readonly id: string;
  readonly stateApplicability: {
    readonly reason: string | null;
    readonly sourcePath: string | null;
    readonly states: readonly DocumentationStateRecord[];
    readonly status: string;
  };
  readonly storybook: {
    readonly basic: DocumentationStoryPointer;
    readonly recommended: DocumentationStoryPointer;
  };
}

export type StateLabStoryKind = "basic" | "recommended" | "state";

export interface StateLabStory {
  readonly availability: "available" | "unavailable";
  readonly evidenceStatus: string;
  readonly key: string;
  readonly kind: StateLabStoryKind;
  readonly label: string;
  readonly matrixStatus: string | null;
  readonly mode: string | null;
  readonly pointer: StorybookPointer | null;
  readonly stateId: string | null;
  readonly unavailableReason: string | null;
}

export interface StateLabState {
  readonly applicability: string;
  readonly id: string;
  readonly label: string;
  readonly rationale: string | null;
  readonly story: StateLabStory | null;
}

export interface StateLabModel {
  readonly basic: StateLabStory;
  readonly displayName: string;
  readonly inventoryReason: string | null;
  readonly inventorySourcePath: string | null;
  readonly inventoryStatus: string;
  readonly itemId: string;
  readonly recommended: StateLabStory;
  readonly states: readonly StateLabState[];
}

export interface StateLabControlConfiguration {
  readonly contrast: string;
  readonly density: string;
  readonly direction: string;
  readonly motion: string;
  readonly theme: string;
  readonly viewportMode: string;
}

export interface StateLabConfiguration {
  readonly controls: StateLabControlConfiguration;
  readonly stateId: string | null;
  readonly story: StateLabStoryKind;
}

export interface ParsedStateLabConfiguration {
  readonly configuration: StateLabConfiguration;
  readonly issues: readonly string[];
}

interface StateLabGlobalOption {
  readonly label: string;
  readonly value: string;
}

export interface StateLabGlobalControl {
  readonly defaultValue: string;
  readonly label: string;
  readonly options: readonly StateLabGlobalOption[];
  readonly queryKey: string;
  readonly storybookKey: keyof StateLabControlConfiguration;
}

export const STATE_LAB_GLOBAL_CONTROLS: readonly StateLabGlobalControl[] = [
  {
    defaultValue: "light",
    label: "Theme",
    options: [
      { label: "Light", value: "light" },
      { label: "Dark", value: "dark" },
      { label: "System", value: "system" },
    ],
    queryKey: "labTheme",
    storybookKey: "theme",
  },
  {
    defaultValue: "standard",
    label: "Contrast",
    options: [
      { label: "Standard", value: "standard" },
      { label: "Enhanced", value: "enhanced" },
      { label: "Forced-color tokens", value: "forced-colors" },
    ],
    queryKey: "labContrast",
    storybookKey: "contrast",
  },
  {
    defaultValue: "comfortable",
    label: "Density",
    options: [
      { label: "Comfortable", value: "comfortable" },
      { label: "Compact", value: "compact" },
      { label: "Touch", value: "touch" },
    ],
    queryKey: "labDensity",
    storybookKey: "density",
  },
  {
    defaultValue: "ltr",
    label: "Direction",
    options: [
      { label: "Left to right", value: "ltr" },
      { label: "Right to left", value: "rtl" },
    ],
    queryKey: "labDirection",
    storybookKey: "direction",
  },
  {
    defaultValue: "full",
    label: "Motion",
    options: [
      { label: "Full", value: "full" },
      { label: "Reduced", value: "reduced" },
    ],
    queryKey: "labMotion",
    storybookKey: "motion",
  },
  {
    defaultValue: "responsive",
    label: "Canvas width",
    options: [
      { label: "Responsive", value: "responsive" },
      { label: "Mobile · 390px", value: "mobile" },
      { label: "Narrow · 320px", value: "narrow" },
    ],
    queryKey: "labViewport",
    storybookKey: "viewportMode",
  },
] as const;

const STATE_LABELS: Readonly<Record<string, string>> = {
  "enhanced-contrast": "Enhanced contrast",
  "focus-visible": "Focus visible",
  "forced-colors": "Forced colors",
  "icon-only-named": "Named icon only",
  "long-localized-label": "Long localized label",
  "narrow-320": "Narrow, 320px",
  "safe-area": "Safe area",
  "size-maximum": "Maximum size",
  "size-minimum": "Minimum size",
  "text-200": "Text at 200%",
  "touch-target": "Touch target",
  "unsafe-url": "Unsafe URL",
  "zoom-400": "Zoom at 400%",
  rtl: "RTL",
};

const LAB_QUERY_KEYS = new Set([
  "labContrast",
  "labDensity",
  "labDirection",
  "labItem",
  "labMotion",
  "labState",
  "labStory",
  "labTheme",
  "labViewport",
]);

function isStateLabParameter(key: string): boolean {
  return /^lab[A-Z]/u.test(key);
}

function safePointer(story: DocumentationStoryPointer | null): story is DocumentationStoryPointer {
  return (
    story !== null &&
    story.exportName.trim().length > 0 &&
    story.modulePath.startsWith("apps/storybook/") &&
    !story.modulePath.includes("..")
  );
}

function storyFromPointer({
  kind,
  label,
  pointer,
  stateId = null,
  unavailableReason = null,
}: {
  readonly kind: StateLabStoryKind;
  readonly label: string;
  readonly pointer: DocumentationStoryPointer | null;
  readonly stateId?: string | null;
  readonly unavailableReason?: string | null;
}): StateLabStory {
  const pointerIsSafe = safePointer(pointer);
  const available =
    unavailableReason === null && pointerIsSafe && pointer.status === "validated-source-export";
  const evidenceStatus = pointer?.status ?? "not-recorded";
  return {
    availability: available ? "available" : "unavailable",
    evidenceStatus,
    key: kind === "state" ? `state:${stateId ?? "missing"}` : kind,
    kind,
    label,
    matrixStatus: pointer?.matrixStatus ?? null,
    mode: pointer?.mode ?? null,
    pointer: pointerIsSafe
      ? { exportName: pointer.exportName, modulePath: pointer.modulePath }
      : null,
    stateId,
    unavailableReason:
      unavailableReason ??
      (available ? null : `Story pointer status is ${evidenceStatus.replaceAll("-", " ")}.`),
  };
}

export function humanStateLabel(id: string): string {
  const explicit = STATE_LABELS[id];
  if (explicit !== undefined) return explicit;
  const words = id.replaceAll("-", " ");
  return `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`;
}

export function buildStateLabModel(item: DocumentationContractItem): StateLabModel {
  const inventoryAvailable = item.stateApplicability.status === "available";
  const states = item.stateApplicability.states.map((state): StateLabState => {
    const isApplicable = state.applicability === "applicable";
    const isNotApplicable = state.applicability === "not-applicable";
    const inventoryReason = inventoryAvailable
      ? null
      : (item.stateApplicability.reason ??
        `State inventory status is ${item.stateApplicability.status.replaceAll("-", " ")}.`);
    const story = isNotApplicable
      ? null
      : storyFromPointer({
          kind: "state",
          label: humanStateLabel(state.id),
          pointer: state.story,
          stateId: state.id,
          unavailableReason:
            inventoryReason ??
            (isApplicable
              ? null
              : `State applicability is ${state.applicability.replaceAll("-", " ")}.`),
        });
    return {
      applicability: state.applicability,
      id: state.id,
      label: humanStateLabel(state.id),
      rationale: state.rationale,
      story,
    };
  });

  return {
    basic: storyFromPointer({
      kind: "basic",
      label: "Basic",
      pointer: item.storybook.basic,
    }),
    displayName: item.displayName,
    inventoryReason: item.stateApplicability.reason,
    inventorySourcePath: item.stateApplicability.sourcePath,
    inventoryStatus: item.stateApplicability.status,
    itemId: item.id,
    recommended: storyFromPointer({
      kind: "recommended",
      label: "Recommended Mergora",
      pointer: item.storybook.recommended,
    }),
    states,
  };
}

export function defaultStateLabConfiguration(): StateLabConfiguration {
  return {
    controls: Object.fromEntries(
      STATE_LAB_GLOBAL_CONTROLS.map(({ defaultValue, storybookKey }) => [
        storybookKey,
        defaultValue,
      ]),
    ) as unknown as StateLabControlConfiguration,
    stateId: null,
    story: "basic",
  };
}

function firstValue(parameters: URLSearchParams, key: string, issues: string[]): string | null {
  const values = parameters.getAll(key);
  if (values.length > 1) issues.push(`${key} was repeated; the first value was used.`);
  return values[0] ?? null;
}

export function parseStateLabSearch(
  search: string,
  model: StateLabModel,
): ParsedStateLabConfiguration {
  const parameters = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const issues: string[] = [];
  const defaults = defaultStateLabConfiguration();
  const item = firstValue(parameters, "labItem", issues);
  if (item !== null && item !== model.itemId) {
    issues.push(`State Lab item ${item} does not match this ${model.itemId} documentation page.`);
  }

  for (const key of new Set(parameters.keys())) {
    if (isStateLabParameter(key) && !LAB_QUERY_KEYS.has(key)) {
      issues.push(`Unknown State Lab parameter ${key} was ignored.`);
    }
  }

  const controls = { ...defaults.controls } as Record<string, string>;
  for (const control of STATE_LAB_GLOBAL_CONTROLS) {
    const requested = firstValue(parameters, control.queryKey, issues);
    if (requested === null) continue;
    if (control.options.some(({ value }) => value === requested)) {
      controls[control.storybookKey] = requested;
    } else {
      issues.push(`${control.queryKey} value ${requested} is unavailable and was reset.`);
    }
  }

  const requestedStory = firstValue(parameters, "labStory", issues) ?? "basic";
  const requestedState = firstValue(parameters, "labState", issues);
  let story: StateLabStoryKind = "basic";
  let stateId: string | null = null;
  if (requestedStory === "basic" || requestedStory === "recommended") {
    story = requestedStory;
    if (requestedState !== null) issues.push("labState was ignored because labStory is not state.");
  } else if (requestedStory === "state") {
    const state = model.states.find(({ id }) => id === requestedState);
    if (state === undefined) {
      issues.push(`State ${requestedState ?? "(missing)"} is not recorded for ${model.itemId}.`);
    } else {
      story = "state";
      stateId = state.id;
    }
  } else {
    issues.push(`Story selection ${requestedStory} is unavailable and was reset.`);
  }

  return {
    configuration: {
      controls: controls as unknown as StateLabControlConfiguration,
      stateId,
      story,
    },
    issues,
  };
}

function sortedSearch(parameters: URLSearchParams): string {
  const sorted = [...parameters.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyOrder = leftKey.localeCompare(rightKey, "en-US");
    return keyOrder === 0 ? leftValue.localeCompare(rightValue, "en-US") : keyOrder;
  });
  const canonical = new URLSearchParams();
  for (const [key, value] of sorted) canonical.append(key, value);
  const value = canonical.toString();
  return value.length === 0 ? "" : `?${value}`;
}

export function buildStateLabSearch(
  model: StateLabModel,
  configuration: StateLabConfiguration,
  currentSearch = "",
): string {
  const parameters = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch,
  );
  for (const key of [...parameters.keys()]) {
    if (isStateLabParameter(key)) parameters.delete(key);
  }
  parameters.set("labItem", model.itemId);
  parameters.set("labStory", configuration.story);
  if (configuration.story === "state" && configuration.stateId !== null) {
    parameters.set("labState", configuration.stateId);
  }
  for (const control of STATE_LAB_GLOBAL_CONTROLS) {
    parameters.set(control.queryKey, configuration.controls[control.storybookKey]);
  }
  return sortedSearch(parameters);
}

export function stateLabStoryForConfiguration(
  model: StateLabModel,
  configuration: StateLabConfiguration,
): StateLabStory | null {
  if (configuration.story === "basic") return model.basic;
  if (configuration.story === "recommended") return model.recommended;
  return (
    model.states.find(({ id }) => id === configuration.stateId)?.story ??
    (model.states.some(({ id }) => id === configuration.stateId)
      ? storyFromPointer({
          kind: "state",
          label: humanStateLabel(configuration.stateId ?? "state"),
          pointer: null,
          stateId: configuration.stateId,
          unavailableReason:
            model.states.find(({ id }) => id === configuration.stateId)?.rationale ??
            "This state is recorded as not applicable.",
        })
      : null)
  );
}

export function stateLabGlobals(configuration: StateLabConfiguration): string {
  return STATE_LAB_GLOBAL_CONTROLS.map(
    ({ storybookKey }) => `${storybookKey}:${configuration.controls[storybookKey]}`,
  ).join(";");
}

export function resolveStateLabStoryIds(
  index: unknown,
  model: StateLabModel,
): Readonly<Record<string, string | null>> {
  const stories = [
    model.basic,
    model.recommended,
    ...model.states.flatMap(({ story }) => (story === null ? [] : [story])),
  ];
  return Object.fromEntries(
    stories.map((story) => [
      story.key,
      story.availability === "available" && story.pointer !== null
        ? resolveStorybookId(index, story.pointer)
        : null,
    ]),
  );
}
