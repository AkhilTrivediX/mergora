# Execution state

- Updated: 2026-07-18T16:52:13Z
- Implementation commit: `12a39f12e6079c3c35c4ee6dc55ab1d99a4df862`
- Branch: `feature/foundation`
- Pull request: draft [#2](https://github.com/AkhilTrivediX/mergora/pull/2); used as passive Linux/security evidence, not a review bottleneck
- Active phase: P3 registry/CLI/provenance/safe synchronization in progress
- Phase result: gate-failed until the open acquisition, provenance/migration, and complete-lifecycle findings close

## Completed since previous update

- Preserved the plan-free public history and confirmed that `PLANS/` and `.codex-runs/` are ignored,
  untracked, absent from the staged checkpoint, and absent from live public history.
- Renamed the working branch to `feature/foundation`; the obsolete `codex/*` remote branch and PR were
  removed/replaced. Work continues without waiting for human PR review.
- Expanded the deterministic generator to 487 artifacts and retained 78 honest
  `source-present-unreleased` catalog entries without Stable or release claims.
- Expanded the native release protocol builder/verifier to bind catalog/search, all stable public
  schemas, Contracts, Passports, quality/consumer evidence, SBOM, mirror manifest, portable release
  bundle, and checksums. Its generated plan remains correctly `blocked-unreleased`: 78 source
  definitions are present, 100 are missing, and no stable bytes are emitted.
- Implemented executable consumer Contracts plus static and host-registered runtime Contract Audit.
  Reviewed harness IDs can return bounded role/name/state, keyboard, focus, announcement, axe, and
  geometry evidence; missing, malformed, failed, or timed-out harnesses remain incomplete. The CLI
  registers no browser harness by default and therefore makes no fabricated runtime pass claim.
- Implemented transactional rollback, project creation, expanded configuration v1, pinned
  `shadcn@4.13.0` schema/CLI validation, offline local vendoring, DTCG theme operations, compiled
  migrations, and strict read-only cleanup with exact category selection.
- Implemented Semantic Sync Base/Local/Remote classification; JSON/JSONC, CSS, DTCG, text, binary,
  deletion, keep-region, and conservative structured TS/TSX/JS/JSX adapters; immutable release
  validation; authoritative-tree-preserving conflict packets; exact-target resolution; and
  provenance advancement through the transaction engine.
- Added registered staged-overlay and post-commit validators for media parsing, isolated TypeScript
  import/type checks, tokens, Contracts, project configuration, and transform context. Validation
  failure before commit performs no write; post-commit failure performs exact rollback, and recovery
  cannot bypass a validator that is unavailable after interruption.
- Routed first-run and repeat `init` writes through the shared durable transaction engine with
  staging, backups, journal checkpoints, manifest-last commit, exact rollback/recovery, stale-plan
  refusal, and idempotent no-op behavior.
- Implemented the bounded immutable acquisition primitive for vendor, verified cache, canonical
  network, and mirror candidates with exact identity/digest/byte/media checks. Consumer routing is
  still in progress and is not claimed complete.
- Centralized the CLI parser/help/result-envelope contract, fail-closed unknown flags, stable exit
  normalization, structured redaction, and packed JSON schema validation. Documented flags whose
  behavior does not yet exist remain rejected.
- Implemented external registry list/inspect/enroll/remove/verify with bounded fetches, HTTPS and
  localhost policy, redirect/auth stripping, exact identity acceptance, shadcn/native metadata
  validation, portable-path enforcement, and transactional configuration writes.
- Added NumberField, CurrencyField, and PercentageField canonical sources, package/shadcn outputs,
  Storybook state matrices, localized form/reset behavior, wheel safeguards, keyboard/pointer scrub,
  RTL/forced-colors coverage, and honest unreleased quality records. The compensation example uses
  its full EUR 3,500–12,000 range and defaults to EUR 12,000.
- Fixed clean Linux resolution by giving `mergora-registry` a workspace-only development export and
  making the direct CLI builder compile its exact runtime workspace dependencies. A missing-dist
  reproduction built all dependencies and ran the compiled CLI successfully.
- Implemented the `mergora-mcp` core with 20 deterministic read/plan tools, three resources, bounded
  NDJSON transport, strict inputs, redacted errors, and no apply/force/consent capability.
- Stabilized Dialog focus cleanup and geometry tests across repeated WebKit runs without suppressing
  live in-page warnings.
- Expanded the exact-tarball consumer matrix to all seven public artifacts. Next and Vite pass source
  and package modes, packed CLI execution, packed MCP capability smoke, frozen offline reinstall,
  dependency-tree audit, strict typecheck, and production builds. One evidence refresh plus two clean
  comparisons matched.
- Completed an adversarial P3 tranche: 42 malicious registry cases, 14 transaction lifecycle cases,
  immutable-tamper coverage, retained unequal-overlap/line-ending corpora, and strict cleanup
  inventory/tamper tests.
- Passed `pnpm check`: static/workspace/link/schema/generation/shadcn/lint/format gates, 21/21 package
  typechecks, and 715 tests with one platform-specific skip.
- Updated the P3 security/data-loss audit. No S0/S1 issue remains; three S2 lifecycle findings remain
  open and are recorded in
  [`../quality/P3_SECURITY_DATA_LOSS_AUDIT.md`](../quality/P3_SECURITY_DATA_LOSS_AUDIT.md).

## Next atomic batch

1. Connect immutable acquisition to discovery, add, update, and audit without weakening identity,
   size, origin, cross-document digest, or offline policy.
2. Complete package/hybrid provenance, explicit registry moves, reviewed executable migrations, and
   the remaining documented CLI flags/mode transitions through the shared transaction engine.
3. Add an official trusted browser-harness host and prove the public-style packed lifecycle through
   customize/update/conflict/resolve/audit/rollback/recover/remove/offline behavior.
4. Finish PasswordField/SearchField, then continue the P4 specialist, collection, date/time, and file
   batches with generated source/package/shadcn parity and honest unreleased evidence.
5. Refresh aggregate and packed-consumer evidence after each coherent source-generation checkpoint.

## Active failures

| ID      | Severity | Reproduction/evidence                                     | Owner/path                         | Next action                                                                  |
| ------- | -------- | --------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| P0-F004 | S2 gate  | Draft PR #2 run `29652787085` for `12a39f1`               | GitHub workflows/rules             | Treat CI as passive evidence; fix any reproducible failure without waiting.  |
| P2-F001 | S2 gate  | Inspect generated maturity blockers for 78 source entries | source families/Passports/evidence | Complete manual/parity/update/dogfood evidence before Stable promotion.      |
| P3-F002 | S2 gate  | Audit SEC-P3-003 through SEC-P3-005                       | resolver/provenance/migrations     | Close acquisition routing, provenance/moves, migrations, and full lifecycle. |
| P4-F001 | S2 gate  | Compare required P4/P5 catalog with canonical sources     | component families                 | Continue dependency-ordered specialist and system tranches.                  |

## External blockers

None. npm authentication is available for later read-only and publication checks. Exact package-name
availability, publish authority, trusted-publishing setup, and public deployment remain release-time
gates, not reasons to pause independent implementation.

## Latest evidence

| Gate                   | Command/run                                                       | Commit    | Result                                                                                       |
| ---------------------- | ----------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| Checkpoint focus       | 23 Vitest files across CLI/contracts/schemas/numeric/harness/MCP  | `12a39f1` | pass: 183 tests; packed CLI, durable init/recovery, runtime audit, release verifier, schemas |
| Numeric browser        | numeric Playwright matrix                                         | `12a39f1` | pass: 5/5; labels, locale, canonical form/reset, scrub/wheel, RTL, forced colors, axe        |
| Generation/shadcn      | registry drift check plus pinned shadcn 4.13.0                    | `12a39f1` | pass: 487 artifacts and exact 78-item source-derived shadcn inventory                        |
| Clean CLI build        | missing contracts/registry/CLI `dist` reproduction                | `12a39f1` | pass: dependencies rebuilt and compiled `search button --limit 1 --json` succeeded           |
| Root/package types     | root plus contracts/contract-runner/CLI/registry/Storybook checks | `12a39f1` | pass                                                                                         |
| Exact packed consumers | refresh plus two `node scripts/verify-p1-consumers.mjs` compares  | `385f4aa` | pass: seven tarballs, Next/Vite × source/package, offline reinstall/build, MCP `20/3/false`  |
| Public repository      | GitHub draft PR #2 run `29652787085`                              | `12a39f1` | pending Linux quality; CodeQL and dependency review run independently                        |
