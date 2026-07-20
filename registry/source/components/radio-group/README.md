# Radio Group canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

Literal Canvas options, strong Ink indicators, Green selection, Violet two-layer focus, and restrained optional card previews provide the Mergora signature. `variant="plain"` with no item description removes the richer preview surface while preserving the same native radios and keyboard model.

One native fieldset/legend owns one same-name native radio per option. Native validation, successful-control serialization, reset, and form association remain intact. Arrow, Home, and End keys move focus and selection; horizontal movement follows visual direction in RTL. Card styling never adds a duplicate proxy control.

Group names and direct item values must be non-blank, and item values must be unique. Development builds diagnose empty group/item labels, groups with no direct items, and a selected value with no direct item. A group `form` association propagates to every radio for external-form FormData and reset. Native `className`, `style`, attributes, and ref target the input; `rootClassName` and `rootStyle` target the item wrapper. Exact group and item `aria-invalid` tokens are preserved and merged with group errors when semantically invalid. If an item handler already prevents a key event, the group does not move focus or selection.

Item descriptions render outside the native label and are referenced through hydration-safe `aria-describedby` IDs, so the description does not inflate the accessible name. Group description and error IDs are also merged onto each radio.

Promotion requires exact APG keyboard sequences, no-selection/required validation, controlled and reset behavior, RTL, touch, narrow/forced-colors, generated consumers, package/source parity, Semantic Sync, and current manual evidence.
