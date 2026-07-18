# Sheet

`Sheet` is the edge-placed modal Dialog variant. `side="start" | "end"` follows provider direction; `top` and `bottom` are physical block edges. Sizes are `sm`, `md`, `lg`, and `full`.

```tsx
<Sheet.Root side="end" size="md">
  <Sheet.Trigger>Open release details</Sheet.Trigger>
  <Sheet.Overlay>
    <Sheet.Content>
      <Sheet.Title>Release details</Sheet.Title>
      <Sheet.Description>Inspect the candidate before publishing.</Sheet.Description>
      <Sheet.Footer>
        <Sheet.Close>Return</Sheet.Close>
      </Sheet.Footer>
    </Sheet.Content>
  </Sheet.Overlay>
</Sheet.Root>
```

The surface uses visual-viewport bounds, safe-area padding, contained native scrolling, and a sticky footer that does not obscure focus. At 320×568 inline sheets fit the viewport and top/bottom sheets cap at 85dvb. Reduced motion removes edge translation. Touch gestures are optional and are not implemented by this base; the trigger and visible Close path work for keyboard, touch, speech, and switch users.

Built-in message key: `sheet.close`, fallback `Close panel`, used as visible Close text when children are omitted. Current status is `source-present-unreleased`; all generated, immutable, manual, parity, Semantic Sync, Passport, and public-site evidence remains required.
