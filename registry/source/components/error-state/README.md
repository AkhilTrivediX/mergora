# Error State canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

ErrorState separates recoverable and unrecoverable workflows without accepting raw Error objects.

## Contract

- Recoverable mode requires onRetry and renders a native 44 CSS-pixel retry button; unrecoverable mode rejects retry props.
- Technical details appear only when the consumer explicitly supplies a node, behind native details; no error object or stack is rendered by default.
- The visible named section is never a live region. `live="off"` is the default; polite/assertive modes require a concise `announcement` string and enqueue it through the nearest `ScreenReaderAnnouncer.Provider`.
- Mount `ScreenReaderAnnouncer.Provider` above any ErrorState that opts into announcements. Its persistent live roots are siblings after provider content, so retry, alternative actions, and technical details remain visible and outside every live region.
- Identical summaries use the shared provider dedupe policy. Stable keys errorState.label, errorState.retry, and errorState.details localize built-in visible text; the caller owns localization of the explicit announcement.
- The owned retry button and details summary provide underlined hover, double-underlined active, and explicit focus-visible feedback. Reduced motion removes the pressed translation while preserving the non-color active cue; forced colors retains the system focus outline.

The public ref and stable data-slot parts are recorded in error-state.anatomy.json. The exact five-key source manifest, metadata, API, story-state policy, accessibility contract, and honest promotion delta live beside the implementation.

## Promotion boundary

Generation drift, strict types, unit, SSR, hydration, schema, browser, axe, announcement and preference gates, packed consumers, package/source parity, Semantic Sync fixtures, manual assistive-technology sessions, reviewed visual evidence, public-site dogfooding, and an approved digest-bound Quality Passport remain required.
