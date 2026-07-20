# JSON Viewer

Exposes JSON as a labelled ARIA tree with roving focus, controlled expansion, path/value copy, and native scrolling.

```tsx
<JsonViewer label="Registry response" value={{ ok: true, items: ["button"] }} />
```

## Mergora advantage

Controlled path selection, expansion, localized value types, and selected path/value copy make structured data navigable rather than merely syntax-colored. Set `copyable={false}` and `showActivePath={false}` independently to remove the toolbar controls, copy events, status announcements, and visible path context while retaining the labelled ARIA tree.

## Contract

The flat DOM tree supplies aria-level, posinset, setsize, expanded, and selected state. Roving focus follows APG tree arrows, Home/End, Enter/Space, and sibling expansion; toolbar buttons copy the selected path or value.

Stable styling hooks are `[data-slot="json-viewer"]`, `[data-slot="json-tree"]`, `[data-slot="json-tree-item"]`, `[data-slot="json-copy-path"]`, `[data-slot="json-copy-value"]`. APIs accept documented native attributes, `className`, `style`, and refs without making private DOM a public dependency. Logical properties, tokenized typography, forced-colors fallbacks, and long-value wrapping are part of the source contract.

## Large content and limitations

The tree intentionally uses bounded native scrolling. Virtualization is not implemented or claimed; Class 3 scale, mobile AT, voice, switch, and independent manual evidence remain promotion gates.

Built-in controls, copy results, tree/node/path descriptions, expansion states, root label, and
JSON type names resolve through stable `jsonViewer.*` message keys. The `jsonViewer.tree`,
`jsonViewer.node`, and `jsonViewer.path` templates receive named values so translations can reorder
the complete message. Explicit copy-label props take precedence over provider messages.

Current status is `source-present-unreleased`. Generated distribution, packed-consumer parity, updater fixtures, supported-browser evidence, current Risk Class 3 manual review, public-site dogfooding, and an approved Quality Passport remain mandatory before promotion. No Stable, manual accessibility, virtualization, package, registry, or publication claim is made.
