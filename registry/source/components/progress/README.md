# Progress canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

Progress wraps a visibly labelled native progress element and exposes that element through its ref.

## Contract

- Omitting value preserves native indeterminate semantics; determinate values stay within zero and a positive maximum.
- Visible formatted value and aria-valuetext are identical. formatValue wins; otherwise Provider locale formats a percentage.
- The visible label must render content. role, generic name overrides, and aria value overrides are rejected because the native element and component own them.
- progress.indeterminate localizes the indeterminate label. Reduced motion removes decorative animation.

The public ref and stable data-slot parts are recorded in progress.anatomy.json. The exact five-key source manifest, metadata, API, story-state policy, accessibility contract, and honest promotion delta live beside the implementation.

## Promotion boundary

Generation drift, strict types, unit, SSR, hydration, schema, browser, axe, announcement and preference gates, packed consumers, package/source parity, Semantic Sync fixtures, manual assistive-technology sessions, reviewed visual evidence, public-site dogfooding, and an approved digest-bound Quality Passport remain required.
