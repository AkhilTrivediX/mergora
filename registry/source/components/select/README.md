# Select canonical source

Status: source present and unreleased. No Stable, performance, package-parity, conformance, or manual assistive-technology claim is made.

`Select` is deliberately a non-editable **single-selection** field. Multiple values belong to the separate `multi-select` component or a Listbox, so enhanced and native presentations never diverge on a hidden multiple-selection contract.

Both presentations consume the same reviewed collection records: globally stable/form-unique keys, localized `textValue`, labelled sections, and disabled items. The default `enhanced` presentation uses React Aria for the trigger/listbox relationship, typeahead, popup positioning, dismissal, focus restoration, hidden native form control, validation, and controlled/uncontrolled state. Optional measured virtualization follows Listbox's shared `ListLayout` contract.

Mergora's trigger and popup use literal Canvas surfaces, crisp Ink boundaries, a Green selected cue, and the shared Violet focus seam. Its useful large-collection context remains modular: `virtualization` windows enhanced options, while the bounded selected-text summary may use its locale-driven default, a localized formatter, or `formatSelectionSummary={false}`. Omitting virtualization renders the ordinary enhanced collection; disabling the summary removes its calculation, callback, hidden markup, ids, and accessibility-description output. Native presentation remains a separate explicit platform path and does not pretend to support either enhanced-only behavior.

Enhanced item labels and descriptions use React Aria's public text slots so every generated `aria-labelledby` and `aria-describedby` reference resolves. The selected trigger renders the item's plain `textValue`, keeping option descriptions out of the committed value. Disabled hidden-native/autofill changes pass through the same public controlled `onChange` boundary as pointer and keyboard selection; Select does not inspect React Aria's private DOM or test markers.

Controlled enhanced selections reuse Listbox's locale-driven, language-neutral bounded summary. A product that needs prose supplies a complete localized `formatSelectionSummary`; Select does not assemble English sentence fragments under a non-English provider locale.

`presentation="native"` renders the canonical NativeSelect and is the recommended path for simple text-only choices or when the platform/mobile picker is preferable. It is explicit and never selected from a user-agent or coarse-pointer check after hydration. Native mode rejects popup-state props, virtualization, and rich item descriptions instead of silently discarding behavior or content; option text is always `textValue`.

Remote state uses Listbox's validated async contract and ordinary Retry/Load more actions. The shared `useCollectionLoader` hook is the prepared cancellation, stale-order, and pagination implementation. Enhanced mode keeps recovery in the open popover; native mode keeps it beside the visible select.

Promotion requires generated and packed consumers, package/source parity, Semantic Sync fixtures, enhanced/native form and reset parity, mobile platform-picker review, popup focus/dismissal evidence, async and virtualized scale evidence, narrow/zoom/text-spacing/RTL/forced-colors/touch review, and current Risk Class 3 desktop/mobile assistive-technology, speech, and switch sessions.
