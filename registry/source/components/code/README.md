# Code

Renders selectable inline code with explicit wrapping or native horizontal overflow.

```tsx
<Code>pnpm add mergora-ui</Code>
```

## Mergora advantage

Long inline values can choose wrapping or owned horizontal overflow, while `isolateBidi` protects machine text from surrounding bidirectional reordering. Set `wrap={false}` and `isolateBidi={false}` for an ordinary native code element without either enhancement.

## Contract

The root is native code and remains selectable. No syntax role or fabricated interactive behavior is added.

Stable styling hooks are `[data-slot="code"]`. APIs accept documented native attributes, `className`, `style`, and refs without making private DOM a public dependency. Logical properties, tokenized typography, forced-colors fallbacks, and long-value wrapping are part of the source contract.

## Large content and limitations

Inline Code does not perform syntax highlighting; use CodeBlock for labelled multiline content and copy behavior.

Current status is `source-present-unreleased`. Generated distribution, packed-consumer parity, updater fixtures, supported-browser evidence, current Risk Class 1 manual review, public-site dogfooding, and an approved Quality Passport remain mandatory before promotion. No Stable, manual accessibility, virtualization, package, registry, or publication claim is made.
