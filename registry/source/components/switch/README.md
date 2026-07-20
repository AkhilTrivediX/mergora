# Switch canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

The compact Ink track, Green on-state, strong label hierarchy, restrained corners, and Violet two-layer focus seam match the Mergora field family. Native-style explicit on/off serialization is independently enabled by `name`; omitting it removes the hidden successful control without changing switch UI, events, or semantics.

`Switch` is a native button with `role=switch` and synchronized `aria-checked`, not a checkbox restyled under an ambiguous name. A same-form hidden successful control is emitted only when `name` is provided and always serializes the explicit `onValue` or `offValue`; consumers never have to infer unchecked omission. The button never submits the form. Uncontrolled state returns to `defaultValue` on native reset; controlled state remains owner-controlled.

Default state text resolves through the stable `switch.on` and `switch.off` MergoraProvider keys; explicit ReactNode labels win. These localized display strings never alter machine values. The visible on/off text is hidden from the accessibility tree because `aria-checked` already exposes that state; the accessible name therefore remains stable while toggling. An accessible name must come from children, `aria-label`, or `aria-labelledby`; development builds warn when it is missing and when an explicitly supplied visible on/off label is empty.

When supplied, `name` and external `form` IDs must be non-blank, while `onValue` and `offValue` must be distinct. Both the button and hidden input receive the same external form association. `required` is intentionally unsupported: a hidden input cannot represent a real switch constraint, so consumers must validate required-on policy explicitly. Promotion requires keyboard/pointer/touch, explicit on/off `FormData`, external `form` association, reset, RTL/reduced-motion/forced-colors, generated consumers, parity, Semantic Sync, and current manual evidence.
