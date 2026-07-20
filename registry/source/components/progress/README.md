# Progress canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

Progress wraps a visibly labelled native progress element and exposes that element through its ref.

## Mergora signature and advantage

Progress uses Ink typography, a crisp native track, Living Green determinate fill, and Deep Violet indeterminate state through shared progress tokens. Unlike a baseline Shadcn progress bar, it preserves native `<progress>` behavior with a visible localized value context that can be removed independently. `showValue={false}` omits the visible value, `aria-valuetext`, and formatter call while retaining the visible label and native determinate or indeterminate value model.

## Contract

- Omitting value preserves native indeterminate semantics; determinate values stay within zero and a positive maximum.
- Visible formatted value and aria-valuetext are identical. formatValue wins; otherwise Provider locale formats a percentage.
- `showValue=true` preserves the existing localized context; `showValue=false` removes the optional context without changing native range semantics.
- The visible label must render content. role, generic name overrides, and aria value overrides are rejected because the native element and component own them.
- progress.indeterminate localizes the indeterminate label. Reduced motion removes decorative animation.

The public ref and stable data-slot parts are recorded in progress.anatomy.json. The exact five-key source manifest, metadata, API, story-state policy, accessibility contract, and honest promotion delta live beside the implementation.

## Promotion boundary

Generation drift, strict types, unit, SSR, hydration, schema, browser, axe, announcement and preference gates, packed consumers, package/source parity, Semantic Sync fixtures, manual assistive-technology sessions, reviewed visual evidence, public-site dogfooding, and an approved digest-bound Quality Passport remain required.
