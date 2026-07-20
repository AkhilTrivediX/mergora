# Keyboard Key

Represents individual keys and localized spoken key chords with explicit platform glyph mapping.

```tsx
<KbdChord keys={[{ key: "Meta", spokenLabel: "Command" }, { key: "K" }]} platform="mac" />
```

## Mergora advantage

Platform-specific glyph mapping is separated from the localized spoken chord, so familiar symbols never replace an understandable accessible name. Use `platform="generic"` and omit custom `spokenLabel`, `label`, and `separator` values for the plain deterministic chord without platform-specific presentation.

## Contract

Native kbd elements retain key semantics. Chords expose one localized spoken group label while decorative glyphs and separators are hidden from the accessibility tree.

Stable styling hooks are `[data-slot="kbd"]`, `[data-slot="kbd-chord"]`. APIs accept documented native attributes, `className`, `style`, and refs without making private DOM a public dependency. Logical properties, tokenized typography, forced-colors fallbacks, and long-value wrapping are part of the source contract.

## Large content and limitations

Platform selection is explicit for deterministic SSR; applications that infer a platform must do so after hydration and preserve localized spoken labels.

The computed spoken chord name resolves through the stable `kbd.chordLabel` message key. Its
formatter receives `values.keys` as the ordered list of spoken key names, so translations can use
their own connector or `Intl.ListFormat`; the explicit `label` prop takes precedence.

Current status is `source-present-unreleased`. Generated distribution, packed-consumer parity, updater fixtures, supported-browser evidence, current Risk Class 1 manual review, public-site dogfooding, and an approved Quality Passport remain mandatory before promotion. No Stable, manual accessibility, virtualization, package, registry, or publication claim is made.
