import type {
  AvailabilityIntent,
  CatalogCategory,
  CatalogDefinition,
  CatalogLayer,
  CatalogTrust,
  EvidenceFamily,
  RiskClass,
  RouteKind,
  StateGroup,
  TargetMaturity,
} from "./types.ts";

interface SeedRow {
  readonly id: string;
  readonly riskClass: RiskClass;
  readonly normativeBehavior: string;
  readonly stateGroups?: readonly StateGroup[];
  readonly targetMaturity?: TargetMaturity;
  readonly trust?: CatalogTrust;
  readonly packageIntent?: AvailabilityIntent;
  readonly sourceIntent?: AvailabilityIntent;
}

const row = (
  id: string,
  riskClass: RiskClass,
  normativeBehavior: string,
  stateGroups: readonly StateGroup[] = [],
  overrides: Omit<SeedRow, "id" | "riskClass" | "normativeBehavior" | "stateGroups"> = {},
): SeedRow => ({ id, riskClass, normativeBehavior, stateGroups, ...overrides });

const DISPLAY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  "ai-chat-workspace": "AI Chat Workspace",
  api: "API",
  "crud-data-workspace": "CRUD Data Workspace",
  "json-viewer": "JSON Viewer",
  mcp: "MCP",
  "otp-field": "OTP Field",
  "pin-field": "PIN Field",
  "sr-announcer": "Screen Reader Announcer",
};

function displayNameFor(id: string): string {
  const override = DISPLAY_NAME_OVERRIDES[id];
  if (override) return override;

  return id
    .split("-")
    .map((part) =>
      part.length <= 2 ? part.toUpperCase() : `${part[0]?.toUpperCase()}${part.slice(1)}`,
    )
    .join(" ");
}

function routeKindFor(layer: CatalogLayer): RouteKind {
  if (layer === "system") return "system";
  if (layer === "kit") return "kit";
  return "component";
}

const COMMON_STATES: readonly StateGroup[] = [
  "base",
  "responsive-reflow",
  "locale-direction",
  "user-preferences",
  "long-content",
];

const COMMON_EVIDENCE: readonly EvidenceFamily[] = [
  "schema-and-types",
  "unit-state",
  "role-name-query",
  "keyboard-interaction",
  "browser-aria",
  "axe",
  "visual-modes",
  "responsive-reflow",
  "locale-direction",
  "packed-consumer",
  "manual-desktop-at",
  "quality-passport",
];

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function evidenceFor(
  riskClass: RiskClass,
  kind: CatalogDefinition["kind"],
  stateGroups: readonly StateGroup[],
  packageIntent: AvailabilityIntent,
): readonly EvidenceFamily[] {
  const evidence: EvidenceFamily[] = [...COMMON_EVIDENCE];

  if (riskClass >= 2) evidence.push("manual-mobile-at");
  if (riskClass === 3) evidence.push("speech", "switch", "performance-scale");
  if (stateGroups.includes("drag-reorder")) evidence.push("drag-alternatives");
  if (kind === "kit") evidence.push("workflow-e2e", "semantic-sync");
  if (kind === "catalog-item") evidence.push("semantic-sync");
  if (packageIntent === "planned") evidence.push("package-source-parity");

  return unique(evidence);
}

function defineGroup(
  layer: Exclude<CatalogLayer, "kit">,
  category: CatalogCategory,
  rows: readonly SeedRow[],
): readonly CatalogDefinition[] {
  return rows.map((seed) => {
    const stateGroups = unique([...COMMON_STATES, ...(seed.stateGroups ?? [])]);
    const packageIntent = seed.packageIntent ?? "planned";

    return {
      kind: "catalog-item",
      id: seed.id,
      displayName: displayNameFor(seed.id),
      layer,
      category,
      routeKind: routeKindFor(layer),
      riskClass: seed.riskClass,
      trust: seed.trust ?? "core",
      implementationStatus: "unimplemented",
      targetMaturity: seed.targetMaturity ?? "stable",
      availabilityIntent: {
        package: packageIntent,
        source: seed.sourceIntent ?? "planned",
      },
      normativeBehavior: seed.normativeBehavior,
      requiredEvidenceFamilies: evidenceFor(
        seed.riskClass,
        "catalog-item",
        stateGroups,
        packageIntent,
      ),
      requiredStateGroups: stateGroups,
    } satisfies CatalogDefinition;
  });
}

const foundationUtilities = defineGroup("foundation", "foundation-utilities", [
  row(
    "provider",
    2,
    "Provide SSR-safe locale, direction, messages, time zone, portal container, reduced-motion, and density defaults with composable subtree overrides.",
    ["interaction", "overlay-focus"],
  ),
  row(
    "visually-hidden",
    1,
    "Expose screen-reader-only content, optionally reveal it on focus, and remain usable in forced-colors mode.",
    ["interaction"],
  ),
  row(
    "focus-ring",
    1,
    "Provide the shared focus-visible strategy with a two-layer indicator and forced-colors fallback.",
    ["interaction"],
  ),
  row(
    "portal",
    2,
    "Portal into a configurable container with SSR guards, inherited context and direction, and tested nested-layer behavior.",
    ["overlay-focus"],
  ),
  row(
    "presence",
    2,
    "Manage enter and exit lifecycle without hiding default content from no-JavaScript or reduced-motion users.",
    ["interaction", "async"],
  ),
  row(
    "client-only",
    1,
    "Declare an explicit hydration boundary with an accessible fallback and never conceal an SSR defect.",
    ["async", "empty-error"],
  ),
  row(
    "slot",
    1,
    "Compose rendered elements while preserving refs, event handlers, semantics, and accessible names.",
    ["interaction"],
  ),
  row(
    "direction",
    1,
    "Provide LTR and RTL context plus logical-side helpers that also propagate through portals.",
    ["overlay-focus"],
  ),
  row(
    "sr-announcer",
    2,
    "Queue localized polite and assertive announcements with deduplication and deterministic test hooks.",
    ["async", "empty-error"],
  ),
  row(
    "layer-manager",
    3,
    "Coordinate overlay order, Escape handling, background inerting, scroll locking, and nested-layer behavior deterministically.",
    ["overlay-focus", "destructive"],
  ),
]);

