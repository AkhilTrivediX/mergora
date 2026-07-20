# Diff Viewer

Presents unified and split tabular diffs with non-color markers, roving row focus, and copy feedback.

```tsx
<DiffViewer label="Source changes" lines={lines} mode="split" />
```

## Mergora advantage

Semantic change summaries, non-color markers, copy feedback, controlled selection, and bounded row navigation make a diff inspectable without replacing its native table. Set `showSummary={false}`, `copyable={false}`, and `lineNavigation={false}` independently; each removes its UI, handlers, focus model, callbacks, and announcements while preserving readable diff rows.

## Contract

A labelled region contains a native table. Every change has a visible symbol, spoken kind, line numbers, and text; one row is in the tab order and vertical/Home/End/Page keys navigate rows.

Stable styling hooks are `[data-slot="diff-viewer"]`, `[data-slot="diff-copy"]`, `[data-slot="diff-line"]`, `[data-slot="diff-marker"]`. APIs accept documented native attributes, `className`, `style`, and refs without making private DOM a public dependency. Logical properties, tokenized typography, forced-colors fallbacks, and long-value wrapping are part of the source contract.

## Large content and limitations

Large inputs use bounded native scrolling and caller-controlled chunking; virtualization is not implemented or claimed and remains a measured promotion decision.

All built-in controls, results, summaries, headers, line-kind/state descriptions, and empty text
resolve through stable `diffViewer.*` message keys. The summary receives numeric `added` and
`removed` values and its English fallback uses ECMA-402 number/plural formatters. Line templates
receive named `kind`, `oldLine`, `newLine`, and `content` values for grammatical reordering.
Explicit copy-label props take precedence over provider messages.

Current status is `source-present-unreleased`. Generated distribution, packed-consumer parity, updater fixtures, supported-browser evidence, current Risk Class 2 manual review, public-site dogfooding, and an approved Quality Passport remain mandatory before promotion. No Stable, manual accessibility, virtualization, package, registry, or publication claim is made.
