# Toggle Group canonical source

Status: source present and unreleased. Local tests may exist, but no immutable release or manual assistive-technology evidence is attached. This directory makes no Stable or conformance claim.

A controlled or uncontrolled single/multiple pressed-button collection with roving focus.

## Contract

- Exactly one enabled item receives `tabIndex=0` during SSR and every render, including multi-select, dynamic removal, and selected-disabled cases; roving focus supports Home, End, orientation arrows, RTL spatial arrows, wrapping, and disabled skipping.
- Arrow movement never changes selection; native activation does.
- Single selection cannot become empty unless allowEmpty is explicit.

The public ref resolves to `HTMLDivElement`. Stable source styling starts at `data-slot="toggle-group"`; documented child slots are recorded in `toggle-group.anatomy.json`. User-facing labels and status messages are consumer-localizable.

## Source records

The exact five-key source manifest, schema-valid metadata, API, anatomy, required story-state policy, accessibility contract, and honest promotion delta live beside the implementation. Generation must derive package and registry outputs from these files; do not edit generated outputs by hand.

## Promotion boundary

Promotion still requires generated-output drift checks, immutable CI, independent packed consumers, package/source behavioral parity, Semantic Sync fixtures, reviewed visual evidence, and current manual keyboard, forced-colors, NVDA/Firefox, and VoiceOver/Safari records bound to the exact candidate digest.
