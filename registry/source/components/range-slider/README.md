# RangeSlider canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`RangeSlider` selects two or more ordered values with one separately named native range input per thumb. It extends the same React Aria and Mergora `SliderBase` behavior as the single-value `Slider`: locale-formatted output and accessible value text, horizontal or vertical geometry, RTL-aware horizontal input, step-aligned marks, touch drag, full keyboard operation, and native form reset.

The collision policy is deliberately fixed to `clamp`. Thumbs may meet, but they never cross, swap indices, or exchange semantic identity. Values must arrive in non-decreasing order. Default labels identify the first and last thumbs as minimum and maximum; production use should supply domain-specific `thumbLabels`, such as “Minimum allocation” and “Maximum allocation.” Optional `names` are also count-aligned, non-empty, and distinct so a form never loses a boundary.

`readOnly` keeps every thumb focusable and every named value successful in forms while capturing value-changing keyboard and pointer starts. The focus targets expose `aria-readonly` and share a localized `readOnlyMessage` description for native accessibility mappings that omit the property. `disabled` removes all thumbs from interaction and native successful controls. Invalid state is programmatic on every thumb and is reinforced with a non-color rail treatment.

Promotion requires generated artifacts, package/source parity, multi-thumb form and reset evidence, collision and overlapping-thumb tests, localized accessible value text, horizontal/vertical/RTL geometry, keyboard and drag cancellation coverage, narrow and forced-color review, and current manual assistive-technology sessions.