const layoutStructure = defineGroup("foundation", "layout-structure", [
  row(
    "container",
    1,
    "Provide fluid maximum widths, responsive gutters, safe-area handling, and container-query opt-in.",
  ),
  row("stack", 1, "Provide semantic vertical intrinsic layout using tokenized gaps."),
  row(
    "inline",
    1,
    "Provide wrapping horizontal layout with logical direction, alignment, and overflow safety.",
  ),
  row("grid", 1, "Provide semantic auto-fit and minmax layout recipes with responsive columns."),
  row("center", 1, "Center content without fixed dimensions or overflow traps."),
  row("cluster", 1, "Wrap actions or tags with sensible orphan behavior and logical ordering.", [
    "interaction",
  ]),
  row(
    "aspect-ratio",
    1,
    "Use native aspect ratio first while preserving fallback and child-content semantics.",
  ),
  row(
    "separator",
    1,
    "Support semantic and decorative separators in both orientations with forced-colors visibility.",
  ),
  row(
    "scroll-area",
    2,
    "Preserve native keyboard and touch scrolling with a visible scroll affordance and high-contrast support.",
    ["interaction"],
  ),
  row(
    "resizable",
    2,
    "Support pointer and keyboard resizing, value announcements, limits, collapse, and restore.",
    ["interaction", "selection"],
  ),
  row(
    "split-pane",
    3,
    "Coordinate multiple resizable panels, persistence adapters, keyboard alternatives, and responsive stacked presentation.",
    ["interaction", "selection", "large-data-virtualization"],
  ),
  row(
    "sticky-region",
    2,
    "Keep sticky headers or footers from obscuring focus and adapt safely to zoom and dynamic content.",
    ["interaction"],
  ),
]);

const typographyContent = defineGroup("component", "typography-content", [
  row(
    "text",
    1,
    "Map to semantic elements and text tokens, with decision-safe access to any truncated full value.",
  ),
  row(
    "heading",
    1,
    "Expose correct semantic heading levels and guard documentation against skipped hierarchy.",
  ),
  row(
    "prose",
    1,
    "Style authored or rendered HTML without breaking semantics, streaming, or nested widgets.",
    ["streaming"],
  ),
  row("code", 1, "Render selectable inline code with safe wrapping and overflow behavior."),
  row(
    "code-block",
    2,
    "Render labelled code with non-color syntax cues, copy, file and line context, and wrap or scoped scrolling.",
    ["interaction", "empty-error"],
  ),
  row(
    "kbd",
    1,
    "Represent keys and chords semantically with platform variants and localized spoken labels.",
  ),
  row("blockquote", 1, "Preserve semantic quotation and citation anatomy."),
  row(
    "description-list",
    1,
    "Provide a responsive name/value presentation while retaining description-list semantics.",
  ),
  row(
    "diff-viewer",
    3,
    "Provide split and unified diffs with non-color added/removed semantics, keyboard navigation, and a large-file strategy.",
    ["interaction", "selection", "large-data-virtualization"],
  ),
  row(
    "json-viewer",
    3,
    "Provide a keyboard-operable semantic tree, path/value copy, and virtualization that preserves ARIA relationships.",
    ["interaction", "selection", "large-data-virtualization"],
  ),
]);

const actionsSelection = defineGroup("component", "actions-selection", [
  row(
    "button",
    1,
    "Preserve native button versus link semantics and support variants, sizes, loading, pending labels, and icon-name guardrails.",
    ["interaction", "async"],
  ),
  row(
    "icon-button",
    1,
    "Require an accessible label, integrate tooltip help, and provide a comfortable touch target.",
    ["interaction", "overlay-focus"],
  ),
  row(
    "button-group",
    2,
    "Group actions visually and semantically, support split-button and wrapping recipes, and use toolbar behavior only when warranted.",
    ["interaction", "selection"],
  ),
  row(
    "copy-button",
    2,
    "Copy with a fallback, retain focus, and announce success or failure without making transient feedback the only result.",
    ["interaction", "async", "empty-error"],
  ),
  row("toggle", 2, "Expose pressed state in controlled or uncontrolled icon and text forms.", [
    "interaction",
    "selection",
  ]),
  row(
    "toggle-group",
    2,
    "Support single or multiple selection with roving focus across orientation and RTL.",
    ["interaction", "selection"],
  ),
  row(
    "segmented-control",
    2,
    "Provide radio-like exclusive selection with touch, RTL, and overflow or scroll behavior.",
    ["interaction", "selection"],
  ),
  row(
    "link",
    1,
    "Preserve navigation semantics with external, download, current, and visited states and prohibit fake disabled links.",
    ["interaction"],
  ),
  row(
    "action-menu",
    2,
    "Compose button and menu behavior with predictable focus and explicit destructive-action semantics.",
    ["interaction", "overlay-focus", "destructive"],
  ),
]);

