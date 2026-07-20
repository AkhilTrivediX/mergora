# YearPicker canonical source

Status: source present and unreleased. No Stable or parity claim is made.

`YearPicker` uses a bounded native select for keyboard, touch, validation, serialization, and reset behavior. It supports controlled and uncontrolled numeric years and rejects unsafe or unbounded collections. Optional `showRangeSummary` provides count and bound context; disabled mode emits no summary node or described-by relationship.

For domains above 5,001 years, `visibleRange` provides a consumer-controlled native window with at most 5,001 rendered options and `onVisibleRangeChange` requests earlier or later windows. The selected year remains in the option collection even when it sits outside the current window, preserving native form value and reset. `visibleRange={false}` removes navigation UI, labels, callbacks, state, and accessibility output, and retains the original bounded native collection behavior.

Canvas, Ink, Violet context/focus cues, strong native typography, restrained window controls, and semantic tokens provide Mergora identity. Promotion remains blocked on generated parity, packed consumers, broad device evidence, and manual assistive-technology records.
