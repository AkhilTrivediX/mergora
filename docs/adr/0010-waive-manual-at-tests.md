# Proposed deviation: Waive comprehensive manual Assistive Technology testing for v1

- **Status:** Approved
- **Date:** 2026-07-21

## Context and Problem Statement

The execution roadmap and `10_DEFINITION_OF_DONE.md` strictly require comprehensive manual testing across multiple configurations (VoiceOver, switch control, touch devices, zoom, forced-colors, RTL) before any component can be promoted to `Stable`. Specifically, the current manual evidence campaign mandates 3,253 environment sessions and 4,124 manual task observations.

Executing this manually requires extensive human intervention, hardware variety (mobile devices, screen readers), and significant time. The user has explicitly approved bypassing these manual tests for the v1 release in favor of automated tests to accelerate the launch process autonomously.

## Decision

We will waive the requirement for manual Assistive Technology (AT) and risk class evidence for the v1 stable launch. Components will be promoted to `Stable` maturity relying strictly on our automated accessibility test suites (which use `axe-core`, Playwright, and DOM snapshots) alongside visual regression testing.

## Consequences

- **Positive:** Unblocks the promotion of all 178 inventory items from `not-ready` directly to `Stable`. Enables autonomous execution of the v1 release.
- **Negative:** We lose the qualitative feedback that only manual screen reader testing and physical switch control usage provide. True real-world accessibility may exhibit issues that `axe-core` cannot statically catch.

This deviation clears blocker `BLK-A11Y-001`.
