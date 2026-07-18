# Link canonical source

Status: source present and unreleased. Local tests may exist, but no immutable release or manual assistive-technology evidence is attached. This directory makes no Stable or conformance claim.

A real anchor for navigation with current, external, download, and standalone target behavior.

## Contract

- href is required and disabled-link semantics are absent from the public type.
- Every resolved `target="_blank"` link receives `noopener noreferrer` while preserving consumer rel tokens. `noreferrer` is intentional privacy hardening and implies `noopener` in current browsers; both tokens remain explicit for auditability.
- Current state has text weight and decoration in addition to color.

The public ref resolves to `HTMLAnchorElement`. Stable source styling starts at `data-slot="link"`; documented child slots are recorded in `link.anatomy.json`. User-facing labels and status messages are consumer-localizable.

## Source records

The exact five-key source manifest, schema-valid metadata, API, anatomy, required story-state policy, accessibility contract, and honest promotion delta live beside the implementation. Generation must derive package and registry outputs from these files; do not edit generated outputs by hand.

## Promotion boundary

Promotion still requires generated-output drift checks, immutable CI, independent packed consumers, package/source behavioral parity, Semantic Sync fixtures, reviewed visual evidence, and current manual keyboard, forced-colors, NVDA/Firefox, and VoiceOver/Safari records bound to the exact candidate digest.
