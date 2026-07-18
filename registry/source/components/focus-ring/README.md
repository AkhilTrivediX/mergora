# Focus Ring

`FocusRing` applies Mergora's shared `:focus-visible` treatment to exactly one concrete child without adding a DOM wrapper or changing its semantic element.

```tsx
<FocusRing contrast="strong">
  <button type="button">Review changes</button>
</FocusRing>
```

`standard` uses the tokenized outer outline. `strong` adds an inner canvas contrast layer for controls placed on unpredictable surfaces. Forced-colors removes the shadow layers and restores an explicit system `Highlight` outline. The child retains its own `data-slot`; focus behavior is identified by `data-focus-ring` and `data-focus-ring-contrast`.

Consumers must keep the child natively focusable, avoid ancestor clipping, and re-verify indicator area and adjacent-color contrast after token or CSS overrides.

Current status is `source-present-unreleased`. Cross-browser modality, measured focus appearance, zoom, forced-colors, packed-consumer, parity, Semantic Sync, manual, dogfood, and Quality Passport evidence remain required.
