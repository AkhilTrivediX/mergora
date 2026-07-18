# Layer Manager

`LayerManager` coordinates one deterministic overlay stack. It owns registration order, one Escape route, modal application inerting, semantic z-index indices, body scroll locking, and exact scroll/style restoration. `Layer asChild` registers and annotates the consumer's actual portal root, so the same index is both the visual order and the Escape order. It deliberately does not implement dialog roles, names, focus trapping, initial focus, or focus return.

```tsx
<LayerManager.Provider>
  <LayerManager.Application>
    <App />
  </LayerManager.Application>
  <Portal>
    <LayerManager.Layer modal onDismiss={() => setOpen(false)}>
      <DialogSurface />
    </LayerManager.Layer>
  </Portal>
</LayerManager.Provider>
```

Only the top layer is considered for Escape. If it is non-dismissible, layers behind it remain unchanged. Registered application roots outside the top modal become natively `inert`; portal modal layers must therefore live outside those roots. Nested providers always reuse the nearest manager, leaving one Escape listener and one modal environment owner. Opening or updating a non-modal/external layer updates stack order without tearing down and recreating an unchanged native inert/scroll lock.

Set `Layer.manageEnvironment={false}` only when a named external behavior engine already owns inerting and scroll prevention for that modal, as React Aria does for Mergora Dialog. The layer remains modal in the shared order and still blocks Escape from reaching lower layers; only the duplicated document effects are skipped. The default is `true`, so existing native layer consumers are unchanged. Keep coordinated portals on the shared `--mrg-component-layer-stack-base`; a consumer z-index override must not contradict registration order.

The manager fixes the body while modal content is open, compensates the scrollbar, and restores every touched inline style plus the original scroll coordinates after the final modal closes. Overlay components still own accessible role/name, focus entry/trap/return, dismissal policy, and persistent recovery UI.

Current status is `source-present-unreleased`. Full nested/browser/Strict Mode, inert, scroll, focus-integration, packed-consumer, parity, performance, Semantic Sync, complete Risk Class 3 AT/speech/switch, dogfood, and approved Passport evidence remain required.
