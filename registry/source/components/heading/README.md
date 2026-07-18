# Heading

Requires an explicit semantic heading level or heading element while keeping visual scale independent.

```tsx
<Heading level={2} size="lg">
  Quality evidence
</Heading>
```

## Contract

The public type requires level or as, so placement cannot silently fall back to a generic element. Consumers remain responsible for a non-skipping document outline.

Stable styling hooks are `[data-slot="heading"]`. APIs accept documented native attributes, `className`, `style`, and refs without making private DOM a public dependency. Logical properties, tokenized typography, forced-colors fallbacks, and long-value wrapping are part of the source contract.

## Large content and limitations

A component cannot infer the surrounding document outline; automated hierarchy integration and manual outline review remain promotion gates.

Current status is `source-present-unreleased`. Generated distribution, packed-consumer parity, updater fixtures, supported-browser evidence, current Risk Class 1 manual review, public-site dogfooding, and an approved Quality Passport remain mandatory before promotion. No Stable, manual accessibility, virtualization, package, registry, or publication claim is made.
