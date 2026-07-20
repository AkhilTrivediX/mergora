# Prose

Provides bounded, tokenized authored-content styling without changing descendant semantics or requiring client JavaScript.

```tsx
<Prose>
  <h2>Install safely</h2>
  <p>Own the source.</p>
</Prose>
```

## Mergora advantage

Intrinsic reading measures, size modes, semantic descendant rhythm, and `data-prose-unstyled` opt-out islands provide authored-content structure without parsing HTML. Set `measure="none"`, keep `size="default"`, or mark a subtree `data-prose-unstyled` to remove each enhancement without adding roles, events, or accessibility output.

## Contract

Prose adds no roles and does not parse or inject HTML. It styles native descendants while data-prose-unstyled provides a local widget escape hatch.

Stable styling hooks are `[data-slot="prose"]`. APIs accept documented native attributes, `className`, `style`, and refs without making private DOM a public dependency. Logical properties, tokenized typography, forced-colors fallbacks, and long-value wrapping are part of the source contract.

## Large content and limitations

Consumers own sanitization of authored HTML and must revalidate third-party widgets placed inside Prose.

Current status is `source-present-unreleased`. Generated distribution, packed-consumer parity, updater fixtures, supported-browser evidence, current Risk Class 1 manual review, public-site dogfooding, and an approved Quality Passport remain mandatory before promotion. No Stable, manual accessibility, virtualization, package, registry, or publication claim is made.
