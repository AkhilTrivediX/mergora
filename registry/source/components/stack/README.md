# Stack

`Stack` creates a vertical intrinsic rhythm with closed semantic gap and alignment choices. Its `element` prop is deliberately limited to `div`, `section`, `ul`, and `ol`; it does not implement arbitrary polymorphism or clone children.

```tsx
<Stack element="section" gap="lg">
  <h2>Release evidence</h2>
  <p>Every claim links to a reproducible check.</p>
</Stack>
```

When using `ul` or `ol`, render `li` children. Native markers and logical indentation are preserved by default; use `listStyle="none"` only when another visible treatment still communicates the list.

The root slot is `[data-slot="stack"]`, with documented `data-element`, `data-gap`, `data-align`, and `data-list-style` hooks. Children receive no role or reordered presentation, so DOM and reading order remain aligned.

Current status is `source-present-unreleased`. Generated distributions, browser reflow/semantic evidence, packed-consumer parity, updater fixtures, manual review, site dogfooding, and an approved Quality Passport remain promotion requirements.

## Mergora advantage

`separated` adds crisp tokenized rules between direct children without extra DOM, roles, or reordered content, including a forced-colors mapping. `separated={false}` removes those rules completely while semantic list rendering and spacing remain intact.
