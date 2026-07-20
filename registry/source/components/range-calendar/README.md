# RangeCalendar canonical source

Status: source present and unreleased. No Stable or parity claim is made.

`RangeCalendar` coordinates labelled start and end calendar grids with canonical range state, native alternate entry, responsive stacking, bounds, form behavior, and RTL-aware keyboard navigation inherited from `Calendar`. Every complete candidate span is checked, so a range that crosses any unavailable date is rejected with recoverable guidance even when its endpoints are available. Inclusive duration and blocked-date explanations remain independent opt-in enhancements.

`showRangePreview` independently enables Green/Violet in-grid span highlighting plus a polite duration preview for pointer and keyboard focus. Setting it to `false` removes the highlight attributes, preview state, pointer/focus preview callbacks, output node, and live-region relationship. Availability reasons remain separately gated by `showAvailabilityExplanations`.

Paired Ink structures, Canvas surfaces, Green range summary, Violet focus treatment, strong headings, and semantic tokens provide a coherent Mergora signature. Promotion requires generated parity, packed consumers, broad browser evidence, and current manual assistive-technology records.
