# Client Only

`ClientOnly` renders a required fallback during SSR and the first hydration pass, then replaces it after the mount effect. It introduces no wrapper element, so block, list, table, and phrasing content retain valid structure.

```tsx
<ClientOnly fallback={<p role="status">Map controls require JavaScript.</p>}>
  <InteractiveMap />
</ClientOnly>
```

Use this boundary only for content whose behavior genuinely depends on browser APIs. It is not a way to suppress a hydration warning or defer deterministic server-compatible UI. The fallback should be localized, accurate, layout-stable, and expose busy/status semantics only when those semantics are true.

ClientOnly does not announce replacement or move focus. Consumers own both policies if the change is user-relevant or the fallback can receive focus.

Current status is `source-present-unreleased`. Exact SSR/first-hydration parity, no-JavaScript, structural validity, focus, layout stability, screen-reader, packed-consumer, parity, Semantic Sync, and Quality Passport evidence remain required.
