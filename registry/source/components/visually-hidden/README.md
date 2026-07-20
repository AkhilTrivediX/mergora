# Visually Hidden

`VisuallyHidden` keeps localized text in the accessibility tree while removing its visual layout footprint. It never uses `display: none`, `visibility: hidden`, `hidden`, or `aria-hidden`.

```tsx
<button type="button">
  <UploadIcon aria-hidden="true" />
  <VisuallyHidden>Upload invoice</VisuallyHidden>
</button>
```

Use `as="a"` with `revealOnFocus` for skip links and similar focusable content. The Mergora focus treatment restores a literal white, ink-bordered surface at the logical start edge and uses system colors under forced-colors. With `revealOnFocus={false}` (the default), the reveal attribute, visual surface, and focus-reveal behavior are absent while the content remains available to accessibility APIs. Do not create a focusable permanently hidden element in that mode. Choose `as="div"` only where a block container is valid; the default is `span`.

Consumers own the text, the target of any skip link, and the decision that a second screen-reader-only copy will not create duplicate announcement noise.

Current status is `source-present-unreleased`. Browser accessibility-tree, focus, zoom, text-spacing, RTL, forced-colors, packed-consumer, manual screen-reader, Semantic Sync, and Quality Passport evidence remain required.
