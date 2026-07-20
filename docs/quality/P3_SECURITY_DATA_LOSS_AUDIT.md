# P3 security and data-loss audit

- Review date: 2026-07-20
- Reviewed checkpoint: `625e400` through `44a7829` plus the active verified P3/P4 integration
  worktree
- Scope: CLI transactions, Semantic Sync, registry acquisition, Contracts, migrations, offline
  artifacts, generated release protocol, and clean-consumer evidence
- Result: no open S0, S1, or implementation-level S2 finding; exact-commit, live-mirror, and release evidence keep P3 unapproved

This is the current review of the implemented P3 surface against the normative transaction,
provenance, registry, plan, and update requirements. It found no open S0 or S1 issue. The latest
adversarial tranches closed validator injection, digest omission, partial conflict-plan, Stable
vendor authenticity, tar topology, semantic-resolution crash convergence, and the last canonical
operation-plan acceptance bypass. Every exported material planner now reaches the one closed-schema
finalizer; dry-run and transaction apply validate schema plus digest; custom apply paths recompute a
finalized plan; and cleanup rejects schema-invalid stored plans even when an attacker recomputes the
plan and record digests.

| ID         | Severity | Finding                                                                                                                                                   | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-P3-001 | S1       | Semantic Update advertised parse, type/import, token, config, and Contract validation labels that were not executed as gates.                             | Closed in the active worktree. Every non-built-in reviewed label now requires a fixed command-owned validator; planning validates the staged overlay without creating transaction state.                                                                                                                                                                                                                                                                                                                                         |
| SEC-P3-002 | S1       | Initialization was not journaled through the durable source transaction/recovery protocol and could be interrupted mid-sequence.                          | Closed. First-run/repeat init now uses one exact reviewed transaction digest, stages, backs up, journals, commits manifest last, rolls back, and recovers through the shared engine.                                                                                                                                                                                                                                                                                                                                             |
| SEC-P3-003 | S2       | Enrolled registries, verified cache, vendor snapshots, GitHub mirrors, and npm mirrors did not feed real consumers through one immutable resolver.        | Closed in the active worktree. Automatic enrolled-current Stable resolution is identity-bound across search, view, add, and update; verified offline Stable vendors use the same immutable acquisition boundary; Shadcn routes fail closed or adopt one exact enrolled payload. Authentication remains bounded and is stripped from mirrors and cross-origin redirects. A live official mirror cannot be evidenced until an immutable release payload exists and remains a release gate rather than an unfinished resolver path. |
| SEC-P3-004 | S2       | Documented CLI flags and distribution-mode transitions were not executable through the strict command contract.                                           | Closed in the active worktree. `--ui-version`, configured and per-operation `--mode`, `--no-format`, Contract/example provisioning, adoption origin, bounded diff context, and source/package migration switches are parsed, planned, executed, and covered by packed command and distribution-mode suites.                                                                                                                                                                                                                      |
| SEC-P3-005 | S2       | Package/hybrid provenance, explicit registry moves, an official browser Contract Audit host, and executable Shadcn/mode migrations were absent.           | Closed in the active worktree. Provenance/mode engines, explicit reviewed moves, an opt-in official browser host, transactional Shadcn migration/adoption, and exact source/package mode migrations use immutable acquired bytes, fixed validators, rollback/recovery, and manifest-last ownership.                                                                                                                                                                                                                              |
| SEC-P3-006 | S2       | The stable release builder omitted required search/schema/Contract/Passport/SBOM/archive/mirror bytes.                                                    | Closed at `12a39f1`. The builder and verifier bind exact embedded bytes, all required schemas/evidence, search, mirror manifest, portable release bundle, SBOM, and checksums.                                                                                                                                                                                                                                                                                                                                                   |
| SEC-P3-007 | S1       | Stable vendor planning accepted caller-shaped snapshots/inventory and incomplete npm/tar verification at the write boundary.                              | Closed in the active worktree. Acquired release and frozen snapshot brands, pre-write full-bundle verification, exact closure/npm/schema inventories, tar topology/depth/work bounds, and credential rejection are enforced.                                                                                                                                                                                                                                                                                                     |
| SEC-P3-008 | S1       | `validationSuite: ["schema"]` was claimed although the closed operation-plan schema was not executed; several extended/bespoke plans were schema-invalid. | Closed in the active worktree. One finalizer owns the only computed plan digest and immediately validates the closed v1 schema; all 22 exported material planners and 21 mutation boundaries are inventory-guarded; dry-run/apply reject rehashed extensions; cleanup now schema-validates stored transaction and conflict plans before accepting their digests.                                                                                                                                                                 |
| SEC-P3-009 | S1       | Semantic conflict staging/resolution and legacy init apply paths could write outside one exact reviewed, crash-convergent plan.                           | Closed in the active worktree. Legacy direct install was removed; conflict trees publish atomically; multi-target choices use verified write-ahead recovery; all semantic apply APIs require the exact displayed digest.                                                                                                                                                                                                                                                                                                         |

