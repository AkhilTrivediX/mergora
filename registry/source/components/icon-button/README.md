# Icon Button canonical source

Status: source present and unreleased. Local tests may exist, but no immutable release or manual assistive-technology evidence is attached. This directory makes no Stable or conformance claim.

A named, touch-comfortable native button for icon actions with tooltip and pending integration.

## Contract

- The required label is the accessible name and the tooltip never substitutes for it.
- Pending remains focusable, exposes busy semantics, and blocks activation.
- Every size is at least 44 by 44 CSS pixels.

The public ref resolves to `HTMLButtonElement`. Stable source styling starts at `data-slot="icon-button"`; documented child slots are recorded in `icon-button.anatomy.json`. User-facing labels and status messages are consumer-localizable.

## Source records

The exact five-key source manifest, schema-valid metadata, API, anatomy, required story-state policy, accessibility contract, and honest promotion delta live beside the implementation. Generation must derive package and registry outputs from these files; do not edit generated outputs by hand.

## Promotion boundary

Promotion still requires generated-output drift checks, immutable CI, independent packed consumers, package/source behavioral parity, Semantic Sync fixtures, reviewed visual evidence, and current manual keyboard, forced-colors, NVDA/Firefox, and VoiceOver/Safari records bound to the exact candidate digest.
