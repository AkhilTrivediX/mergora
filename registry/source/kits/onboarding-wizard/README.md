# Onboarding Wizard

This source-only workflow coordinates controlled or uncontrolled steps and draft values, per-step recovery validation, optional-step skipping, completion retry, and native reset. Read-only mode disables and cancels reset without changing a draft, step, or consumer callback. Consumers render domain-neutral fields with public canonical components and retain full ownership of validation, persistence, authorization, analytics, and side effects.

## Mergora advantage

An optional persistence adapter loads, saves, retries, and clears a versionable consumer-owned draft without bundling storage. Optional progress context and step announcements are separate controls. Disabling persistence removes every load/save/clear call, control, status, and accessibility node while the in-memory wizard remains fully usable.

## Status

Current status is `source-present-unreleased`. Generated parity, dependency closure, clean-consumer lifecycle evidence, persisted-draft migration and stale-data review, mobile-keyboard and browser gates, privacy/security/legal review, manual assistive-technology records, and an approved Quality Passport remain blockers.
