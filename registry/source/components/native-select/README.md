# Native Select canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

This is a styled native `select`, not a custom popup. The browser owns touch/mobile pickers, keyboard behavior, option semantics, form validation, reset, and serialization. Single-select submits one selected value; `multiple` submits one same-name entry per selected option. The decorative indicator is never an extra control.

Mergora adds an independently optional `selectionContext` rail for concise selected-value consequences or provenance. It is associated through `aria-describedby`; omitting it, or passing empty content, removes the rail and relationship without changing native selection behavior.

Field owns the ID for integrated usage and reports conflicting child IDs in development. Native `aria-invalid` values are preserved without collapsing `grammar` or `spelling`. The decorative picker chevron is omitted for `multiple` and for `size > 1`, where the native control is presented as a listbox.

Native `className` and `style` target the real select. Use `rootClassName` and `rootStyle` only for the visual wrapper.

Promotion requires mobile-picker review, multi-value `FormData`, reset, narrow/RTL/forced-colors, generated consumers, package/source parity, Semantic Sync, and current manual evidence.
