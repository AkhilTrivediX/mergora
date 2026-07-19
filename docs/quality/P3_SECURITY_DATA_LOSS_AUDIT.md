# P3 security and data-loss audit

- Review date: 2026-07-19
- Reviewed checkpoint: `625e400` through `c03d969` plus the active verified P3/P4 integration
  worktree
- Scope: CLI transactions, Semantic Sync, registry acquisition, Contracts, migrations, offline
  artifacts, generated release protocol, and clean-consumer evidence
- Result: no open S0 or S1 finding; the remaining S2 lifecycle findings keep P3 unapproved

This is the current review of the implemented P3 surface against the normative transaction,
provenance, registry, plan, and update requirements. It found no open S0 or S1 issue. The latest
adversarial tranches closed validator injection, digest omission, partial conflict-plan, Stable
vendor authenticity, tar topology, semantic-resolution crash convergence, and the last canonical
operation-plan acceptance bypass. Every exported material planner now reaches the one closed-schema
finalizer; dry-run and transaction apply validate schema plus digest; custom apply paths recompute a
finalized plan; and cleanup rejects schema-invalid stored plans even when an attacker recomputes the
plan and record digests.

| ID         | Severity | Finding                                                                                                                                                    | Disposition                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-P3-001 | S1       | Semantic Update advertised parse, type/import, token, config, and Contract validation labels that were not executed as gates.                              | Closed in the active worktree. Every non-built-in reviewed label now requires a fixed command-owned validator; planning validates the staged overlay without creating transaction state.                                                                                                                                                                         |
| SEC-P3-002 | S1       | Initialization was not journaled through the durable source transaction/recovery protocol and could be interrupted mid-sequence.                           | Closed. First-run/repeat init now uses one exact reviewed transaction digest, stages, backs up, journals, commits manifest last, rolls back, and recovers through the shared engine.                                                                                                                                                                             |
| SEC-P3-003 | S2       | Enrolled registries, verified cache, vendor snapshots, GitHub mirrors, and npm mirrors do not yet feed every real consumer through one immutable resolver. | Partial. Canonical/cache/mirror/Stable-vendor acquisition is bounded and identity-bound; enrolled-registry consumption and all command routing remain open.                                                                                                                                                                                                      |
| SEC-P3-004 | S2       | Some documented CLI flags/mode transitions remain unimplemented even though parser/help/envelope/error behavior derives from one strict command contract.  | Partial. `--ui-version` exists, but configured `--mode`, `--no-format`, contract/example provisioning, adoption origin, context, and complete migration switches remain open.                                                                                                                                                                                    |
| SEC-P3-005 | S2       | Package/hybrid provenance, explicit registry moves, an official browser Contract Audit host, and executable shadcn/mode migrations were absent.            | Partial. Provenance/mode engines, explicit reviewed moves, and an opt-in official browser host now exist; CLI mode routing and executable framework/shadcn migration coverage remain open.                                                                                                                                                                       |
| SEC-P3-006 | S2       | The stable release builder omitted required search/schema/Contract/Passport/SBOM/archive/mirror bytes.                                                     | Closed at `12a39f1`. The builder and verifier bind exact embedded bytes, all required schemas/evidence, search, mirror manifest, portable release bundle, SBOM, and checksums.                                                                                                                                                                                   |
| SEC-P3-007 | S1       | Stable vendor planning accepted caller-shaped snapshots/inventory and incomplete npm/tar verification at the write boundary.                               | Closed in the active worktree. Acquired release and frozen snapshot brands, pre-write full-bundle verification, exact closure/npm/schema inventories, tar topology/depth/work bounds, and credential rejection are enforced.                                                                                                                                     |
| SEC-P3-008 | S1       | `validationSuite: ["schema"]` was claimed although the closed operation-plan schema was not executed; several extended/bespoke plans were schema-invalid.  | Closed in the active worktree. One finalizer owns the only computed plan digest and immediately validates the closed v1 schema; all 22 exported material planners and 21 mutation boundaries are inventory-guarded; dry-run/apply reject rehashed extensions; cleanup now schema-validates stored transaction and conflict plans before accepting their digests. |
| SEC-P3-009 | S1       | Semantic conflict staging/resolution and legacy init apply paths could write outside one exact reviewed, crash-convergent plan.                            | Closed in the active worktree. Legacy direct install was removed; conflict trees publish atomically; multi-target choices use verified write-ahead recovery; all semantic apply APIs require the exact displayed digest.                                                                                                                                         |

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
- The active worktree passes `pnpm check`: 119 Vitest files, 1,011 passed tests, one intentional
  platform skip, all 21 workspace typechecks, 571-artifact drift verification, and pinned
  shadcn 4.13.0 validation for all 92 source-present items; 86 catalog definitions remain
  unimplemented. The 21-project production build, 27-artifact static export, 178 browser passes with
  four intentional forced-colors skips, and deterministic seven-tarball consumer writer plus two
  exact comparisons are green.

## Approval rule

No S0 or S1 finding remains. P3 remains gate-failed until the remaining S2 findings needed by the
P3 exit scenario are closed and the full packed lifecycle proves
customize/update/conflict/resolve/audit/rollback/recover/remove/offline behavior without workspace
knowledge. This document records evidence; it is not a security certification.
