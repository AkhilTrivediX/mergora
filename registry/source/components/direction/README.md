# Direction

`Direction.Provider` supplies an `ltr` or `rtl` value to Mergora descendants without adding DOM. `Direction.Boundary` pairs that context with the native `dir` attribute on a neutral `div`.

```tsx
<Direction.Boundary direction="rtl">
  <AccountSummary />
</Direction.Boundary>
```

The nearest provider wins and the outer direction resumes after the subtree. React context follows portals; use Mergora `Portal` to repeat the native direction at the target. `resolveLogicalSide("start", direction)` exists for integrations that require physical coordinates; public placement APIs should use `start` and `end` directly.

Direction does not isolate arbitrary user text. Use `dir="auto"`, `bdi`, or a documented Unicode-bidi strategy for mixed-direction values, and mirror only icons whose meaning is spatial.

Current status is `source-present-unreleased`. Nested/portal direction, mixed-content, RTL keyboard and reading order, hydration, packed-consumer, parity, Semantic Sync, manual, dogfood, and Quality Passport evidence remain required.