## Closed findings and evidence

- Malicious registry metadata, unsafe redirects, dependency protocols, portable path collisions,
  response bounds, and identity collisions: 42 cases in
  [`../../tests/cli-security/registry-metadata-security.test.ts`](../../tests/cli-security/registry-metadata-security.test.ts).
- Transaction interruption at every declared lifecycle fault point and manifest-last ordering: 14
  cases in
  [`../../tests/cli-security/transaction-fault-matrix.test.ts`](../../tests/cli-security/transaction-fault-matrix.test.ts).
- Immutable release/identity/payload/base tampering and deterministic merge/line-ending attacks: nine
  cases plus retained deterministic corpora in
  [`../../tests/cli-security/update-merge-security.test.ts`](../../tests/cli-security/update-merge-security.test.ts).
- Cleanup rejects links, unknown inventory, credential-shaped artifacts, portable collisions,
  oversized inputs, active transactions/conflicts, referenced bases, and stale/tampered plans in
  [`../../tests/cli-clean/`](../../tests/cli-clean/).
- Registered transaction validators and exact rollback/recovery evidence are covered by
  [`../../tests/cli-transactions/transaction-validation.test.ts`](../../tests/cli-transactions/transaction-validation.test.ts)
  and the Semantic Update validation suites.
- Durable initialization and first-run recovery are covered by
  [`../../tests/cli-discovery/init-transaction.test.ts`](../../tests/cli-discovery/init-transaction.test.ts)
  plus the shared transaction/fault suites.
- Canonical operation-plan finalization, closed top-level/nested shape, hostile-error redaction,
  rehashed-extension rejection at dry-run/apply, exhaustive exported planner/mutator inventory, and
  the single digest-constructor invariant are covered by
  [`../../tests/cli-transactions/operation-plan-schema.test.ts`](../../tests/cli-transactions/operation-plan-schema.test.ts).
  Cleanup's stored-plan acceptance boundary additionally rejects a schema-invalid plan after both
  its semantic digest and transaction record reference are coherently rehashed in
  [`../../tests/cli-clean/clean.test.ts`](../../tests/cli-clean/clean.test.ts).
- Release inventory, coherent rehash/tamper, required-schema, mirror, and static-bundle checks are
  covered by
  [`../../tests/generation/release-protocol.test.ts`](../../tests/generation/release-protocol.test.ts).
- Exact enrolled-native release routing through offline search, view, add, and update—including
  identity binding, alias closure, packed execution, unsupported-adapter refusal, and fail-closed
  missing-release behavior—is covered by the registry-management, discovery, acquisition, source,
  and semantic-update suites at checkpoint `44a7829`.
- Authenticated acquisition is covered at both metadata and immutable-artifact boundaries: the
  environment value is the complete `Authorization` field, missing or invalid values fail before a
  request, credentials are stripped from mirrors and cross-origin redirects, and no plan, cache,
  result, or persisted configuration includes the value.
- Production dependency policy is enforced by `pnpm audit:production` at moderate severity and by
  the security workflow. The workspace override resolves
  [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) to PostCSS
  `8.5.19`; the production audit reports no known vulnerability, and both Next.js applications
  build with the patched dependency.
- The full development-tool audit is separately enforced at high severity. It currently reports one
  moderate advisory,
  [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf), in
  `@opentelemetry/core@1.30.1`, reachable only through the development-only Lighthouse to Sentry
  dependency path. Lighthouse is invoked with error reporting disabled, so that telemetry path is
  not activated by Mergora's quality gate. This is a recorded temporary toolchain exception, not a
  claim of a vulnerability-free development graph; high and critical advisories remain
  release-blocking.
- The active worktree passes the focused current gates: 686 unit tests, 269 registry tests, 474 CLI
  tests with one intentional cleanup-policy skip, all 21 workspace typechecks, 1,050-artifact drift
  verification, and pinned Shadcn 4.13.0 validation for all 178 source-present items. The 21-project
  production build, 956-page static site build, 907 component-browser passes with two intentional
  platform-policy skips, 46 website-browser passes with two intentional forced-color skips, and the
  deterministic seven-tarball/four-lane consumer evidence are green locally. Exact-commit CI and
  release-bound evidence remain separate.

## Approval rule

No S0, S1, or implementation-level S2 finding remains in the reviewed local P3 boundary. P3 remains
gate-failed until the exact packed replay and security result are retained by fresh exact-commit CI,
the official mirror is verified against a real immutable release payload, and the release-bound
review/sign-off gates exist. This document records evidence; it is not a security certification.
