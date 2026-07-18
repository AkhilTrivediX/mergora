# Checkbox canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`Checkbox` keeps one real native checkbox as its ref and successful control. Checked controls submit `name=value`; unchecked and disabled controls are omitted exactly as HTML defines. Indeterminate is a visual/programmatic mixed state, not a third submitted value. Uncontrolled checked and indeterminate defaults are restored on native form reset; controlled owners remain authoritative.

Item descriptions sit outside the native label and are referenced with a hydration-safe `aria-describedby` ID, so they do not inflate the accessible name. A controlled indeterminate value is reasserted after native click clearing unless the owner changes it. Native `className` and `style` target the checkbox; `rootClassName` and `rootStyle` target its visual wrapper.

Provide non-empty label children, a surrounding `Field`, `aria-label`, `aria-labelledby`, or a non-empty associated native label; development builds warn when no accessible name source exists. The component's own empty wrapper label is not mistaken for a valid name source. Field owns the integrated control ID and reports a conflicting child ID. Native `aria-invalid` values including `grammar` and `spelling` are preserved while visual styling and Field error linkage are derived separately.

Promotion requires checked/unchecked/mixed submission and reset, group composition, touch, narrow/RTL/forced-colors, generated consumers, package/source parity, Semantic Sync, and current manual evidence.
