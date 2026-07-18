# P3 security and data-loss audit

- Review date: 2026-07-18
- Reviewed checkpoint: `385f4aa`
- Scope: CLI transactions, Semantic Sync, registry acquisition, Contracts, migrations, offline
  artifacts, generated release protocol, and clean-consumer evidence
- Result: open release blockers; P3 is not approved

This was a read-only review of the implemented P3 surface against the normative transaction,
provenance, registry, and update requirements. It found no S0 issue. The adversarial test tranche
closed the concrete shadcn dependency/path, redirect, immutable-digest, line-ending, unequal-overlap,
and transaction fault-point defects discovered during implementation. The following findings remain
open and prevent a P3 exit claim.

| ID         | Severity | Finding                                                                                                                       | Disposition                                                                                                                          |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-P3-001 | S1       | Semantic Update advertises parse, type/import, token, config, and Contract validation labels that are not executed as gates.  | Open. Add staged-overlay and post-commit validators to the shared transaction engine; derive plan labels only from registered gates. |
| SEC-P3-002 | S1       | Initialization is not journaled through the durable source transaction/recovery protocol and can be interrupted mid-sequence. | Open. Normalize initialization onto the shared transaction lifecycle and parameterize the fault matrix over it.                      |
| SEC-P3-003 | S2       | Enrolled registries, verified cache, vendor snapshots, GitHub mirrors, and npm mirrors do not feed one immutable resolver.    | Open. Implement one bounded acquisition API and route search/view/add/update/audit through it.                                       |
| SEC-P3-004 | S2       | CLI help/parser behavior and the public JSON result-envelope schema have status, warning, flag, and exit-code drift.          | Open. Generate the command table, help, parser constraints, and result schemas from one contract and validate every packed command.  |
| SEC-P3-005 | S2       | Package/hybrid provenance, explicit registry moves, runtime Contract Audit, and executable shadcn/mode migrations are absent. | Open. Complete these only through immutable inputs and the shared transaction engine.                                                |
| SEC-P3-006 | S2       | The stable release builder omits required search/schema/Contract/Passport/SBOM/archive/mirror bytes.                          | Open. Expand checksum coverage and the cross-document verifier before enabling release output.                                       |

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
- The aggregate local gate passes 21 package typechecks and 715 tests with one Windows-specific
  junction case skipped when the platform cannot create the required filesystem primitive.

## Approval rule

P3 remains gate-failed until every S1 finding above is fixed and regression-tested, all remaining S2
findings needed by the P3 exit scenario are closed, and the full packed lifecycle proves
customize/update/conflict/resolve/audit/rollback/recover/remove/offline behavior without workspace
knowledge. This document records evidence; it is not a security certification.
