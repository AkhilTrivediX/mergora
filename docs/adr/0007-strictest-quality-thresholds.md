# ADR-0007: Apply the strictest compatible quality threshold

- Status: Accepted
- Date: 2026-07-18
- Decider: Blueprint reconciliation during P0 audit

## Context

The testing plan sets representative site Lighthouse targets of Accessibility 100, Best Practices and SEO at least 95, and Performance at least 90. The final Definition of Done separately requires at least 95 for all four categories. These thresholds are compatible but not identical.

## Decision

Apply the strictest combined release gate:

- Accessibility: 100
- Performance: at least 95
- Best Practices: at least 95
- SEO: at least 95

Dedicated LCP, CLS, interaction, accessibility, responsive, security, and no-script gates remain authoritative; aggregate Lighthouse scores cannot waive them.

## Consequences

- There is one unambiguous threshold for implementation and CI.
- The earlier Performance 90 value remains a historical conservative target, not the final completion gate.
- Representative route selection and pinned lab conditions must be documented with results.

## Verification

CI configuration, site documentation, release evidence, and Definition of Done reports must all use the reconciled thresholds and retain raw traces.
