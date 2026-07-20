# Button Group canonical source

Status: source present and unreleased. Local tests may exist, but no immutable release or manual assistive-technology evidence is attached. This directory makes no Stable or conformance claim.

A semantic visual action group whose opt-in toolbar mode implements one-tab-stop roving focus.

## Contract

- Group mode preserves each child action as a native tab stop.
- Toolbar mode clones each recognized direct action only to assign `tabIndex`, guaranteeing exactly one enabled tab stop in SSR, hydration, dynamic disable, and removal states. It implements Home, End, orientation arrows, disabled skipping, and RTL spatial arrows.
- No button or link semantics are rewritten by the group.

Toolbar children may be direct native `button`/`a[href]` elements, Mergora action components, non-interactive separators, or those elements inside Fragments. Each action item must render exactly one concrete focusable action. Router links and other custom action components opt in with `markButtonGroupAction`; the marked component must forward `tabIndex` and data attributes to exactly one native button or anchor root. Unsupported unmarked custom or nested-action children receive a development diagnostic and an inert boundary, so their descendants cannot create uncontrolled tab stops. Group mode does not clone children and preserves every native tab stop. Toolbar mode intentionally owns action `tabIndex`; use group mode when consumer-authored tab order is required.

The optional toolbar is a bordered Ink workbench rail. `keyboardHint` adds concise visible and programmatic keyboard discovery only in toolbar mode. Use `mode="group"` and omit `keyboardHint` to remove roving focus, hint UI, and its description relationship completely.

The public ref resolves to `HTMLDivElement`. Stable source styling starts at `data-slot="button-group"`; documented child slots are recorded in `button-group.anatomy.json`. User-facing labels and status messages are consumer-localizable.

## Source records

The exact five-key source manifest, schema-valid metadata, API, anatomy, required story-state policy, accessibility contract, and honest promotion delta live beside the implementation. Generation must derive package and registry outputs from these files; do not edit generated outputs by hand.

## Promotion boundary

Promotion still requires generated-output drift checks, immutable CI, independent packed consumers, package/source behavioral parity, Semantic Sync fixtures, reviewed visual evidence, and current manual keyboard, forced-colors, NVDA/Firefox, and VoiceOver/Safari records bound to the exact candidate digest.
