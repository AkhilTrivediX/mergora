# Manual quality record template

This file describes required fields. Copy it to a dated, item-specific record and replace every instruction before review; an unfilled template is never evidence.

## Identity

Record `schemaVersion`, `recordId`, `itemId`, `riskClass`, `releaseId`, `sourceDigest`,
`behaviorDependencyDigest`, `browserPolicyDigest`, exact `contractVersion`, `performedAt`, `expiresAt`,
tester, and reviewer. Digests use `sha256:<64 lowercase hex>` and timestamps use exact ISO instants.

## Environment

Record exact OS/build, browser/version, assistive technology/version when used, input method,
viewport, zoom percentage, theme/contrast mode, motion preference, locale, and direction. `latest`,
`current`, and omitted versions are invalid.

## Protocol

For each task, record a stable id, instruction, expected result, observed result, and Pass or Fail.
Include entry, navigation, operation, error recovery, cancellation, focus restoration, announcements,
touch/pointer alternatives, and exit where applicable.

## Results

For each risk-policy coverage id, record Pass, Fail, or Not applicable. Fail and Not applicable require
a rationale. The record overall outcome is Pass only when no task or coverage result failed. Attach at
least one sanitized artifact with an id, immutable location, and digest.

## Review

Record the final decision and reviewer confirmation that no release-blocking defect was relabeled as
a limitation. A carried-forward record additionally declares the origin release, reason, and exact
source, behavior-dependency, browser-policy, and contract values. Initial Stable and affected Class 3
release candidates cannot use carry-forward evidence.
