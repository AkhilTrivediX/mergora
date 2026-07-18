# Tooltip

`Tooltip` provides supplemental, noninteractive text on keyboard focus and pointer hover. React Aria owns the shared warm-up delay group, close delay, hover persistence, Escape dismissal, collision/flip, portal, and `aria-describedby` lifecycle. The actual tooltip portal root joins the same visual/Escape stack as Dialog and Popover.

```tsx
<Tooltip.Root delay={700} closeDelay={300}>
  <Tooltip.Trigger aria-label="Copy digest">⧉</Tooltip.Trigger>
  <Tooltip.Content placement="end">Copy the immutable digest</Tooltip.Content>
</Tooltip.Root>
```

Use `Tooltip.DisabledTrigger` when a disabled-looking action still needs an explanation. It is a focusable `aria-disabled="true"` adapter and suppresses activation; do not also pass a native `disabled` attribute. Tooltip content cannot contain actions, cannot carry essential instructions, and cannot be the only copy available to touch users. There is deliberately no long-press gesture. Use Popover for rich or interactive content.

`placement` accepts logical `start`/`end`; explicit provider direction is resolved independently from locale. The portal repeats locale, direction, density, and configured container. Current status is `source-present-unreleased`; all generated, immutable, manual, parity, Semantic Sync, Passport, and public-site evidence remains required.
