# Text

Maps readable text to a closed set of semantic elements, visual roles, and a focus/touch-reveal truncation contract.

```tsx
<Text as="p" size="lg">
  Evidence remains readable.
</Text>
```

## Contract

The chosen native text element is preserved. Truncated values become focusable and expose their complete string as an accessible name, title, and focus/touch expansion.

Stable styling hooks are `[data-slot="text"]`. APIs accept documented native attributes, `className`, `style`, and refs without making private DOM a public dependency. Logical properties, tokenized typography, forced-colors fallbacks, and long-value wrapping are part of the source contract.

## Large content and limitations

Truncating non-text children requires fullValue; promotion still requires touch and screen-reader verification of the reveal path.

Current status is `source-present-unreleased`. Generated distribution, packed-consumer parity, updater fixtures, supported-browser evidence, current Risk Class 1 manual review, public-site dogfooding, and an approved Quality Passport remain mandatory before promotion. No Stable, manual accessibility, virtualization, package, registry, or publication claim is made.
