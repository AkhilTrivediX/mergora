# Execution state

- Updated: 2026-07-18T15:32:00Z
- Implementation commit: `385f4aa92444bbb6dac5f1a9f0e14a7c38a50a3e`
- Branch: `feature/foundation`
- Pull request: draft [#2](https://github.com/AkhilTrivediX/mergora/pull/2); used as passive Linux/security evidence, not a review bottleneck
- Active phase: P3 registry/CLI/provenance/safe synchronization in progress
- Phase result: gate-failed until the open validation, acquisition, and complete-lifecycle findings close

## Completed since previous update

- Preserved the plan-free public history and confirmed that `PLANS/` and `.codex-runs/` are ignored,
  untracked, absent from the staged checkpoint, and absent from live public history.
- Renamed the working branch to `feature/foundation`; the obsolete `codex/*` remote branch and PR were
  removed/replaced. Work continues without waiting for human PR review.
- Expanded the deterministic generator to 469 artifacts and retained 75 honest
  `source-present-unreleased` catalog entries without Stable or release claims.
- Implemented the native release protocol planner/verifier. Its generated output is correctly
  `blocked-unreleased`: 75 source definitions are present, 103 are missing, and no stable bytes are
  emitted.
- Implemented executable consumer Contracts plus deterministic static Contract Audit. Browser,
  keyboard, accessibility, and responsive modes report unavailable evidence rather than fabricated
  passes.
- Implemented transactional rollback, project creation, expanded configuration v1, pinned
  `shadcn@4.13.0` schema/CLI validation, offline local vendoring, DTCG theme operations, compiled
  migrations, and strict read-only cleanup with exact category selection.
- Implemented Semantic Sync Base/Local/Remote classification; JSON/JSONC, CSS, DTCG, text, binary,
  deletion, keep-region, and conservative structured TS/TSX/JS/JSX adapters; immutable release
  validation; authoritative-tree-preserving conflict packets; exact-target resolution; and
  provenance advancement through the transaction engine.
- Implemented external registry list/inspect/enroll/remove/verify with bounded fetches, HTTPS and
  localhost policy, redirect/auth stripping, exact identity acceptance, shadcn/native metadata
  validation, portable-path enforcement, and transactional configuration writes.
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
- Completed a read-only P3 security/data-loss audit. No S0 issue was found; two S1 and four S2
  release-blocking findings are recorded in
  [`../quality/P3_SECURITY_DATA_LOSS_AUDIT.md`](../quality/P3_SECURITY_DATA_LOSS_AUDIT.md).

## Next atomic batch

1. Add registered staged-overlay and post-commit validators to the shared transaction engine, and
   derive Semantic Update validation labels only from validators that actually execute.
2. Normalize initialization onto the durable transaction/recovery lifecycle and extend the complete
   fault matrix to it.
3. Build one immutable acquisition abstraction for network/cache/vendor/mirror inputs and connect it
   to discovery, add, update, and audit without weakening identity, size, origin, or offline policy.
4. Reconcile the CLI command/flag/status/exit table with the public JSON schemas and validate every
   packed command envelope.
5. Continue catalog work only in parallel-safe tranches; the P4/P5 audit found 91 required Stable
   entries with no canonical source, plus incomplete Combobox and Data Grid tracers.

## Active failures

| ID      | Severity | Reproduction/evidence                                     | Owner/path                         | Next action                                                                 |
| ------- | -------- | --------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| P0-F004 | S2 gate  | Draft PR #2 checks after pushing `385f4aa`                | GitHub workflows/rules             | Observe passive Linux/security evidence and fix real failures.              |
| P2-F001 | S2 gate  | Inspect generated maturity blockers for 75 source entries | source families/Passports/evidence | Complete manual/parity/update/dogfood evidence before Stable promotion.     |
| P3-F001 | S1 gate  | `P3_SECURITY_DATA_LOSS_AUDIT.md` SEC-P3-001/002           | transaction/update/configuration   | Execute real validators and journal initialization through shared recovery. |
| P3-F002 | S2 gate  | Audit SEC-P3-003 through SEC-P3-006                       | resolver/contracts/release/CLI     | Close acquisition, schema, runtime-audit, migration, and release gaps.      |
| P4-F001 | S2 gate  | Compare required P4/P5 catalog with canonical sources     | component families                 | Implement dependency-ordered collection, numeric, and specialist tranches.  |

## External blockers

None. npm authentication is available for later read-only and publication checks. Exact package-name
availability, publish authority, trusted-publishing setup, and public deployment remain release-time
gates, not reasons to pause independent implementation.

## Latest evidence

| Gate                    | Command/run                                                         | Commit       | Result                                                                                           |
| ----------------------- | ------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| Workspace aggregate     | `pnpm check`                                                        | `385f4aa`    | pass: 469 artifacts, shadcn CLI, lint/format, 21/21 typechecks, 715 pass and one platform skip   |
| Exact packed consumers  | refresh plus two `node scripts/verify-p1-consumers.mjs` compares    | `385f4aa`    | pass: seven tarballs, Next/Vite × source/package, offline reinstall/build, MCP `20/3/false`      |
| Semantic Sync           | `pnpm exec vitest run tests/cli-semantic-sync tests/merge-fixtures` | `385f4aa`    | pass: deterministic update, conflicts, exact resolution, structured adapters, immutable tamper   |
| Adversarial P3 security | `pnpm exec vitest run tests/cli-security`                           | `385f4aa`    | pass: 65 cases across registry, transaction lifecycle, immutable update, and retained corpora    |
| Cleanup                 | `pnpm exec vitest run tests/cli-clean`                              | `385f4aa`    | pass: 11 cases and one platform skip; explicit, bounded, journaled, fail-closed                  |
| Packed command contract | `pnpm exec vitest run tests/cli-discovery/packed-commands.test.ts`  | `385f4aa`    | pass: 16 executable command/consent/output cases                                                 |
| Browser stability       | WebKit suite repeated three times                                   | `385f4aa`    | pass: 30 checks and six explicit policy skips; no teardown warning failures                      |
| Public repository       | GitHub draft PR #2                                                  | pending push | branch checkpoint will trigger Linux quality, CodeQL, dependency review, and consumer/browser CI |
