# ColorPicker canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`ColorPicker` coordinates React Aria's color area, color sliders, and swatch collection with Mergora's typed 8-bit sRGB `ColorField`. The two-dimensional area edits saturation and brightness, but it is never the sole route: visible, individually named hue, saturation, brightness, and optional opacity sliders expose complete native-range keyboard alternatives. The exact text editor provides hexadecimal, RGB, and HSL entry and owns validation recovery and canonical form serialization.

The picker defaults to `alphaPolicy="allow"`; set `opaque` for domains that must reject transparency. Every area, slider, swatch, text, preview, contrast, and form surface is derived from one immutable RGBA8 value. Controlled mode requests changes without maintaining a second selected value. Native form reset restores the uncontrolled default or requests that default from the controlled owner.

Swatches are a named single-selection collection. Each preset includes canonical text, and selection adds a check, border geometry, and weight rather than relying on fill color. In forced-colors mode, authored gradients and swatch fills are suppressed while system borders, focus, selection, labels, outputs, range semantics, and exact text remain operable. Narrow layouts change the area proportion and stack channel and swatch grids without two-dimensional page scrolling.

Use `Field` for the persistent visible label, description, required state, and workflow error. Localize `messages`, `fieldMessages`, and custom swatch labels. Promotion requires generated artifacts, packed consumers, package/source parity, cross-browser pointer/touch/cancellation and channel parity, native form/reset and validation evidence, narrow/RTL/forced-colors verification, Semantic Sync fixtures, and current desktop/mobile Risk Class 2 assistive-technology records.
