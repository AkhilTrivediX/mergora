# Presence

`Presence` retains one concrete element through an exit lifecycle and removes it at the declared exit deadline. Root transition or animation events can complete the lifecycle only when their elapsed time reaches that deadline; shorter property events are ignored, and the deterministic timeout remains authoritative.

```tsx
<Presence present={open} onExitComplete={() => restoreFocus()}>
  {({ state }) => <section data-state={state}>Filter details</section>}
</Presence>
```

Present server content starts `entered` and visible by default, so JavaScript is not needed to reveal it. `initialEnter` is opt-in; leaving it false removes the initial entering state and its motion/event lifecycle. Returning `present` to true during exit cancels removal. An explicit `reducedMotion` value overrides only this instance; omitting it follows the provider policy. A reduced policy completes exit immediately and the CSS branch collapses transition duration for the operating-system preference.

Mergora's advantage is a deadline-aware, interruption-safe exit: shorter transition-property events cannot remove content early, and the timeout remains deterministic. `onExitComplete` is independently optional; when omitted, exit emits no consumer callback or additional accessibility output.

Presence does not move focus. Before removing focused content, the owning component must select and document a logical destination. Keep `exitDurationMs` aligned with the longest custom CSS transition or animation, including its delay.

Current status is `source-present-unreleased`. Interrupted lifecycle, hydration, Strict Mode cleanup, no-JavaScript, reduced-motion, focus-safety, packed-consumer, parity, Semantic Sync, Risk Class 2 manual, and Passport evidence remain required.
