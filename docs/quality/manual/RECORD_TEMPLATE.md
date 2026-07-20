# Manual quality record template

This document describes a completed record. A blank copy, generated checklist, or partially filled record is **NOT RUN** and is not evidence.

## Identity and candidate binding

Record `schemaVersion`, `recordId`, `itemId`, `riskClass`, `releaseId`, `sourceDigest`, `behaviorDependencyDigest`, `browserPolicyDigest`, exact `contractVersion`, `performedAt`, and `expiresAt`. Digests use `sha256:<64 lowercase hex>` and timestamps use exact ISO instants.

Identify the tester and reviewer with stable ids and names. Every Risk Class 3 record requires a reviewer different from its tester.

## Exact policy lane

Record the policy `laneId` and its exact environment:

- OS name and exact numeric OS/build version;
- browser name and exact numeric version;
- assistive technology name and exact numeric version when the lane requires one;
- input method, locale, direction, viewport, zoom percentage, theme/contrast mode, and motion preference.

Do not substitute another browser, AT, input, locale, direction, viewport, zoom, theme, or motion setting. `latest`, `current`, version ranges, and omitted versions are invalid. Current and previous policy slots must contain different exact versions for the field named by policy.

## Protocol

For each task, record a stable id, instruction, expected result, observed result, and Pass or Fail. Include entry, navigation, operation, validation/error recovery, cancellation, focus restoration, announcements, touch/pointer alternatives, and exit where applicable. Risk Class 3 records additionally cover the lane's workflow, interruption/recovery, scale, voice, mobile, or switch task when required.

## Coverage and result

Record only coverage ids allowed by the selected lane. Each result is Pass, Fail, or Not applicable. Fail and Not applicable require a rationale. Not applicable is accepted only where maturity policy explicitly permits it.

The record's overall outcome is Pass only when no task or coverage result failed. Validation, environment, lane, binding, independence, expiry, or artifact errors invalidate a passing record and its claims.

## Artifacts

Attach at least one sanitized artifact with a unique catalog id, immutable HTTPS location or project-relative evidence location, and SHA-256 digest. Do not include credentials, raw account data, personal disability information, private machine paths, or unrelated personal content.

## Review and carry-forward

Record the review decision and confirmation that no release-blocking defect was relabeled as a limitation. A carried-forward record additionally declares the origin release, reason, and exact source, behavior-dependency, browser-policy, and contract values. Initial Stable and affected Risk Class 3 release candidates cannot use carry-forward evidence.
