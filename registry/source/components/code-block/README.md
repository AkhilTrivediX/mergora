# Code Block

Combines a labelled, scrollable pre/code region with line emphasis and resilient clipboard feedback.

```tsx
<CodeBlock code="pnpm test" label="Verification command" filename="package.json" />
```

## Contract

A named region contains native pre/code content. Highlighted lines add spoken text, weight, and an outline; copy completion is announced in a concise status node.

Stable styling hooks are `[data-slot="code-block"]`, `[data-slot="code-block-copy"]`, `[data-slot="code-block-scroll"]`, `[data-slot="code-block-line"]`. APIs accept documented native attributes, `className`, `style`, and refs without making private DOM a public dependency. Logical properties, tokenized typography, forced-colors fallbacks, and long-value wrapping are part of the source contract.

## Large content and limitations

The component uses bounded native scrolling rather than virtualization and does not tokenize source; callers can render tokens, but every token scheme must retain non-color cues.

Current status is `source-present-unreleased`. Generated distribution, packed-consumer parity, updater fixtures, supported-browser evidence, current Risk Class 2 manual review, public-site dogfooding, and an approved Quality Passport remain mandatory before promotion. No Stable, manual accessibility, virtualization, package, registry, or publication claim is made.

Built-in text resolves through the stable `codeBlock.copy`, `codeBlock.copied`,
`codeBlock.copyError`, `codeBlock.source`, and `codeBlock.highlighted` message keys. Explicit
copy-label props take precedence over provider messages. `codeBlock.source` receives a `label`
value and may reorder it.
