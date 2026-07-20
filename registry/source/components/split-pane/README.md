# Split Pane

`SplitPane` extends the separator contract to two or more indexed panels, nested layouts, controlled or uncontrolled percentage arrays, a consumer-owned persistence adapter, collapse/restore, and an intrinsic narrow-container sequence.

```tsx
<SplitPane.Root
  collapsiblePanels={[0]}
  defaultValue={[30, 70]}
  minSizes={[20, 30]}
  persistence={{ key: "workspace", adapter: layoutStorage }}
>
  <SplitPane.Panel index={0} regionLabel="Navigation">
    …
  </SplitPane.Panel>
  <SplitPane.Handle
    aria-label="Resize navigation and workspace"
    collapseTarget="before"
    index={0}
  />
  <SplitPane.Panel index={1} regionLabel="Workspace">
    …
  </SplitPane.Panel>
</SplitPane.Root>
```

Render one indexed Panel per size and one indexed Handle between each adjacent pair. DOM order is public behavior. Panels are semantic-neutral until `regionLabel` deliberately opts one into a named `region`, avoiding a page full of accidental landmarks.

## Size model and persistence

`value/onValueChange` is controlled; `defaultValue` is uncontrolled. Arrays contain non-negative percentages and normalize to 100 while respecting `minSizes`, `maxSizes`, and declared zero-size `collapsiblePanels`. `onValueCommit` identifies the handle and reason after discrete or completed pointer changes.

The optional synchronous `persistence` adapter has `read(key)` and `write(key, sizes)`. Reads occur after hydration only for uncontrolled roots; writes occur on commits. Storage errors route to `onPersistenceError` instead of crashing the layout. Applications own storage scope, consent, quota, versioning, and recovery policy; the component never reaches localStorage at module or render time.

## Keyboard, pointer, and non-drag operation

Each Handle is a named focusable separator controlling both adjacent panel IDs. Arrow keys move spatially (including RTL), Home/End targets the preceding panel min/max, Page Up/Page Down moves two steps, and Enter toggles the declared `collapseTarget`. Every handle also renders 44 CSS-pixel decrement/increment buttons and, when valid, collapse/restore, so drag is not required on touch or switch input.

Built-in control names resolve through the stable `splitPane.collapseAfter`, `splitPane.collapseBefore`, `splitPane.controls`, `splitPane.decreaseBefore`, `splitPane.increaseBefore`, `splitPane.restoreAfter`, and `splitPane.restoreBefore` provider keys. Explicit `messages`, `locale`, and `formatValue` props take precedence. Nested Roots establish independent state and query containers.

## Responsive sequence and focus

`stackAt="narrow"` (the default) uses the root container's 36rem threshold, not a viewport media query. Panels become full-width in DOM order and handles leave layout and focus. A desktop-collapsed panel reappears in this sequential mode so users are never stranded behind a hidden restore handle. `stackAt="never"` is intended only where the consumer proves the multi-panel relationship remains operable at every supported width.

Stable slots are `split-pane-root`, `split-pane-layout`, `split-pane-panel`, `split-pane-handle`, and `split-pane-separator`, with documented orientation, index, state, panel-count, disabled, and stack-at attributes.

## SSR, responsibilities, and status

Initial markup is deterministic; pointer geometry and persistence are client-only event/effect work. Consumers must keep index order and controlled arrays aligned, provide localized Handle names, use named regions sparingly, and retest custom constraints/CSS under 320-pixel reflow, 400% zoom, RTL, long text, forced colors, and touch.

Current status is `source-present-unreleased`. Generation, cross-item dependency closure, normalization/property cases, persistence failures, browser and manual Risk Class 2 evidence, packed consumers, source/package parity, updater fixtures, site dogfooding, and Quality Passport approval remain incomplete. This source record makes no Stable or conformance claim.

## Mergora advantage

Bounded multi-panel normalization, controlled/uncontrolled state, optional collapse, consumer-owned persistence, RTL spatial input, and container-driven sequential layout remain independent. `showStepControls={false}` removes every adjacent button group, label, event, and accessibility node without weakening the named keyboard/pointer separator.
