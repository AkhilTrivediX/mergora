# Client Only

`ClientOnly` renders a required fallback during SSR and the first hydration pass, then replaces it after the mount effect. It introduces no wrapper element, so block, list, table, and phrasing content retain valid structure. This structure-safe fallback contract is the Mergora advantage over ad hoc mounted-state snippets.

```tsx
<ClientOnly fallback={<p role="status">Map controls require JavaScript.</p>}>
  <InteractiveMap />
</ClientOnly>
```

Pass `onClientReady` only when an integration needs a one-shot post-mount handshake. Omitting it removes the callback entirely: no event is emitted, no DOM or accessibility node is added, and fallback replacement remains unchanged. The hook is guarded against React Strict Mode's repeated effect setup.

Use this boundary only for content whose behavior genuinely depends on browser APIs. It is not a way to suppress a hydration warning or defer deterministic server-compatible UI. The fallback should be localized, accurate, layout-stable, and expose busy/status semantics only when those semantics are true.

ClientOnly does not announce replacement or move focus. Consumers own both policies if the change is user-relevant or the fallback can receive focus. The fallback is required even when `onClientReady` is omitted.

Current status is `source-present-unreleased`. Exact SSR/first-hydration parity, no-JavaScript, structural validity, focus, layout stability, screen-reader, packed-consumer, parity, Semantic Sync, and Quality Passport evidence remain required.