const fieldsForms = defineGroup("component", "fields-forms", [
  row(
    "field",
    1,
    "Compose label, description, control, error, required state, generated IDs, and responsive layouts.",
    ["interaction", "form-validation"],
  ),
  row(
    "fieldset",
    1,
    "Use native fieldset and legend semantics with disabled propagation and responsive grouping.",
    ["form-validation"],
  ),
  row(
    "form",
    2,
    "Use native submission first and provide reviewed adapters for React Hook Form, TanStack Form, and server actions.",
    ["interaction", "form-validation", "async", "empty-error"],
  ),
  row(
    "validation-summary",
    2,
    "Announce the error count, link to invalid controls, and apply a documented focus policy for synchronous and asynchronous updates.",
    ["interaction", "form-validation", "async", "empty-error"],
  ),
  row(
    "input",
    1,
    "Support native text-like input types, autocomplete and inputmode while keeping labels visible around adornments.",
    ["interaction", "form-validation"],
  ),
  row(
    "textarea",
    1,
    "Support resize or bounded autogrow and IME-safe character counting without clipping text.",
    ["interaction", "form-validation"],
  ),
  row(
    "native-select",
    1,
    "Style the native select for simple choices and retain it as the mobile-first fallback.",
    ["interaction", "selection", "form-validation"],
  ),
  row(
    "checkbox",
    1,
    "Support checked and indeterminate states, form reset, and required-group examples using native or reviewed React Aria behavior.",
    ["interaction", "selection", "form-validation"],
  ),
  row(
    "checkbox-group",
    2,
    "Provide group label, description, error, selection constraints, and responsive layout.",
    ["interaction", "selection", "form-validation"],
  ),
  row(
    "radio-group",
    2,
    "Implement APG arrow behavior, group validation, and card or tile presentation without duplicate controls.",
    ["interaction", "selection", "form-validation"],
  ),
  row(
    "switch",
    2,
    "Expose explicit on/off labels and form behavior without ambiguous checkbox documentation.",
    ["interaction", "selection", "form-validation"],
  ),
  row(
    "slider",
    2,
    "Support a single thumb, vertical and RTL modes, marks, formatted values, touch, and keyboard input.",
    ["interaction", "selection", "form-validation"],
  ),
  row(
    "range-slider",
    3,
    "Coordinate multiple labelled thumbs, collision rules, touch and keyboard operation, and RTL behavior.",
    ["interaction", "selection", "form-validation"],
  ),
  row(
    "number-field",
    2,
    "Parse locale-aware numbers and support step or scrub controls, limits, precision, and wheel safeguards.",
    ["interaction", "form-validation"],
  ),
  row(
    "currency-field",
    2,
    "Format locale and currency while exposing a canonical numeric value and documented negative or accounting options.",
    ["interaction", "form-validation"],
  ),
  row(
    "percentage-field",
    2,
    "Document display-to-value scaling and support locale parsing and precision.",
    ["interaction", "form-validation"],
  ),
  row(
    "password-field",
    2,
    "Support reveal, caps-lock and rule status while preserving password managers and paste.",
    ["interaction", "form-validation", "empty-error"],
  ),
  row(
    "search-field",
    2,
    "Use native search semantics with clear, submit, and result-association behavior.",
    ["interaction", "form-validation", "async", "empty-error"],
  ),
  row(
    "otp-field",
    2,
    "Treat the entry as one logical field while supporting paste, autofill, grouping, and mobile input without cognitive tests.",
    ["interaction", "form-validation", "empty-error"],
  ),
  row(
    "pin-field",
    2,
    "Support secure and non-secure PIN entry, paste, errors, and an explicit distinction from OTP.",
    ["interaction", "form-validation", "empty-error"],
  ),
  row(
    "phone-field",
    3,
    "Provide international prefix and formatting adapters, E.164 output, extensions, and country labels beyond flags.",
    ["interaction", "form-validation"],
  ),
  row(
    "masked-field",
    3,
    "Support pluggable masks, raw and formatted values, caret and IME integrity, paste, and mobile input.",
    ["interaction", "form-validation"],
  ),
  row(
    "rating",
    2,
    "Use radio semantics with a clear option plus keyboard, touch, and read-only presentation.",
    ["interaction", "selection", "form-validation"],
  ),
  row(
    "color-field",
    2,
    "Accept typed color values, convert supported formats, expose invalid state, and render a contrast-aware preview.",
    ["interaction", "form-validation"],
  ),
  row(
    "color-picker",
    3,
    "Provide keyboard alternatives for two-dimensional color controls plus channels, swatches, alpha, and forced-colors fallback.",
    ["interaction", "selection", "form-validation"],
  ),
  row(
    "inline-edit",
    2,
    "Manage view/edit, save/cancel, asynchronous failure, and deterministic focus restoration.",
    ["interaction", "form-validation", "async", "empty-error"],
  ),
]);

