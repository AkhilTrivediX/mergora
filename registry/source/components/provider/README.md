# Provider

`MergoraProvider` supplies locale, direction, messages, time zone, portal target, reduced-motion policy, and density to one subtree. Defaults are deterministic (`en-US`, `ltr`, `UTC`, `comfortable`, and `system`) and do not inspect browser globals during render.

```tsx
<MergoraProvider
  locale="ar-EG"
  direction="rtl"
  timeZone="Asia/Kolkata"
  messages={{ "upload.complete": "اكتمل الرفع" }}
>
  <App />
</MergoraProvider>
```

Nested providers inherit unspecified values and merge messages by key. The default boundary is a `div` with native `lang` and `dir`; `asChild` merges those attributes into one concrete child when an extra wrapper would affect layout. Portal content receives the same React context and repeats the native direction, locale, and density attributes at its target.

Every built-in message uses a documented stable key. String translations may reorder named
placeholders such as `{count}`. A message can instead be a formatter receiving `{ locale, values }`
when it needs `Intl.PluralRules`, `Intl.NumberFormat`, or another ECMA-402 formatter:

```tsx
<MergoraProvider
  locale="de-DE"
  messages={{
    "diffViewer.summary": ({ locale, values }) =>
      `${new Intl.NumberFormat(locale).format(Number(values.added))} hinzugefügt; ${new Intl.NumberFormat(locale).format(Number(values.removed))} entfernt`,
  }}
>
  <App />
</MergoraProvider>
```

Messages are inserted as text, never HTML. Keep formatter output deterministic between the server
and first client render.

Keep the server and first client locale/time-zone values identical. The provider does not translate arbitrary user content or update `document.documentElement` outside its boundary.

Current status is `source-present-unreleased`. Generated outputs, browser hydration/portal evidence, packed consumers, Semantic Sync fixtures, Risk Class 2 manual review, site dogfooding, and an approved Quality Passport remain required before Stable promotion.
