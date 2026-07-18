# Center

`Center` centers direct children on the inline axis, block axis, or both without inventing a fixed height or clipping overflow. Semantic maximums use `min(100%, token)` so centered content still fits a 320 CSS pixel container.

```tsx
<Center axis="inline" maximum="prose">
  <article>Long-form release notes</article>
</Center>
```

Block-axis centering only uses block size supplied by the surrounding layout. The default `text="start"` keeps long text readable; choose centered text independently when the content warrants it.

The stable root is `[data-slot="center"]` with `data-axis`, `data-maximum`, and `data-text`. Center adds no region or presentation role and never reorders content.

Current status is `source-present-unreleased`; distribution generation, browser reflow and focus evidence, packed-consumer parity, updater fixtures, manual review, public-site dogfooding, and an approved Passport remain outstanding.