const collections = defineGroup("system", "collections", [
  row(
    "listbox",
    3,
    "Support single and multiple selection, sections, disabled items, typeahead, virtualization, and asynchronous states.",
    [
      "interaction",
      "selection",
      "async",
      "empty-error",
      "offline-recovery",
      "large-data-virtualization",
    ],
  ),
  row(
    "select",
    2,
    "Provide non-editable selection, native-select guidance, mobile adaptation, and form serialization.",
    ["interaction", "selection", "form-validation", "overlay-focus"],
  ),
  row(
    "combobox",
    3,
    "Provide editable local or remote filtering, sections, custom rendering, virtualization, and form integration.",
    [
      "interaction",
      "selection",
      "form-validation",
      "async",
      "empty-error",
      "offline-recovery",
      "overlay-focus",
      "large-data-virtualization",
    ],
  ),
  row(
    "autocomplete",
    3,
    "Support free-form values with suggestions and remain distinct from must-select combobox behavior.",
    [
      "interaction",
      "selection",
      "form-validation",
      "async",
      "empty-error",
      "overlay-focus",
      "large-data-virtualization",
    ],
  ),
  row(
    "multi-select",
    3,
    "Manage multiple asynchronous values, limits, removable chips, overflow summaries, and form arrays.",
    [
      "interaction",
      "selection",
      "form-validation",
      "async",
      "empty-error",
      "overlay-focus",
      "large-data-virtualization",
    ],
  ),
  row(
    "creatable-select",
    3,
    "Validate creation, reject duplicates, expose the asynchronous create lifecycle, and support cancellation.",
    [
      "interaction",
      "selection",
      "form-validation",
      "async",
      "empty-error",
      "offline-recovery",
      "overlay-focus",
    ],
  ),
  row(
    "tags-input",
    3,
    "Create free-form tokens with paste delimiters, duplicate and limit validation, keyboard deletion, and non-drag reorder alternatives.",
    ["interaction", "selection", "form-validation", "empty-error", "drag-reorder"],
  ),
  row(
    "command-palette",
    3,
    "Support dialog and embedded modes, groups, pages, shortcuts, asynchronous search, and a navigation adapter.",
    [
      "interaction",
      "selection",
      "async",
      "empty-error",
      "overlay-focus",
      "large-data-virtualization",
    ],
  ),
  row(
    "mention-field",
    3,
    "Support trigger/query models, remote suggestions, multiple entity types, text serialization, and IME-safe editing.",
    ["interaction", "selection", "form-validation", "async", "empty-error", "overlay-focus"],
  ),
  row(
    "transfer-list",
    3,
    "Move filtered items between labelled collections with keyboard controls, counts, disabled states, and a mobile alternative.",
    ["interaction", "selection", "empty-error", "large-data-virtualization"],
  ),
]);

const dateTime = defineGroup("system", "date-time", [
  row(
    "date-field",
    2,
    "Edit locale-ordered date segments with localized numerals, availability and bounds, and a date-only value model.",
    ["interaction", "form-validation", "temporal-boundaries"],
  ),
  row(
    "time-field",
    2,
    "Edit time segments with locale 12/24-hour policy, optional seconds, and explicit time-zone display behavior.",
    ["interaction", "form-validation", "temporal-boundaries"],
  ),
  row(
    "date-time-field",
    3,
    "Distinguish zoned and unzoned values, handle DST ambiguity, and document serialization.",
    ["interaction", "form-validation", "temporal-boundaries"],
  ),
  row(
    "calendar",
    3,
    "Select a date with locale week starts, unavailable dates, month/year navigation, and RTL support.",
    ["interaction", "selection", "form-validation", "temporal-boundaries"],
  ),
  row(
    "range-calendar",
    3,
    "Select ranges with unavailable spans, preview, responsive multi-month layout, and complete keyboard behavior.",
    ["interaction", "selection", "form-validation", "temporal-boundaries"],
  ),
  row(
    "date-picker",
    3,
    "Combine typed entry with a popover or dialog calendar, presets, validation, and mobile presentation.",
    ["interaction", "selection", "form-validation", "overlay-focus", "temporal-boundaries"],
  ),
  row(
    "date-range-picker",
    3,
    "Coordinate range fields and calendar with presets and minimum or maximum duration.",
    ["interaction", "selection", "form-validation", "overlay-focus", "temporal-boundaries"],
  ),
  row(
    "time-picker",
    3,
    "Combine time entry with an available interval list and explicit time-zone behavior.",
    ["interaction", "selection", "form-validation", "overlay-focus", "temporal-boundaries"],
  ),
  row(
    "date-time-picker",
    3,
    "Coordinate date, time, zone, DST, mobile layout, and form serialization without losing temporal meaning.",
    ["interaction", "selection", "form-validation", "overlay-focus", "temporal-boundaries"],
  ),
  row("month-picker", 2, "Select a localized month at month granularity with year navigation.", [
    "interaction",
    "selection",
    "form-validation",
    "temporal-boundaries",
  ]),
  row(
    "year-picker",
    3,
    "Select from a bounded year collection with keyboard operation and virtualization for large ranges.",
    [
      "interaction",
      "selection",
      "form-validation",
      "large-data-virtualization",
      "temporal-boundaries",
    ],
  ),
]);

