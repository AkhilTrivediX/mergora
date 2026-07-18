# Segmented Control canonical source

Status: source present and unreleased. Local tests may exist, but no immutable release or manual assistive-technology evidence is attached. This directory makes no Stable or conformance claim.

A named native radio group with exclusive selection, horizontal overflow, and explicit RTL keyboard behavior.

## Contract

- The fieldset and legend provide native group naming.
- Home, End, and arrows move and select while skipping disabled options.
- The horizontal scroller preserves touch and keyboard access at narrow widths.

The public ref resolves to `HTMLFieldSetElement`. Stable source styling starts at `data-slot="segmented-control"`; documented child slots are recorded in `segmented-control.anatomy.json`. User-facing labels and status messages are consumer-localizable.

## Source records

The exact five-key source manifest, schema-valid metadata, API, anatomy, required story-state policy, accessibility contract, and honest promotion delta live beside the implementation. Generation must derive package and registry outputs from these files; do not edit generated outputs by hand.

## Promotion boundary

Promotion still requires generated-output drift checks, immutable CI, independent packed consumers, package/source behavioral parity, Semantic Sync fixtures, reviewed visual evidence, and current manual keyboard, forced-colors, NVDA/Firefox, and VoiceOver/Safari records bound to the exact candidate digest.
