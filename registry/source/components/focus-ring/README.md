# Focus Ring

`FocusRing` applies Mergora's shared `:focus-visible` treatment to exactly one concrete child without adding a DOM wrapper or changing its semantic element.

```tsx
<FocusRing contrast="strong">
  <button type="button">Review changes</button>
</FocusRing>
```

`standard` uses a Deep Violet outer outline separated from the control by a one-pixel Canvas seam, so focus remains distinct from green selection and pressed states. `strong` independently increases both the seam and outline geometry for controls placed on unpredictable surfaces. Leaving `contrast` unset disables that enhancement and restores standard geometry without adding UI, events, motion, or accessibility output. Forced-colors removes the Canvas layer and restores an explicit three-pixel system `Highlight` outline. The child retains its own `data-slot`; focus behavior is identified by `data-focus-ring` and `data-focus-ring-contrast`.

The local `--mrg-focus-ring-color`, `--mrg-focus-ring-contrast-color`, `--mrg-focus-ring-gap`, `--mrg-focus-ring-offset`, and `--mrg-focus-ring-width` properties are deliberate escape hatches. Overrides must retain the two-cue geometry and measured contrast. No focus animation is applied, so the indicator is immediate in default and reduced-motion environments.

Consumers must keep the child natively focusable, avoid ancestor clipping, and re-verify indicator area and adjacent-color contrast after token or CSS overrides.

Current status is `source-present-unreleased`. Cross-browser modality, measured focus appearance, zoom, forced-colors, packed-consumer, parity, Semantic Sync, manual, dogfood, and Quality Passport evidence remain required.