const filesUploads = defineGroup("system", "files-uploads", [
  row(
    "file-trigger",
    1,
    "Wrap native file selection with accessible accept, multiple, capture, keyboard, and form behavior.",
    ["interaction", "form-validation"],
  ),
  row(
    "dropzone",
    2,
    "Support drag and drop plus click and paste alternatives, visible focus, nested drag handling, and mobile fallback.",
    ["interaction", "form-validation", "empty-error", "drag-reorder"],
  ),
  row(
    "file-upload",
    3,
    "Manage an adapter-based queue with validation, previews, duplicates, alternative reordering, progress, retry, cancel, and remove.",
    [
      "interaction",
      "selection",
      "form-validation",
      "async",
      "empty-error",
      "offline-recovery",
      "destructive",
      "drag-reorder",
      "large-data-virtualization",
    ],
  ),
  row(
    "avatar-upload",
    3,
    "Provide crop and preview adapters, replace and remove flows, alt or name guidance, and server lifecycle states.",
    ["interaction", "form-validation", "async", "empty-error", "destructive", "media"],
  ),
  row(
    "upload-progress",
    2,
    "Represent per-file and aggregate determinate or indeterminate progress with non-noisy live announcements.",
    ["interaction", "async", "empty-error"],
  ),
]);

const overlays = defineGroup("component", "overlays", [
  row(
    "dialog",
    2,
    "Support modal and non-modal policy, labels, initial/final focus, nested layers, scrolling, and constrained viewports.",
    ["interaction", "overlay-focus"],
  ),
  row(
    "alert-dialog",
    2,
    "Present consequences with least-destructive initial focus and prevent accidental dismissal by default.",
    ["interaction", "overlay-focus", "destructive"],
  ),
  row("sheet", 2, "Use logical-edge placement, dialog semantics, and mobile safe-area handling.", [
    "interaction",
    "overlay-focus",
  ]),
  row(
    "drawer",
    3,
    "Offer optional touch gestures while retaining button and keyboard operation with a maintained behavior foundation.",
    ["interaction", "overlay-focus", "drag-reorder"],
  ),
  row(
    "popover",
    2,
    "Use non-modal behavior by default with collision handling, explicit focus policy, and mobile adaptation.",
    ["interaction", "overlay-focus"],
  ),
  row(
    "tooltip",
    2,
    "Expose nonessential help on hover and focus with grouped delay, dismissal, hoverability, and persistence.",
    ["interaction", "overlay-focus"],
  ),
  row(
    "hover-card",
    2,
    "Provide rich preview with focus parity and never hide required actions behind hover-only access.",
    ["interaction", "overlay-focus"],
  ),
  row(
    "dropdown-menu",
    2,
    "Implement menu semantics, submenus, typeahead, checkbox/radio items, links, and nested-layer behavior.",
    ["interaction", "selection", "overlay-focus", "destructive"],
  ),
  row(
    "context-menu",
    2,
    "Support pointer, Shift+F10 or Menu-key invocation and a discoverable touch alternative.",
    ["interaction", "selection", "overlay-focus", "destructive"],
  ),
  row(
    "menubar",
    3,
    "Implement the complete desktop application menubar keyboard model and prohibit use for ordinary site navigation.",
    ["interaction", "selection", "overlay-focus"],
  ),
  row(
    "toast",
    2,
    "Queue prioritized messages with pause, actions, persistent errors, and a controlled screen-reader announcement strategy.",
    ["interaction", "async", "empty-error", "destructive"],
  ),
  row(
    "lightbox",
    3,
    "Provide dialog semantics, image labelling, zoom and pan alternatives, and gallery keyboard and touch operation.",
    ["interaction", "selection", "overlay-focus", "media"],
  ),
]);

const navigationDisclosure = defineGroup("component", "navigation-disclosure", [
  row(
    "accordion",
    2,
    "Support single and multiple disclosure, disabled headings, explicit heading levels, and the complete keyboard pattern.",
    ["interaction", "selection"],
  ),
  row(
    "collapsible",
    1,
    "Expose disclosure semantics without imposing inappropriate accordion structure.",
    ["interaction"],
  ),
  row(
    "tabs",
    2,
    "Support manual or automatic activation, orientation, overflow scrolling, and a URL-state recipe.",
    ["interaction", "selection"],
  ),
  row(
    "breadcrumb",
    1,
    "Provide a named navigation landmark, ordered hierarchy, current page, and responsive collapse without losing location.",
    ["interaction"],
  ),
  row(
    "pagination",
    1,
    "Use navigation links with current-page and labelled ellipsis behavior plus cursor and server examples.",
    ["interaction", "selection", "async"],
  ),
  row(
    "navigation-menu",
    2,
    "Compose site links and dropdown disclosures with a complete mobile alternative and no menu-role misuse.",
    ["interaction", "selection", "overlay-focus"],
  ),
  row(
    "navbar",
    2,
    "Compose header navigation, skip link, responsive disclosure, and current location.",
    ["interaction", "overlay-focus"],
  ),
  row(
    "sidebar",
    3,
    "Coordinate desktop and mobile navigation, focus-safe drawer behavior, collapsible groups, persistence, and header compatibility.",
    ["interaction", "selection", "overlay-focus"],
  ),
  row(
    "bottom-navigation",
    2,
    "Expose mobile destinations with safe-area handling and current-page state without hiding desktop-only capability.",
    ["interaction", "selection"],
  ),
  row(
    "stepper",
    2,
    "Represent progress and optional navigation across linear or nonlinear validation and error states with responsive labels.",
    ["interaction", "selection", "form-validation", "empty-error", "workflow"],
  ),
  row(
    "table-of-contents",
    2,
    "Link extracted headings, expose current section, and preserve sticky focus visibility.",
    ["interaction", "selection"],
  ),
  row(
    "tree-view",
    3,
    "Implement the full APG tree model with lazy loading, optional multiselect, rename/actions, and virtualization.",
    [
      "interaction",
      "selection",
      "form-validation",
      "async",
      "empty-error",
      "large-data-virtualization",
    ],
  ),
  row(
    "tour",
    3,
    "Provide skippable anchored guidance with explicit focus policy, reduced motion, route-change support, and no blocked app access.",
    ["interaction", "overlay-focus", "workflow"],
  ),
]);

