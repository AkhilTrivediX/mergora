# Grid

`Grid` is a two-dimensional intrinsic layout primitive. Its default `columns="auto"` recipe uses `auto-fit` and a bounded `minmax`, so columns collapse naturally without media-query or viewport assumptions.

```tsx
<Grid element="ul" minimum="compact" listStyle="none">
  <li>Keyboard evidence</li>
  <li>Responsive evidence</li>
  <li>Consumer parity</li>
</Grid>
```

The restricted `element` union is `div | section | ul | ol`. CSS Grid does not grant interactive-grid semantics: never add `role="grid"` unless the complete ARIA grid interaction model is implemented. For native list roots, render `li` children.

The stable root is `[data-slot="grid"]`; documented attributes cover element, columns, minimum, gap, alignment, and list style. Auto mode is the responsive default. Fixed columns remain fluid but can become intentionally narrow.

Current status is `source-present-unreleased`; generated outputs, responsive browser evidence, clean consumers, parity, updater fixtures, manual review, site dogfooding, and an approved Passport remain required.

## Mergora advantage

The intrinsic auto-fit baseline uses semantic minimums rather than consumer-authored breakpoints. Optional `equalRows` aligns uneven evidence rows across the grid; `equalRows={false}` removes the implicit-row override while fixed or auto-fit columns remain independently selectable.
