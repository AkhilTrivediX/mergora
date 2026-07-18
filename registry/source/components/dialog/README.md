# Dialog

`Dialog` is the canonical modal/non-modal dialog family. React Aria is the only focus and overlay behavior engine. `LayerManager` registers the actual portal root as a non-dismissible layer, so visual order and topmost Escape order agree without installing a second Escape handler.

```tsx
<Dialog.Root finalFocusRef={workflowRef} modality="modal">
  <Dialog.Trigger>Review changes</Dialog.Trigger>
  <Dialog.Overlay>
    <Dialog.Content initialFocus="content">
      <Dialog.Title>Review changes</Dialog.Title>
      <Dialog.Description>Inspect the affected files.</Dialog.Description>
      <Dialog.Close>Return to diff</Dialog.Close>
    </Dialog.Content>
  </Dialog.Overlay>
</Dialog.Root>
```

Modal is the default and contains focus, prevents background interaction, locks document scrolling, and restores focus. Non-modal dialogs remain named but do not inert the background or trap focus; `Overlay.placement` accepts logical `start`/`end`. Escape closes only the topmost dismissible React Aria layer and is ignored during IME composition. `outside-and-escape`, `escape-only`, and `explicit` are the supported dismissal policies.

Use `initialFocusRef` for a deliberate contained target, `initialFocus="content"` for long semantic content, or `initialFocus="none"` only for a non-modal surface. `finalFocusRef` is the required logical fallback when the trigger may be removed. Keep an explicit `Close` path visible at narrow widths.

The portal root repeats provider `lang`, `dir`, density, direction, locale, and configured portal container. Direction is independent from locale. CSS uses logical properties, visual-viewport bounds, safe-area insets, forced-color boundaries, and no transform under reduced motion.

Built-in message key:

- `dialog.close` — fallback `Close dialog`; visible default `Dialog.Close` text when children are omitted.

Current status is `source-present-unreleased`. Generated artifacts, immutable evidence, packed parity, Semantic Sync fixtures, manual Risk Class 2 sessions, public Passport, and site dogfooding remain promotion blockers.
