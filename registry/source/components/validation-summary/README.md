# Validation Summary canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

The summary renders persistent links to invalid controls and an atomic error-count announcement. `focusKey` is an explicit submit or async-validation revision: changing it applies the selected focus policy once. Ordinary keystroke-driven issue updates never steal focus. Link activation focuses the real control without manufacturing proxy controls.

Each instance receives a hydration-safe heading ID; `headingId` is available when a surrounding document owns that identity, and `headingLevel` preserves the page outline. Empty summaries never announce “0 errors.” Fragment links encode control IDs while focus lookup uses the exact DOM ID.

Built-in heading and error-count text resolve through the stable `validationSummary.heading` and `validationSummary.errorCount` MergoraProvider keys. English fallbacks use the provider locale for `Intl.NumberFormat` and `Intl.PluralRules`; explicit `heading` and `formatAnnouncement` props take precedence. Issue IDs and control IDs, plus an explicit heading ID, must be non-blank; issue IDs must be unique. Every rendered heading and issue message must also expose non-empty accessible content, preventing focusable summaries and links with empty names.

For `first-error`, a missing, disabled, or otherwise non-focusable control falls back to the named summary. Every programmatic focus target is scrolled to the center of the viewport, and a stable `focusKey` is consumed only once. Promotion still requires async failure/recovery, screen-reader announcement, focus, narrow/RTL/forced-colors, package parity, Semantic Sync, and manual evidence.

The summary's literal danger surface, ink structure, strong heading, compact corners, and violet two-layer focus seam keep recovery visibly in the Mergora family. `focusPolicy` is an optional advantage over a passive error list: `summary` or `first-error` moves focus once for a new explicit `focusKey`; the default `none` installs no focus movement or scrolling behavior while links and announcements remain available.