const feedbackStatus = defineGroup("component", "feedback-status", [
  row(
    "alert",
    1,
    "Expose alert or status semantics with title, description, actions, and non-color severity.",
    ["interaction", "empty-error"],
  ),
  row(
    "callout",
    1,
    "Present non-live explanatory content with appropriate icons, text, and landmarks.",
  ),
  row(
    "banner",
    2,
    "Present a persistent page or site message with a dismissal persistence adapter and unobscured focus.",
    ["interaction", "empty-error"],
  ),
  row(
    "badge",
    1,
    "Represent status, category, or count and prohibit interactive badges unless rendered as controls.",
    ["selection"],
  ),
  row(
    "status",
    1,
    "Compose label, dot, and icon with text and use live behavior only when justified.",
    ["async", "empty-error"],
  ),
  row(
    "progress",
    1,
    "Expose determinate or indeterminate progress with label, value, and reduced-motion behavior.",
    ["async"],
  ),
  row(
    "meter",
    1,
    "Expose correct range and optimum semantics and remain visually distinct from progress.",
    ["selection"],
  ),
  row(
    "spinner",
    1,
    "Remain decorative by default while the owning region supplies an accessible busy label and reduced-motion handling.",
    ["async"],
  ),
  row(
    "skeleton",
    1,
    "Stay out of the accessibility tree, preserve content layout, and avoid mandatory pulsing motion.",
    ["async"],
  ),
  row(
    "empty-state",
    1,
    "Provide title, explanation, primary and secondary recovery actions, and contextual examples.",
    ["interaction", "empty-error"],
  ),
  row(
    "error-state",
    2,
    "Differentiate recoverable and unrecoverable errors with retry, safe details, and no default technical leakage.",
    ["interaction", "empty-error", "offline-recovery"],
  ),
  row(
    "notification-center",
    3,
    "Manage read state, groups, filters, bulk actions, virtualization, and a documented live-update policy.",
    [
      "interaction",
      "selection",
      "async",
      "empty-error",
      "destructive",
      "large-data-virtualization",
    ],
  ),
]);

const dataDisplay = defineGroup("component", "data-display", [
  row(
    "avatar",
    1,
    "Render image, initials, or icon fallbacks with name association and group overflow.",
  ),
  row(
    "card",
    1,
    "Provide a semantically neutral header/content/footer/action container that is not implicitly clickable.",
    ["interaction"],
  ),
  row(
    "item",
    2,
    "Provide list-row anatomy, actions, selected and current distinctions, and responsive wrapping.",
    ["interaction", "selection"],
  ),
  row("table", 1, "Style native table semantics with a caption and responsive overflow wrapper.", [
    "large-data-virtualization",
  ]),
  row(
    "data-table",
    3,
    "Compose semantic-table sorting, filtering, selection, and pagination with server and URL-state examples.",
    ["interaction", "selection", "async", "empty-error", "large-data-virtualization"],
  ),
  row(
    "virtual-list",
    3,
    "Support dynamic item sizes, preserved focus, accessible positions and counts, and a loading sentinel.",
    ["interaction", "selection", "async", "empty-error", "large-data-virtualization"],
  ),
  row(
    "timeline",
    1,
    "Render ordered events with dates and status and a documented horizontal-to-vertical responsive policy.",
    ["temporal-boundaries"],
  ),
  row("stat", 1, "Format label, value, change, and context without color-only change meaning.", [
    "selection",
  ]),
  row(
    "chart",
    3,
    "Provide a styled adapter with name and description, keyboard data access when interactive, and a data-table fallback.",
    ["interaction", "selection", "large-data-virtualization"],
  ),
  row(
    "carousel",
    3,
    "Provide labelled slides, user controls, pause, no forced autoplay, touch and keyboard operation, and reduced motion.",
    ["interaction", "selection", "media"],
  ),
  row(
    "calendar-heatmap",
    3,
    "Provide a legend, table or list fallback, keyboard cells, and non-color encoding.",
    ["interaction", "selection", "large-data-virtualization", "temporal-boundaries"],
  ),
  row(
    "activity-feed",
    3,
    "Render ordered actor/time/action events with loading, pagination, and infinite-feed recovery states.",
    ["interaction", "async", "empty-error", "large-data-virtualization", "temporal-boundaries"],
  ),
]);

