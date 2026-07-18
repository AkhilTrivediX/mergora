# Alert canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

Alert renders a titled feedback container in static, polite-status, or assertive-alert mode. Severity remains visible as localized text plus a distinct symbol; color is supplementary.

## Contract

- live=off is the default and makes no announcement. Polite/assertive modes require a concise announcement string and enqueue it through the nearest ScreenReaderAnnouncer.Provider; visible actions never enter a live region.
- headingLevel selects a real h1-h6. Title and description/body are required and actions retain their native semantics.
- Stable Provider keys are alert.info, alert.success, alert.warning, and alert.error; explicit variantLabel wins.

The public ref and stable data-slot parts are recorded in alert.anatomy.json. The exact five-key source manifest, metadata, API, story-state policy, accessibility contract, and honest promotion delta live beside the implementation.

## Promotion boundary

Generation drift, strict types, unit, SSR, hydration, schema, browser, axe, announcement and preference gates, packed consumers, package/source parity, Semantic Sync fixtures, manual assistive-technology sessions, reviewed visual evidence, public-site dogfooding, and an approved digest-bound Quality Passport remain required.
