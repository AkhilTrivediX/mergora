# Resizable

`Resizable` creates one primary and one secondary panel around a value-bearing separator. Pointer dragging is never the only path: the separator supports a complete keyboard map and visible 44 CSS-pixel step/collapse controls provide touch and switch-friendly discrete operations.

```tsx
<Resizable.Root collapsible defaultValue={40} min={20} onValueCommit={saveSize}>
  <Resizable.Primary>Source</Resizable.Primary>
  <Resizable.Handle aria-label="Resize source and preview" />
  <Resizable.Secondary>Preview</Resizable.Secondary>
</Resizable.Root>
```

Named exports mirror the namespace: `ResizableRoot`, `ResizablePrimary`, `ResizableHandle`, and `ResizableSecondary`. Root, Primary, and Secondary refs target their divs; Handle ref targets the focusable `role="separator"` node rather than its non-interactive wrapper.

## State and callbacks

Use `value/onValueChange` for controlled state or `defaultValue` for uncontrolled state. Values are percentages constrained by `min` and `max`; `onValueChange` reports every proposal, while `onValueCommit` reports discrete controls/keys and the completed pointer sequence. Callback details identify `keyboard`, `pointer`, `step-control`, `collapse`, or `restore`.

When `collapsible` is true, Enter and the visible collapse button move the primary panel to `collapsedValue` (zero by default). Collapsed content uses the native `hidden` state so it cannot retain focus. Restore returns to the last expanded size.

## Keyboard, pointer, touch, and localization

- Horizontal Arrow Left/Right moves the separator spatially and reverses physical meaning in RTL.
- Vertical Arrow Up/Down changes block size.
- Home/End moves to the expanded min/max.
- Page Up/Page Down changes by two steps.
- Enter collapses or restores when enabled.

Pointer capture keeps a drag coherent and pointer cancellation ends the sequence cleanly. Minus/plus controls are a non-drag single-pointer alternative. The optional collapse/restore control is only rendered when collapsing is supported. Built-in names resolve through `resizable.collapse`, `resizable.controls`, `resizable.decrease`, `resizable.increase`, and `resizable.restore` provider message keys. The explicit `messages`, `locale`, and `formatValue` props take precedence over inherited provider behavior; visible application panel content remains the consumer's responsibility.

## Responsive and styling contract

The root has zero intrinsic minimums, uses logical panel dimensions, and introduces no fixed text height. For workflows that require a built-in sequential 320-pixel presentation, use `SplitPane`; `Resizable` deliberately does not guess how an application should reorder or stack its two regions.

Stable slots are `resizable-root`, `resizable-primary`, `resizable-handle`, `resizable-separator`, and `resizable-secondary`. Styling hooks include orientation, expanded/collapsed, collapsible, and disabled data attributes. Forced-colors rules preserve boundaries, grip, and focus.

## SSR, responsibilities, and status

The initial tree and percentage are deterministic during SSR; browser geometry is read only from pointer events. Consumers must supply a localized Handle name, keep controlled state synchronized, and avoid overriding separator ARIA/value/focus attributes.

Current status is `source-present-unreleased`. Required generation, browser/AT evidence, cancellation/rapid-update/RTL/zoom cases, clean packed consumers, parity, updater fixtures, site dogfooding, and Quality Passport approval remain incomplete. This source record is not a Stable or accessibility-conformance claim.

## Mergora advantage

The named value-bearing separator supports pointer, keyboard, RTL spatial arrows, controlled/uncontrolled state, localization, and optional collapse. Explicit 44-pixel step controls are independently selectable: `showStepControls={false}` removes their group, labels, buttons, events, and accessibility output while leaving the separator fully operable.
