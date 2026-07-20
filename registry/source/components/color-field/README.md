# ColorField canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

The exact Canvas editor, strong Ink boundary, tabular canonical output, Green valid signal, Violet focus seam, and restrained status structure give ColorField a recognizable Mergora identity. Preview and contrast analysis remain independently removable through `showPreview` and `showContrast`.

`ColorField` edits one typed, immutable 8-bit sRGB value. `createSrgbColor` validates integer red, green, blue, and alpha channels from 0 through 255. The text surface supports hexadecimal, numeric comma-separated RGB/RGBA, and HSL/HSLA. Fractional RGB and alpha input is rounded to the nearest 8-bit channel. HSL converts deterministically into the canonical 8-bit sRGB model; it is not retained as a separate wide-gamut or authoring-space value.

`alphaPolicy="opaque"` is the default and rejects non-opaque input or controlled values. `alphaPolicy="allow"` stores alpha as an eighth bit channel and always serializes a successful form value as lowercase `#rrggbbaa`; opaque policy serializes `#rrggbb`. The visible, possibly incomplete text is never submitted as the canonical value.

Invalid or incomplete text remains visible while the last accepted typed value, preview, contrast calculation, and form value stay unchanged. Enter commits, Escape restores, and blur validates. A valid controlled commit remains visible as a `data-pending` draft while the owner update is delayed; preview and form data continue to expose the accepted `value` prop until the owner accepts or replaces the request. Repeated Enter does not emit the same pending request twice. IME composition is never committed mid-sequence. Native text selection, paste, undo, and platform editor keys remain available.

Form reset is observed after the reset event finishes, so a later listener may cancel it with `preventDefault()`. An uncancelled reset restores the uncontrolled default or requests the default once from a controlled owner.

The optional preview includes both a visual sample and canonical text. The contrast output composites alpha against the explicit opaque `contrastBackground`, reports a numeric ratio, compares it with the configurable reference threshold, and always tells the consumer to verify text size and final rendered colors. It is deliberately not a WCAG or component-conformance badge.

Use `Field` for the persistent visible label, description, required state, and workflow error. Localize the `messages` object. Promotion still requires generated artifacts, packed consumers, package/source parity, exhaustive conversion and form evidence, narrow/RTL/forced-colors verification, Semantic Sync fixtures, and current Risk Class 2 manual assistive-technology records.
