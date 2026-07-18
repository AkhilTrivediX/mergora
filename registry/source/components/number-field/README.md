# NumberField canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`NumberField` is a locale-aware spinbutton built on React Aria's number state and Mergora's `Field` and provider contracts. Its JavaScript `value`, `defaultValue`, `onChange`, and hidden successful form value are canonical numbers. Only the editable text is localized. `NaN` represents an empty value.

`NumericFieldBase` is the documented derivation surface used by `CurrencyField` and `PercentageField`. Prefer `NumberField` for ordinary numeric entry; use the base only when a new numeric semantic type needs a fixed formatting and value-scale contract.

Focused text is preserved while the user edits or composes. The default `commitBehavior="validate"` reports an out-of-range value rather than unexpectedly clamping or snapping it on blur. Stepper buttons are shown by default. Wheel changes are disabled by default to protect page scrolling. An opt-in scrub button supports primary horizontal drag, pointer cancellation, and equivalent keyboard commands.

Set `precision` when the domain has a fixed maximum decimal precision; it also determines the default step. Explicit `step`, `minValue`, and `maxValue` still describe the domain. Use a visible `Field` label, describe units that are not self-evident, and do not treat display formatting as validation.

Promotion requires generated artifacts, package/source parity, canonical form and reset evidence, locale and non-Latin digit parsing, IME and caret review, mobile and narrow geometry, RTL, forced colors, keyboard, scrub cancellation, and current manual assistive-technology sessions.
