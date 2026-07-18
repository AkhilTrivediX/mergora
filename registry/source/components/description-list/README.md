# Description List

Keeps native dl/dt/dd relationships while adapting name/value geometry to its container.

```tsx
<DescriptionList>
  <DescriptionTerm>Version</DescriptionTerm>
  <DescriptionDetails>0.1.0</DescriptionDetails>
</DescriptionList>
```

## Contract

The public parts render only native dl, dt, and dd elements. CSS changes columns without reordering the DOM or fabricating table roles.

Stable styling hooks are `[data-slot="description-list"]`, `[data-slot="description-term"]`, `[data-slot="description-details"]`. APIs accept documented native attributes, `className`, `style`, and refs without making private DOM a public dependency. Logical properties, tokenized typography, forced-colors fallbacks, and long-value wrapping are part of the source contract.

## Large content and limitations

Consumers must preserve valid term/detail ordering and supply an appropriate surrounding heading when the list needs a visible title.

Current status is `source-present-unreleased`. Generated distribution, packed-consumer parity, updater fixtures, supported-browser evidence, current Risk Class 1 manual review, public-site dogfooding, and an approved Quality Passport remain mandatory before promotion. No Stable, manual accessibility, virtualization, package, registry, or publication claim is made.