const advancedData = defineGroup("system", "advanced-data", [
  row(
    "data-grid",
    3,
    "Provide semantic Table and justified interactive Grid modes, client/server data operations, column and row manipulation, editing, virtualization, focus recovery, saved views, safe export, and narrow-screen alternatives.",
    [
      "interaction",
      "selection",
      "form-validation",
      "async",
      "empty-error",
      "offline-recovery",
      "destructive",
      "large-data-virtualization",
      "drag-reorder",
      "permissions",
    ],
  ),
  row(
    "tree-grid",
    3,
    "Provide hierarchical rows, expand and collapse, selection, virtualization, optional editing, and the complete APG treegrid keyboard model.",
    [
      "interaction",
      "selection",
      "form-validation",
      "async",
      "empty-error",
      "large-data-virtualization",
    ],
  ),
  row(
    "query-builder",
    3,
    "Build nested condition groups with field/operator/value schemas, non-drag reordering, validation, serialization, summaries, and localization.",
    ["interaction", "selection", "form-validation", "empty-error", "drag-reorder"],
  ),
  row(
    "filter-builder",
    3,
    "Provide the common product-filter subset with chips and summary, a mobile drawer, saved filters, and URL serialization.",
    ["interaction", "selection", "form-validation", "empty-error", "overlay-focus"],
  ),
  row(
    "sortable-list",
    3,
    "Support pointer drag plus move buttons and destination controls with announcements, cancellation, undo, and safe auto-scroll.",
    ["interaction", "selection", "destructive", "drag-reorder", "large-data-virtualization"],
  ),
  row(
    "kanban",
    3,
    "Coordinate columns and cards with scale strategy, pointer and keyboard move, WIP hooks, a mobile list alternative, and server adapters.",
    [
      "interaction",
      "selection",
      "async",
      "empty-error",
      "offline-recovery",
      "drag-reorder",
      "large-data-virtualization",
      "permissions",
    ],
    { targetMaturity: "beta" },
  ),
]);

const mediaEditing = defineGroup("component", "media-editing", [
  row(
    "attachment",
    2,
    "Expose file identity, type, size, status, preview, download, remove, and unsafe-file guidance.",
    ["interaction", "async", "empty-error", "destructive", "media"],
  ),
  row(
    "image",
    1,
    "Handle loading, failure, fallback, aspect behavior, informative alt text, and decorative mode.",
    ["async", "empty-error", "media"],
  ),
  row(
    "image-cropper",
    3,
    "Provide pointer plus numeric and keyboard crop controls, zoom, aspect, preview, and preservation of the original.",
    ["interaction", "selection", "form-validation", "media"],
  ),
  row(
    "media-player",
    3,
    "Use native-first audio or video controls with caption and transcript hooks, keyboard access, and time or volume announcements.",
    ["interaction", "selection", "async", "empty-error", "media"],
  ),
  row(
    "markdown",
    2,
    "Render trusted or sanitized Markdown safely with semantic prose, code, tables, and stable streaming updates.",
    ["async", "empty-error", "streaming"],
  ),
  row(
    "markdown-editor",
    3,
    "Provide write and preview modes, a complete toolbar keyboard model, shortcuts, paste/upload adapters, and semantic preview.",
    ["interaction", "selection", "form-validation", "async", "empty-error", "media"],
  ),
  row(
    "emoji-picker",
    3,
    "Provide localized search, categories, recent items, a grid keyboard model, skin tones, and accessible labels.",
    [
      "interaction",
      "selection",
      "async",
      "empty-error",
      "overlay-focus",
      "large-data-virtualization",
    ],
  ),
  row(
    "signature-pad",
    3,
    "Provide canvas input plus keyboard, text, or file alternatives with clear, undo, and an explicit legal caveat.",
    ["interaction", "form-validation", "empty-error", "destructive", "media"],
  ),
]);

const richTextEditor = defineGroup("system", "media-editing", [
  row(
    "rich-text-editor",
    3,
    "Wrap a maintained editor engine with explicit editing, screen-reader, mobile, serialization, and migration contracts rather than building an engine from first principles.",
    [
      "interaction",
      "selection",
      "form-validation",
      "async",
      "empty-error",
      "large-data-virtualization",
      "media",
    ],
    { targetMaturity: "experimental", trust: "labs" },
  ),
]);

const aiCollaboration = defineGroup("component", "ai-collaboration", [
  row(
    "message",
    2,
    "Represent user, assistant, system, and tool roles with content, actions, metadata, and long or streamed content.",
    ["interaction", "async", "empty-error", "streaming"],
  ),
  row(
    "message-list",
    3,
    "Virtualize messages while preserving user scroll, controlling follow-output, and announcing new content without noise.",
    [
      "interaction",
      "async",
      "empty-error",
      "offline-recovery",
      "large-data-virtualization",
      "streaming",
    ],
  ),
  row(
    "chat-composer",
    3,
    "Support multiline IME-safe input, attachments, submit and stop, shortcuts, and disabled, offline, and error states.",
    [
      "interaction",
      "form-validation",
      "async",
      "empty-error",
      "offline-recovery",
      "media",
      "streaming",
    ],
  ),
  row(
    "prompt-suggestions",
    2,
    "Use list or listbox semantics according to interaction and support keyboard, touch, and localization.",
    ["interaction", "selection"],
  ),
  row(
    "citation",
    2,
    "Provide an inline reference with reachable source detail, stable numbering, and keyboard access.",
    ["interaction", "overlay-focus"],
  ),
  row(
    "reasoning",
    2,
    "Expose reasoning as a disclosure with streaming state, reduced motion, and no automatic screen-reader verbosity.",
    ["interaction", "async", "streaming"],
  ),
  row(
    "tool-call",
    2,
    "Represent pending, running, success, error, and cancelled tool states with safe input/output disclosure.",
    ["interaction", "async", "empty-error", "offline-recovery", "streaming"],
  ),
  row(
    "streaming-text",
    3,
    "Preserve prior DOM while streaming with a controlled live-region strategy, reduced motion, and selectable content.",
    ["interaction", "async", "empty-error", "offline-recovery", "streaming"],
  ),
  row(
    "comment-thread",
    3,
    "Manage author, time, body, actions, resolve and reopen, mentions, and optimistic failure recovery.",
    ["interaction", "form-validation", "async", "empty-error", "offline-recovery", "destructive"],
  ),
  row(
    "collaboration-presence",
    2,
    "Represent avatar and labelled presence status, including stale and offline states, without color-only identity.",
    ["async", "empty-error", "offline-recovery"],
  ),
  row(
    "audit-log",
    3,
    "Present immutable actor/action/object/time events with filters and safe export.",
    [
      "interaction",
      "selection",
      "async",
      "empty-error",
      "large-data-virtualization",
      "permissions",
      "temporal-boundaries",
    ],
  ),
]);

