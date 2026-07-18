# Acceptance harness

The harness is framework-neutral. It defines the data and adapter boundaries that Storybook,
Playwright, Vitest, Testing Library, axe, and screenshot runtimes implement. An unavailable runtime
throws or records an explicit capability failure; it is never converted into a skip or pass.

## State and environment controls

Every item declares all canonical states as either applicable or not applicable with a reason.
Extension states are allowed and sorted lexically. Applicable states are crossed with explicit
environments covering locale, direction, theme, density, motion, viewport, and optional container
width, browser zoom, text scale, and the WCAG text-spacing override. Axis expansion is deterministic.
Environment adapters apply controls and must restore their prior state after a story run.

Required locale policy includes `en-US`, `de-DE`, `ar-EG`, `he-IL`, `ja-JP`, `hi-IN`, expanded
pseudo-localization (`en-XA`), and RTL pseudo-localization (`ar-XB`). Required viewport presets range from 320 by 568
through 1440 by 900; container widths include 240, 320, 480, and 768 pixels.

## Semantic queries and runtime adapters

Semantic queries use role, label, placeholder, text, or displayed value in that order of preference.
A test id is limited to geometry, visual masks, or a necessary implementation boundary and requires a
written justification.

The runtime contracts provide these adapter boundaries:

- axe results, including scoped, owned, expiring waivers and compensating evidence;
- ARIA snapshots with source binding;
- geometry checks for overflow, visible and unobscured focus, target size, and overlay bounds;
- visual capture with exact OS, browser, browser version, font digest, dimensions, and justified masks.

The core intentionally has no browser or DOM dependency. A production adapter must be registered by
the calling test environment. The absence of axe, ARIA, geometry, or visual capture support is an
error, not proof that the contract passed.

## Deterministic contract execution

Contract checks are explicit applicable/not-applicable variants. Checks are ordered by stable id.
Passing checks must report at least one passing assertion. Missing capabilities, thrown checks, empty
passes, failed assertions, and malformed blocked results become failures. Results contain no clock
time or runtime duration, so the same inputs produce the same serialized result.

## Package/source parity

Package and copied-source consumers report normalized, digested observations for public exports,
types, server/client boundaries, dependency closure, behavior, semantics, and styles. The comparator
requires both modes to bind to the same canonical source and contract, rejects missing or one-sided
probes, and compares normalized result digests. The package and source artifact digests may differ;
their public observations may not.
