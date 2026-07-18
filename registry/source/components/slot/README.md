# Slot

`Slot` merges Mergora behavior into exactly one concrete React element while preserving that element's native semantics, accessible-name attributes, style values, handlers, and ref.

```tsx
<Slot className="consumer-action" onClick={recordActivation} data-slot="toolbar-action">
  <button type="button" aria-label="Archive conversation" />
</Slot>
```

Child handlers run first; calling `preventDefault()` prevents the Slot handler. Slot classes precede child classes, child style values win, and both refs receive the same node. Explicit Slot `data-*`, `dir`, and `lang` attributes identify the composing public context. An explicit Slot `data-slot` wins; otherwise a child slot is preserved, then `slot` is used. Other native and accessible-name props remain child-authoritative. Fragments, text, arrays, and multiple children fail with a precise error.

Slot never makes a `div` into a button. Consumers must select the correct native element and retest keyboard behavior and accessible names after changing it.

Current status is `source-present-unreleased`. Browser ref/event/name/semantic evidence, packed consumers, package/source parity, Semantic Sync, manual keyboard/screen-reader review, dogfooding, and an approved Passport remain required.
