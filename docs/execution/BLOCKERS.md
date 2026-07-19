# Blockers

External blockers are limited to missing authority, exhausted approved names, required legal acceptance, or an out-of-repository destructive action. Ordinary unfinished implementation is not an external blocker.

## Active external blockers

None.

## Resolved external blockers

| ID               | Resolved   | Resolution evidence                                                                                                                                                                            | Remaining release gate                                                                                                                                              |
| ---------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXT-NPM-AUTH-001 | 2026-07-18 | Authenticated read-only checks selected the verified approved unscoped map without recording the account identity or credentials. See `config/public-packages.json` and `PACKAGE_IDENTITY.md`. | Recheck availability and publish authority immediately before initial publication; then verify tarballs, provenance, trusted publishing, and clean remote installs. |

## Implementation gates, not external blockers

- The current P3 checkpoint is `075e214` plus the verified active worktree on
  `feature/foundation` in draft PR [#2](https://github.com/AkhilTrivediX/mergora/pull/2); a new commit,
  Linux checks, merge, and protected-main evidence remain open.
- `pnpm check` passes 1,011 tests with one intentional platform skip, all 21 package typechecks,
  generation, and shadcn validation. The production/static build, 178 browser passes with four
  intentional forced-colors skips, and writer plus two exact consumer comparisons pass.
- GitHub Discussions, environments, security settings, labels, main protection, and release-tag immutability are configured. Pages deployment and required CI contexts remain unexercised.
- The approved unscoped package map is verified from authenticated read-only checks. Availability and legal/confusion review remain time-bound pre-publication gates.
- Exact unreleased package tarballs and generated registry artifacts now exist and pass P1 consumers,
  including the read/plan-only MCP runtime. No public npm package, deployed production site/registry,
  or release exists yet.
- No S0 P3 finding remains. One systemic S1 operation-plan schema binding finding plus universal
  registry/mode routing, executable migrations, and full packed-lifecycle S2 gaps remain open in
  [`../quality/P3_SECURITY_DATA_LOSS_AUDIT.md`](../quality/P3_SECURITY_DATA_LOSS_AUDIT.md). These are
  implementation gates, not external blockers.

These items require implementation or repository configuration and must not be used to pause independent work.
