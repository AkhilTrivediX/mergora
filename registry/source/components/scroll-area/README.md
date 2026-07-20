# Scroll Area

`ScrollArea` preserves browser-native scrolling and visible scrollbars. It adds semantic size, overscroll, and scroll-padding choices without replacing wheel, keyboard, touch, momentum, or high-contrast behavior.

```tsx
<ScrollArea aria-label="Build history" focusable size="sm">
  <BuildHistory />
</ScrollArea>
```

## API and anatomy

The forwarded ref targets the root `HTMLDivElement`. `orientation` accepts `vertical`, `horizontal`, or `both`; `size` accepts `sm`, `md`, `lg`, or safe-area-aware `viewport`; `scrollPadding` accepts `none`, `sm`, or `md`; and `containOverscroll` opts into native scroll-chain containment.

The single stable slot is `[data-slot="scroll-area"]`. Documented state hooks are `data-orientation`, `data-size`, `data-focusable`, `data-contain-overscroll`, and `data-scroll-padding`.

## Accessibility and keyboard behavior

The root is not a tab stop by default, which avoids adding noise around content whose descendants already provide useful keyboard stops. Set `focusable` only for an independently meaningful overflow region. The TypeScript branch then requires an `aria-label` or `aria-labelledby`; untyped consumers retain responsibility for providing a non-empty name.

When focused, browser-native arrow, Page Up/Down, Home/End, and Space scrolling remains intact. The component does not intercept keys. Explicit `focusable` mode adds `role="region"` with the required name; the inert default adds neither a role nor a tab stop, avoiding unnecessary landmarks. Native scrollbars stay visible, use a minimum 24 CSS-pixel WebKit track, and revert to system behavior in forced colors.

## Responsive, direction, and styling

Logical scroll padding follows inherited LTR/RTL direction. The viewport size subtracts physical top/bottom safe-area insets. Content may scroll only where its relationship requires it; avoid two-dimensional scrolling for prose or ordinary controls that can reflow.

Component CSS references semantic Mergora tokens and no literal palette. Consumer overrides must retain a visible scrollbar, focus outline, and enough scroll padding for focused descendants.

`ScrollArea` is server-compatible: it has no hydration boundary, effects, or browser-global access. Native scrolling and styling remain available before JavaScript loads.

## Current limitations and status

Current status is `source-present-unreleased`. Generated distributions, real-browser native-scroll evidence, 320-pixel/400%-zoom geometry, packed-consumer parity, updater fixtures, manual keyboard/screen-reader/touch/forced-colors review, site dogfooding, and an approved Quality Passport remain required. This source record is not a conformance or Stable claim.

## Mergora advantage

Scrolling, momentum, wheel input, and scrollbars stay browser-native. A meaningful overflow region may opt into a named tab stop with `focusable`; `focusable={false}` removes the role, accessible name, and tab stop. Overscroll containment remains a separate `containOverscroll` switch.
