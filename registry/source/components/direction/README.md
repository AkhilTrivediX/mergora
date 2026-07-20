# Direction

`Direction.Provider` supplies an `ltr` or `rtl` value to Mergora descendants without adding DOM. `Direction.Boundary` pairs that context with the native `dir` attribute on a neutral `div`, preventing React context and the browser bidi algorithm from drifting apart.

```tsx
<Direction.Boundary direction="rtl" isolate>
  <AccountSummary />
</Direction.Boundary>
```

The nearest provider wins and the outer direction resumes after the subtree. React context follows portals; use Mergora `Portal` to repeat the native direction at the target. `resolveLogicalSide("start", direction)` exists for integrations that require physical coordinates; public placement APIs should use `start` and `end` directly.

The optional `isolate` enhancement applies `unicode-bidi: isolate` to the boundary so its ordering cannot leak into surrounding content. With `isolate={false}` (the backward-compatible default), the data attribute and isolation behavior are absent; native `dir` and React context continue to work. This does not infer the direction of arbitrary user text: use `dir="auto"` or `bdi` inside the boundary when values can vary, and mirror only icons whose meaning is spatial.

Current status is `source-present-unreleased`. Nested/portal direction, mixed-content, RTL keyboard and reading order, hydration, packed-consumer, parity, Semantic Sync, manual, dogfood, and Quality Passport evidence remain required.
