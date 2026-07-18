# Toggle canonical source

Status: source present and unreleased. Local tests may exist, but no immutable release or manual assistive-technology evidence is attached. This directory makes no Stable or conformance claim.

A controlled or uncontrolled native pressed button with pending behavior and naming diagnostics.

## Contract

- aria-pressed, data-state, and the visual state remain synchronized.
- Consumer cancellation prevents the state transition.
- Pending remains focusable and prevents state changes.

The public ref resolves to `HTMLButtonElement`. Stable source styling starts at `data-slot="toggle"`; documented child slots are recorded in `toggle.anatomy.json`. User-facing labels and status messages are consumer-localizable.

## Source records

The exact five-key source manifest, schema-valid metadata, API, anatomy, required story-state policy, accessibility contract, and honest promotion delta live beside the implementation. Generation must derive package and registry outputs from these files; do not edit generated outputs by hand.

## Promotion boundary

Promotion still requires generated-output drift checks, immutable CI, independent packed consumers, package/source behavioral parity, Semantic Sync fixtures, reviewed visual evidence, and current manual keyboard, forced-colors, NVDA/Firefox, and VoiceOver/Safari records bound to the exact candidate digest.
