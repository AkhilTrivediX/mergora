# Slider canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`Slider` selects one discrete number. It is built on React Aria's slider state, pointer model, keyboard handling, localization, and visually hidden native range input. Use a persistent `Field` label. `formatOptions` formats both the visible output and accessible value text without changing the canonical number submitted by the form.

The domain is deliberately strict: minimum, maximum, values, and marks must be finite; the maximum and every value must be reachable from the minimum in whole steps. This prevents the visible marks, keyboard endpoints, callbacks, and submitted value from describing different domains.

Horizontal and vertical orientations share the same API. Horizontal direction follows the provider's LTR or RTL locale semantics. Marks are visual context and never the only operation path: Arrow keys, Page Up, Page Down, Home, End, pointer track presses, and thumb drag all reach the same state. At narrow widths, intermediate mark labels can hide while the endpoints remain.

The Mergora signature is a literal-canvas measurement rail, an ink boundary, green committed range, compact squared thumb, and violet focus geometry, all expressed through semantic tokens. `intelligentMarks={{ maximumVisible: 7, strategy: "meaningful" }}` derives a bounded localized scale from the exact domain and step. `showValueBubbles` keeps formatted visual values attached to thumbs without duplicating their accessible value text. Both enhancements default to off. Set `intelligentMarks={false}` to use manual `marks`; when either enhancement is disabled its attributes, visual parts, and accessibility output are absent.

`readOnly` is distinct from `disabled`: the thumb remains focusable and its named native input remains successful in forms, while value-changing keyboard, pointer, mouse, and touch starts are captured. The actual slider focus target receives `aria-readonly`; because some native range accessibility mappings omit that property, every read-only thumb also receives a localized `readOnlyMessage` description. Use plain text instead if the value no longer benefits from slider semantics.

Promotion requires generated artifacts, package/source parity, native form and reset evidence, localized accessible value text, intelligent-mark density and opt-out evidence, horizontal/vertical/RTL geometry, keyboard and drag cancellation coverage, narrow and forced-color review, and current manual assistive-technology sessions.
