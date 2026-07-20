# Portal

`Portal` moves content into an explicit target, the nearest `MergoraProvider` target, or `document.body` after mount. React context crosses the portal, and the context boundary repeats native `dir` and `lang` plus density attributes so DOM inheritance remains correct.

```tsx
<Portal fallback={<p role="status">Preparing actions…</p>}>
  <div role="menu" aria-label="Row actions">
    …
  </div>
</Portal>
```

On the server and first hydration pass, a non-disabled portal renders only `fallback`; no document global is read. Omitting `fallback` (or passing `null`) cleanly removes that temporary UI and its accessibility output. Set `disabled` to opt out of portal movement and render the same context wrapper inline on server and client, with no portal event or target lookup. The context-preserving native `dir`, `lang`, and density bridge is Mergora's advantage over a bare React portal.

Portal deliberately does not own overlay roles, names, focus movement, dismissal, inerting, or scroll lock—compose those through the relevant component and `LayerManager`.

Keep cross-root ID relationships unique and mounted, and place modal portal targets outside any application root that will become inert.

Current status is `source-present-unreleased`. Hydration, nested portal, focus-order, relationship, direction/locale, packed-consumer, parity, Semantic Sync, Risk Class 2 manual, dogfood, and Quality Passport evidence remain required.
