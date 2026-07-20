# Blockquote

Preserves native blockquote, figure, citation, attribution, and source-link anatomy.

```tsx
<Blockquote attribution="Ada" sourceTitle="Notes">
  Readable systems expose their seams.
</Blockquote>
```

## Mergora advantage

Optional attribution, semantic citation metadata, and a linked source turn a plain quotation into verifiable reference content. Omit `attribution`, `sourceTitle`, and `citeUrl` to remove the caption, link, citation metadata, and associated accessibility output completely.

## Contract

The quotation is a native blockquote inside a figure. Attribution and a semantic cite are grouped in figcaption; citeUrl is applied to both the quote metadata and source link.

Stable styling hooks are `[data-slot="blockquote"]`, `[data-slot="blockquote-quote"]`, `[data-slot="blockquote-caption"]`, `[data-slot="blockquote-source"]`. APIs accept documented native attributes, `className`, `style`, and refs without making private DOM a public dependency. Logical properties, tokenized typography, forced-colors fallbacks, and long-value wrapping are part of the source contract.

## Large content and limitations

Consumers must provide accurate attribution and a trustworthy citation URL; the component cannot verify editorial provenance.

Current status is `source-present-unreleased`. Generated distribution, packed-consumer parity, updater fixtures, supported-browser evidence, current Risk Class 1 manual review, public-site dogfooding, and an approved Quality Passport remain mandatory before promotion. No Stable, manual accessibility, virtualization, package, registry, or publication claim is made.
