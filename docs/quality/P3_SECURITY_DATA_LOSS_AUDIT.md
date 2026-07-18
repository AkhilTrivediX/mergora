# P3 security and data-loss audit

- Review date: 2026-07-18
- Reviewed checkpoint: `12a39f1`
- Scope: CLI transactions, Semantic Sync, registry acquisition, Contracts, migrations, offline
  artifacts, generated release protocol, and clean-consumer evidence
- Result: no open S0/S1 finding; three S2 lifecycle findings remain and P3 is not approved

This was a read-only review of the implemented P3 surface against the normative transaction,
provenance, registry, and update requirements. It found no S0 issue. The adversarial test tranche
closed the concrete shadcn dependency/path, redirect, immutable-digest, line-ending, unequal-overlap,
transaction-validation, initialization-recovery, and release-bundle defects discovered during
implementation. Findings marked open or partial below still prevent a P3 exit claim.

| ID         | Severity | Finding                                                                                                                                                       | Disposition                                                                                                                                                                    |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-P3-001 | S1       | Semantic Update advertised parse, type/import, token, config, and Contract validation labels that were not executed as gates.                                 | Closed at `12a39f1`. Registered staged/post-commit validators now execute, fail before writes or roll back exactly, and cannot be bypassed during recovery.                    |
| SEC-P3-002 | S1       | Initialization was not journaled through the durable source transaction/recovery protocol and could be interrupted mid-sequence.                              | Closed at `12a39f1`. First-run/repeat init now stages, backs up, journals, commits manifest last, rolls back, and recovers through the shared engine.                          |
| SEC-P3-003 | S2       | Enrolled registries, verified cache, vendor snapshots, GitHub mirrors, and npm mirrors do not yet feed every real consumer through one immutable resolver.    | Partial. The bounded acquisition primitive and adversarial cache/vendor/canonical/mirror tests exist; discovery/add/update/audit routing remains open.                         |
| SEC-P3-004 | S2       | Some documented CLI flags/mode transitions remain unimplemented even though parser/help/envelope/error behavior now derives from one strict command contract. | Partial. Packed JSON envelopes and stable exit normalization pass; implement or explicitly disposition `--ui-version`, `--mode`, and `--no-format`.                            |
| SEC-P3-005 | S2       | Package/hybrid provenance, explicit registry moves, an official browser Contract Audit host, and executable shadcn/mode migrations remain absent.             | Partial. Trusted host runtime adapters now execute bounded reviewed harness IDs, but no default browser harness or remaining provenance/migration lifecycle is claimed.        |
| SEC-P3-006 | S2       | The stable release builder omitted required search/schema/Contract/Passport/SBOM/archive/mirror bytes.                                                        | Closed at `12a39f1`. The builder and verifier bind exact embedded bytes, all required schemas/evidence, search, mirror manifest, portable release bundle, SBOM, and checksums. |

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
- Release inventory, coherent rehash/tamper, required-schema, mirror, and static-bundle checks are
  covered by
  [`../../tests/generation/release-protocol.test.ts`](../../tests/generation/release-protocol.test.ts).
- The `12a39f1` checkpoint passed 183 focused tests, five numeric browser tests, root/package
  typechecks, 487-artifact drift verification, and pinned shadcn validation. Linux aggregate evidence
  is running in draft PR #2.

## Approval rule

No S0/S1 finding remains at this checkpoint. P3 remains gate-failed until all remaining S2 findings
needed by the P3 exit scenario are closed and the full packed lifecycle proves
customize/update/conflict/resolve/audit/rollback/recover/remove/offline behavior without workspace
knowledge. This document records evidence; it is not a security certification.
