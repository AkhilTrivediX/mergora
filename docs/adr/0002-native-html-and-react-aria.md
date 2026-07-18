# ADR-0002: Prefer native HTML and use React Aria for complex behavior

- Status: Accepted
- Date: 2026-07-18
- Decider: AkhilTrivediX, through the approved blueprint

## Context

Mergora requires coherent semantics, focus, overlays, collections, date/time behavior, internationalization, and nested composition. Mixing multiple headless focus/overlay engines would multiply behavior contracts and interoperability failures.

## Decision

Use native HTML and browser behavior whenever sufficient. Use React Aria Components/hooks and `@internationalized/*` for complex composites, collections, date/time, overlays where necessary, and localization behavior. Expose Mergora-owned public APIs rather than React Aria internals.

Base UI, Radix, Ark/Zag, Headless UI, and another focus/overlay system are not Stable v1 dependencies. An exception requires a new approved ADR, dependency/license/security and bundle review, plus nested focus/overlay interoperability tests.

## Consequences

- Simple components retain native semantics and lower runtime cost.
- Complex families share one reviewed interaction model.
- React Aria implementation details must remain replaceable behind stable Mergora contracts.
- Accessibility still requires component-level automated and manual evidence; foundation ancestry is not conformance proof.

## Verification

API reports, dependency checks, bundle inspection, nested interaction tests, and per-item contracts must show one coherent behavior system and no leaked internal API.
