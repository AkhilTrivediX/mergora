# Action Menu canonical source

Status: source present and unreleased. Local tests may exist, but no immutable release or manual assistive-technology evidence is attached. This directory makes no Stable or conformance claim.

A React Aria MenuTrigger/Menu/Popover composition with shared LayerManager registration, provider locale and direction propagation, focus return, collision-aware anchoring, typeahead, and an explicit destructive confirmation step.

## Contract

- React Aria owns the Popover portal, anchoring/collision, collection, typeahead, dismissal, and focus model; wrapping it in the separate Mergora Portal would create a second overlay boundary and is intentionally prohibited.
- The shared LayerManager registers the active RAC layer as non-dismissible, so global stacking remains observable while RAC alone owns Escape.
- The nearest MergoraProvider locale is bridged into RAC I18nProvider for locale-correct matching and typeahead. Direction remains independent: public `start`/`end` placement is mapped to physical left/right edges before crossing the RAC portal.
- Item ids remain the consumer's React Aria collection keys and must be non-empty and unique. Generated index-based description DOM ids keep `aria-describedby` valid when keys contain spaces or punctuation.
- Open focuses the first or last enabled item and Escape returns focus to the trigger.
- Destructive actions require a second activation with explicit confirmation text.

## Mergora identity and advantage

The literal Canvas trigger, Ink structure, Violet two-layer focus seam, and bordered workbench overlay share the family signature. `confirmDestructiveActions` is the useful Mergora safeguard and defaults to `true`; setting it to `false` removes confirmation state, replacement text, and the extra activation while preserving ordinary menu behavior.

The public ref resolves to `HTMLButtonElement`. Stable source styling starts at `data-slot="action-menu"`; documented child slots are recorded in `action-menu.anatomy.json`. User-facing labels and status messages are consumer-localizable.

## Source records

The exact five-key source manifest, schema-valid metadata, API, anatomy, required story-state policy, accessibility contract, and honest promotion delta live beside the implementation. Generation must derive package and registry outputs from these files; do not edit generated outputs by hand.

## Promotion boundary

Promotion still requires generated-output drift checks, immutable CI, independent packed consumers, package/source behavioral parity, Semantic Sync fixtures, reviewed visual evidence, and current manual keyboard, forced-colors, NVDA/Firefox, and VoiceOver/Safari records bound to the exact candidate digest.
