# Popover

`Popover` is a non-modal, named dialog anchored to a native trigger button. React Aria owns portal positioning, collision/flip, outside dismissal, topmost Escape, and focus return; `LayerManager` only records nesting.

```tsx
<Popover.Root>
  <Popover.Trigger>Evidence details</Popover.Trigger>
  <Popover.Content placement="start" align="end" initialFocus="first-interactive">
    <Popover.Arrow />
    <Popover.Title>Evidence details</Popover.Title>
    <Popover.Description>Results from the current candidate.</Popover.Description>
    <Popover.Close>Return</Popover.Close>
  </Popover.Content>
</Popover.Root>
```

`placement` is `top | bottom | start | end`; `align` is `start | center | end`. `initialFocus="none"` is the non-modal default and leaves focus on the trigger; use `first-interactive`, `content`, or `initialFocusRef` when opening the popover begins a keyboard task. Mergora resolves logical values from explicit provider direction before passing physical placement to React Aria, so locale and direction may differ. The default 12px collision padding, flip behavior, available-height scrolling, arrow, and full-gutter 320px adaptation keep the surface in the visual viewport. Popover never traps focus or inerts the background.

Built-in message key: `popover.close`, fallback `Close popover`, used as visible Close text when children are omitted. Current status is `source-present-unreleased`; all generated, immutable, manual, parity, Semantic Sync, Passport, and public-site evidence remains required.
