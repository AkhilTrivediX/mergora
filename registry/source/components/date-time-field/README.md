# DateTimeField canonical source

Status: source present and unreleased. No Stable, DST-conformance, or parity claim is made.

`DateTimeField` deliberately preserves the unzoned `datetime-local` value model and native validation, serialization, reset, and mobile editing. Optional `showTimeZoneContext` makes the consumer's intended interpretation visible without converting the value. When disabled, no zone lookup, node, relationship, or accessibility output exists.

For consumers that must convert local wall time to an instant, `wallTimeAdapter` is an explicitly synchronous, dependency-free seam. It requires an explicit `timeZone`, classifies valid, repeated, and nonexistent wall times, and defaults `ambiguityPolicy` to `reject`; `earlier` or `later` deliberately selects a repeated occurrence. Invalid resolutions participate in native custom validity with recovery text. A successful instant is serialized only when `resolvedName` is provided. With `wallTimeAdapter={false}`, the adapter is not called and no status, hidden value, event, relationship, or accessibility output exists.

The Canvas field, Ink boundary, Green success / explicit danger recovery, Violet timezone rail and focus seam, semantic density, and restrained radius establish Mergora identity. Consumers remain responsible for providing an authoritative adapter backed by current timezone data and validating the resulting instant at a trusted boundary. Promotion requires generated parity, packed consumers, the full matrix, and manual assistive-technology evidence.
