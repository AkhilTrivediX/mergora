# Meter canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

Meter wraps a visibly labelled native meter element and remains distinct from task progress.

## Mergora signature and advantage

Meter combines Ink typography and structure with a restrained green native measurement signal and a non-pill contextual rail. Its optional Mergora advantage is `showThresholdSummary`, which exposes configured low, high, and optimum boundaries as localized visible context linked to the native meter with `aria-describedby`. The default `false` removes that rail, its formatting work, generated description relationship, and accessibility output while retaining the lightweight native meter.

## Contract

- Finite minimum, maximum, value, low, high, and optimum constraints are validated and low cannot exceed high.
- Visible formatted value and aria-valuetext are identical. formatValue wins; otherwise Provider locale formats the numeric value.
- `showThresholdSummary=false` is the default; enabling it formats only configured low, high, and optimum boundaries and links the summary to the native meter.
- Stable Provider keys `meter.low`, `meter.high`, and `meter.optimum` localize the optional boundary labels.
- The visible label must render content. role, generic name overrides, and aria value overrides are rejected because the native element and component own them.
- Native meter semantics, thresholds, optimum, and a thicker track must not be substituted with Progress.

The public ref and stable data-slot parts are recorded in meter.anatomy.json. The exact five-key source manifest, metadata, API, story-state policy, accessibility contract, and honest promotion delta live beside the implementation.

## Promotion boundary

Generation drift, strict types, unit, SSR, hydration, schema, browser, axe, announcement and preference gates, packed consumers, package/source parity, Semantic Sync fixtures, manual assistive-technology sessions, reviewed visual evidence, public-site dogfooding, and an approved digest-bound Quality Passport remain required.
