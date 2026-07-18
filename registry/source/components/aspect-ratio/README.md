# Aspect Ratio

`AspectRatio` supplies a native-first preferred ratio without changing child semantics or imposing overflow clipping. Presets cover square, video, portrait, and wide content; a readonly `[width, height]` tuple supports reviewed custom ratios.

```tsx
<AspectRatio ratio="video">
  <img alt="Component state rail at a narrow viewport" src="/evidence/state-rail.png" />
</AspectRatio>
```

Custom tuple values must be finite and above zero. Invalid values throw instead of producing broken geometry. The fallback uses block-start percentage padding only when `aspect-ratio` is unsupported. Intrinsic semantic content may expand the preferred ratio rather than being clipped.

The stable root is `[data-slot="aspect-ratio"]`, with `data-ratio` and the documented ratio custom properties. The consumer still owns image alternatives, captions, iframe titles, media controls, and any deliberate crop policy.

Current status is `source-present-unreleased`; generated outputs, native/fallback browser geometry, semantic-content evidence, packed consumers, parity, updater fixtures, manual review, site use, and a Passport remain required.
