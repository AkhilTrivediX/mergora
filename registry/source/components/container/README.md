# Container

`Container` provides a fluid, centered inline boundary using semantic maximum-width and gutter tokens. It remains a neutral `div`, maps safe-area insets to logical edges, and can opt into anonymous inline-size containment.

```tsx
<Container width="content">
  <main>Page content</main>
</Container>
```

Use `width="prose"` for long-form reading, `wide` for dense work surfaces, and `full` only when the child owns its own line-length limit. `safeArea` is on by default. `queryContainer` does not reserve a global container name, so nested instances remain composable.

The root slot is `[data-slot="container"]`; `data-width`, `data-gutter`, `data-safe-area`, and `data-query-container` are documented styling hooks. Consumer CSS must use logical properties and must not introduce clipping that hides focus indicators.

Current status is `source-present-unreleased`. Package output, browser reflow/safe-area evidence, packed-consumer parity, updater fixtures, manual review, public-site dogfooding, and an approved Quality Passport remain required before promotion.
