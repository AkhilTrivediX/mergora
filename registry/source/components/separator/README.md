# Separator

`Separator` separates content visually or semantically in either orientation. Decorative mode is the default and removes the line from the accessibility tree. Semantic horizontal mode renders a native `hr`; semantic vertical mode uses `role="separator"` with `aria-orientation="vertical"`.

```tsx
<Separator decorative={false} />

<div style={{ display: "flex" }}>
  <span>Source</span>
  <Separator decorative={false} orientation="vertical" />
  <span>Package</span>
</div>
```

Separator is never focusable or resizable. Use the later Resizable primitive when the line controls panel size. Vertical separators need a parent that supplies meaningful block size.

The stable root is `[data-slot="separator"]`, with `data-orientation` and `data-decorative`. Forced-colors mode uses `CanvasText` so the line remains visible without a custom color override.

Current status is `source-present-unreleased`; generated outputs, accessibility-tree and high-contrast browser evidence, packed consumers, parity, updater fixtures, manual review, site use, and a Passport remain promotion requirements.
