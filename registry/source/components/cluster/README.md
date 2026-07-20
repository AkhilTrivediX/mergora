# Cluster

`Cluster` wraps actions, tags, or compact metadata while keeping DOM, reading, focus, and visual order aligned. The default `orphan="start"` leaves a lone final item on the logical leading edge instead of forcing awkward distribution.

```tsx
<Cluster gap="sm">
  <button type="button">Run checks</button>
  <button type="button">View evidence</button>
  <a href="/contracts">Read contract</a>
</Cluster>
```

`orphan="fill"` lets only the final child grow and is an explicit opt-in for controls designed to stretch. Cluster is otherwise semantically neutral; use a list, toolbar, fieldset, or navigation parent when that behavior applies.

The stable root slot is `[data-slot="cluster"]`, with gap, alignment, justification, and orphan attributes. All alignment uses logical start/end behavior.

Current status is `source-present-unreleased`; generation, narrow/zoom/focus browser evidence, packed-consumer parity, updater fixtures, manual review, public-site dogfooding, and a Passport remain promotion deltas.

## Mergora advantage

`orphan="fill"` lets a deliberate final action use the remaining wrapped row without turning every item into an equal-width pill. `orphan="start"` disables that growth behavior completely and preserves the ordinary logical-leading layout.