function defineKit(category: CatalogCategory, seed: SeedRow): CatalogDefinition {
  const stateGroups = unique([
    ...COMMON_STATES,
    "interaction",
    "form-validation",
    "async",
    "empty-error",
    "offline-recovery",
    "destructive",
    "permissions",
    "workflow",
    ...(seed.stateGroups ?? []),
  ] satisfies readonly StateGroup[]);
  const packageIntent = seed.packageIntent ?? "not-planned";

  return {
    kind: "kit",
    id: seed.id,
    displayName: displayNameFor(seed.id),
    layer: "kit",
    category,
    routeKind: "kit",
    riskClass: 3,
    trust: seed.trust ?? "core",
    implementationStatus: "unimplemented",
    targetMaturity: seed.targetMaturity ?? "stable",
    availabilityIntent: {
      package: packageIntent,
      source: seed.sourceIntent ?? "planned",
    },
    normativeBehavior: seed.normativeBehavior,
    requiredEvidenceFamilies: evidenceFor(3, "kit", stateGroups, packageIntent),
    requiredStateGroups: stateGroups,
  } satisfies CatalogDefinition;
}

export const kitDefinitions = [
  defineKit(
    "authentication",
    row(
      "authentication-kit",
      3,
      "Provide sign in, sign up, password reset, passkey, MFA or OTP, recovery codes, expiry, password-manager support, error summaries, and rate-limit recovery.",
    ),
  ),
  defineKit(
    "onboarding",
    row(
      "onboarding-wizard",
      3,
      "Provide persisted-draft onboarding with step navigation, validation, optional steps, completion, error, and retry.",
    ),
  ),
  defineKit(
    "settings",
    row(
      "settings-workspace",
      3,
      "Provide profile, preferences, notifications, security, destructive account actions, and unsaved-change handling.",
    ),
  ),
  defineKit(
    "crud-data",
    row(
      "crud-data-workspace",
      3,
      "Provide Data Grid search, filters, saved views, bulk actions, create and edit surfaces, optimistic and failed mutations, and permissions.",
      ["large-data-virtualization"],
    ),
  ),
  defineKit(
    "file-management",
    row(
      "file-manager",
      3,
      "Provide folder tree, file grid and list, upload queue, preview, alternative rename/move/delete flows, conflict handling, and storage failures.",
      ["large-data-virtualization", "drag-reorder", "media"],
    ),
  ),
  defineKit(
    "command-search",
    row(
      "command-center",
      3,
      "Provide global search and commands with grouped remote-like results, recent items, shortcuts, and a mobile entry path.",
      ["large-data-virtualization", "overlay-focus"],
    ),
  ),
  defineKit(
    "ai-chat",
    row(
      "ai-chat-workspace",
      3,
      "Provide conversations, streaming messages, attachments, citations, tool states, retry, edit, branch, and offline/error/empty recovery.",
      ["large-data-virtualization", "media", "streaming"],
    ),
  ),
  defineKit(
    "admin-dashboard",
    row(
      "admin-dashboard-shell",
      3,
      "Provide responsive navbar and sidebar, breadcrumbs, notifications, accessible charts with data fallback, dense tables, and role-based navigation.",
      ["large-data-virtualization"],
    ),
  ),
  defineKit(
    "billing",
    row(
      "billing-subscription-kit",
      3,
      "Provide plan comparison, invoice data, payment-method form shell, and cancellation or retention review without real payment integration or secrets.",
      ["large-data-virtualization"],
    ),
  ),
  defineKit(
    "scheduler",
    row(
      "scheduler-kit",
      3,
      "Provide calendar and agenda views, filters, event create/edit, time zones, conflicts, keyboard navigation, and a responsive agenda alternative.",
      ["temporal-boundaries", "large-data-virtualization"],
      { targetMaturity: "beta" },
    ),
  ),
] as const satisfies readonly CatalogDefinition[];

export const catalogItemDefinitions = [
  ...foundationUtilities,
  ...layoutStructure,
  ...typographyContent,
  ...actionsSelection,
  ...fieldsForms,
  ...collections,
  ...dateTime,
  ...filesUploads,
  ...overlays,
  ...navigationDisclosure,
  ...feedbackStatus,
  ...dataDisplay,
  ...advancedData,
  ...mediaEditing,
  ...richTextEditor,
  ...aiCollaboration,
] as const satisfies readonly CatalogDefinition[];

export const catalogDefinitions = [
  ...catalogItemDefinitions,
  ...kitDefinitions,
] as const satisfies readonly CatalogDefinition[];

export const EXPECTED_INVENTORY = {
  catalogItems: 168,
  kits: 10,
  definitions: 178,
  layers: {
    foundation: 22,
    component: 113,
    system: 33,
    kit: 10,
  },
} as const;
