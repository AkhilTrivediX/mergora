# Sticky Region

`StickyRegion` pairs a block-start or block-end sticky surface with a body whose focused descendants receive measured logical clearance. ResizeObserver follows zoom, font, localization, text wrapping, and responsive block-size changes so sticky content does not obscure keyboard focus.

```tsx
<StickyRegion.Root contained position="block-start" size="sm">
  <StickyRegion.Content element="header">Current filters</StickyRegion.Content>
  <StickyRegion.Body>{actions}</StickyRegion.Body>
</StickyRegion.Root>
```

For `block-start`, keep Content before Body. For `block-end`, keep Content after Body. This preserves reading, focus, and visual order. `Content.element` is restricted to `div`, `header`, or `footer`; choose landmarks only when correct in the surrounding document.

## Focus-not-obscured model

After hydration, Root observes Content's actual block size and updates a component-local CSS variable. Scroll padding on the occupied edge and scroll margins on focusable Body descendants include the measured size, semantic offset, safe-area inset, and focus offset. Focus is never moved, trapped, or made programmatic.

`estimatedSize` (44 CSS pixels by default) supplies deterministic SSR and no-ResizeObserver clearance. Set it near the rendered server height when scripts may be delayed. `contained` makes Root a native scroll container; page mode leaves scrolling to the nearest ancestor while descendant scroll margins still apply.

## Responsive, direction, and styling

No fixed content height is set. Semantic sizes constrain only a contained scrollport and `viewport` uses dynamic block units minus physical safe-area insets. Insets, borders, scroll padding, and scroll margins use logical block properties; inherited LTR/RTL does not alter reading order. The current contract supports horizontal writing modes and explicitly requires consumer review for vertical writing modes.

Stable slots are `sticky-region-root`, `sticky-region-content`, and `sticky-region-body`. Documented attributes cover position, offset, safe-area, contained mode, size, and semantic element. The sticky z-index uses the shared semantic scale; a structural edge border, not a decorative shadow, communicates occlusion and survives forced colors.

## Consumer responsibilities and status

Consumers own landmark correctness, heading hierarchy, DOM order, nested scroll/container interactions, and any custom transform/z-index/positioning. Re-run focus-clearance geometry after overriding these seams.

Current status is `source-present-unreleased`. Generation, ResizeObserver cleanup/fallback, start/end and page/contained browser geometry, 256-pixel height, 320-pixel/400%-zoom/200%-text evidence, manual keyboard/screen-reader/touch/forced-colors review, packed consumers, parity, updater fixtures, site dogfooding, and Quality Passport approval remain incomplete. This source record is not a Stable or conformance claim.

## Mergora advantage

Measured sticky focus clearance keeps tabbed descendants from landing beneath localized sticky content. `manageFocusOffset={false}` removes ResizeObserver work, the measured custom property, root scroll padding, and descendant scroll margins while preserving ordinary sticky positioning.
