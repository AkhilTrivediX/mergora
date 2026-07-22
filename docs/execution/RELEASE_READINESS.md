# Release readiness

- Updated: 2026-07-22
- Branch: `feature/vercel-deployment`
- Committed checkpoint: `cc0b0d0` plus active Vercel migration worktree
- Current scope: latest main `f5a5cc2`, published npm `1.0.0` package set, and active Vercel migration
- Release state: public packages and demo site exist; release evidence remains incomplete

This record reports phase gates, not a completion percentage. Later-phase source can exist while an
earlier gate remains failed.

| Phase                | Status            | Current evidence                                                                                                                                                                                                                                                                                                                                 | Blocking IDs                                                          |
| -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| P0 Audit/bootstrap   | in-progress       | Public repository, package map, governance, ADRs, pinned toolchain, workflows, and privacy boundaries exist. Latest main CI is red on Prettier drift plus the superseded Pages probe.                                                                                                                                                            | `BLK-CI-001`                                                          |
| P1 Contracts/tracer  | in-progress       | 405 tokens, 12 theme/density contexts, 144 contrast records, schemas, generators, matrix, exact-tarball consumers, and vertical-slice foundations exist. No release-bound evidence set exists.                                                                                                                                                   | `BLK-RELEASE-001`, `BLK-MATURITY-001`                                 |
| P2 Core primitives   | gate-failed       | Every required P2 entry has source and generated delivery surfaces plus Basic/Recommended story references. None is Stable; manual and complete risk evidence are absent.                                                                                                                                                                        | `BLK-MATURITY-001`, `BLK-A11Y-001`                                    |
| P3 CLI/sync          | gate-failed       | The exact-tarball lifecycle proves customize/update/conflict/resolve/audit/rollback/recover/remove/vendor/migrate/adopt with deterministic replay. Enrolled-current Stable, offline verified vendor, and Shadcn protocol/adoption routing pass locally (474 tests, one intentional skip). Exact-commit CI and a real release-time mirror remain. | `BLK-CLI-001`, `BLK-CI-001`                                           |
| P4 Production inputs | gate-failed       | All specialist, collection, date/time, and file definitions now have canonical source and generated surfaces. Their overall profiles and manual evidence remain incomplete.                                                                                                                                                                      | `BLK-MATURITY-001`, `BLK-A11Y-001`                                    |
| P5 Full catalog      | gate-failed       | All P5 definitions, including advanced data, media, AI, Kanban Beta target, and Rich Text Editor Labs target, have source and generated surfaces. Full risk, interaction, scale, browser, and manual evidence has not earned maturity.                                                                                                           | `BLK-MATURITY-001`, `BLK-A11Y-001`, `BLK-VISUAL-001`                  |
| P6 Workflow kits     | gate-failed       | All ten kit definitions have source and generated registry surfaces. Clean full-kit lifecycle, workflow, manual, and Stable/Beta evidence remains incomplete.                                                                                                                                                                                    | `BLK-MATURITY-001`, `BLK-CLI-001`, `BLK-A11Y-001`                     |
| P7 Site foundation   | in-progress       | The Next static site, root/base-path routes, live specimens, search, machine docs, blocked Quality Passports, real-component homepage, and Studio exist. `https://mergora.vercel.app/` and `/quality-lab/index.html` return 200; exact-current CI and release-bound deployment evidence remain.                                                  | `BLK-SITE-001`, `BLK-VERCEL-001`                                      |
| P8 Complete site     | in-progress       | The authoritative docs contract supplies all 2,806 State Lab rows and 178 blocked Passport documents; Studio round trips checked exports and machine routes exist. Public API extraction is complete at 3,431/3,431 described props. Manual review, immutable evidence, and public parity remain incomplete.                                     | `BLK-SITE-001`, `BLK-A11Y-001`, `BLK-VERCEL-001`                      |
| P9 Hardening         | in-progress       | The full component aggregate passes 907/909 with two intentional platform skips and zero failures; exact packed consumers pass four lanes and the full bounded lifecycle. Compatibility, visual review, manual review, exact CI, and release gates remain open.                                                                                  | `BLK-COMPAT-001`, `BLK-VISUAL-001`, `BLK-A11Y-001`, `BLK-RELEASE-001` |
| P10 Prerelease       | bypassed manually | The seven selected public packages were manually published as `1.0.0` on `latest`; no separate Alpha/Beta/RC publication evidence exists.                                                                                                                                                                                                        | `BLK-PUBLIC-001`, `BLK-NPM-001`, `BLK-RELEASE-001`                    |
| P11 Stable launch    | gate-failed       | Seven public npm packages are visible at `1.0.0` and the Vercel demo is reachable. The launch still lacks trusted-publishing/provenance proof, protected release evidence, manual accessibility evidence, GitHub Release, clean-room public install proof, and green exact-commit CI.                                                            | `BLK-PUBLIC-001`, `BLK-NPM-001`, `BLK-VERCEL-001`, `BLK-RELEASE-001`  |
| P12 Clean-room audit | not-started       | Public-only audit cannot run before a coherent Stable launch.                                                                                                                                                                                                                                                                                    | `BLK-PUBLIC-001`, `BLK-SIGN-001`                                      |

## Current catalog facts

- Generated inventory: 178 definitions, comprising 168 catalog entries and 10 workflow kits.
- Layers: 22 foundation, 113 component, 33 system, and 10 kit.
- Target maturity: 175 Stable, two Beta, and one Experimental.
- Current implementation status: 178 source-present-unreleased and zero unimplemented.
- Current publication status: packages are public, but all 178 component maturity records remain
  unpublished and profile-incomplete.
- Matrix evidence: 178 evidence-backed Mergora advantages, 178 visual signatures, 256 optional
  enhancements, 178 tested Basic stories, 178 tested Recommended stories, and 178 verified
  package/source/Shadcn parity records.
- Remaining matrix evidence: 129 interaction records are verified, 49 are partial, every
  accessibility record is partial, and all 178 overall profiles are incomplete.

See [`CATALOG_STATUS.md`](CATALOG_STATUS.md) for the full breakdown.

## Current generated and test evidence

| Gate                    | Evidence                                           | Current result                                                                                                                                              | Release limitation                                                               |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Tokens                  | `packages/tokens/src/generated/docs.json`          | 405 tokens, 12 resolved contexts, 144 contrast records                                                                                                      | Local deterministic evidence only                                                |
| Generation              | `registry/generated/artifact-manifest.json`        | 1,051 outputs including the manifest; 1,050 manifest entries include the docs contract                                                                      | No Stable release bytes                                                          |
| Matrix                  | `registry/generated/implementation-matrix.v1.json` | 178 records, all profile-complete columns populated                                                                                                         | All profiles remain incomplete                                                   |
| Component cross-browser | `tests/components/playwright.config.ts`            | 909 total: 907 passed, 2 intentional platform skips, 0 failures                                                                                             | Local active-worktree result; not exact-commit CI or manual device/AT evidence   |
| Exact tarball consumers | `tests/packed-consumers/evidence.json`             | Seven tarballs; four lanes; full bounded source lifecycle; WRITE/NO-WRITE replay                                                                            | Public npm provenance, non-Chromium packed runtime, and release binding remain   |
| Security                | `docs/quality/P3_SECURITY_DATA_LOSS_AUDIT.md`      | No open S0/S1; production dependency audit clean                                                                                                            | Exact-commit review, live release mirror provenance, and release evidence remain |
| Compatibility           | `tests/compatibility/matrix.v1.json`               | Nine framework, five manager, and Node/OS lanes scheduled                                                                                                   | Exact-commit CI result absent                                                    |
| Visual                  | `tests/visual/baseline.v1.json`                    | Approved reviewed baseline at `5c2fb93`; 16 eligible local replays passed                                                                                   | Four stories only; strict exact-commit Linux and catalog-wide evidence remain    |
| Site                    | `apps/web`, docs contract, static verifier         | State Lab 2,806 rows; 178 blocked Passports; 46/48 website cases with two policy skips; six Lighthouse routes pass; Vercel root and Quality Lab respond 200 | Exact-commit CI, release-bound public probe set, and manual review pending       |
| Public API              | `content/generated/api-index.json`                 | 178 entries, 530 groups, 3,431 props, 3,431 descriptions, 807 runtime defaults                                                                              | Local unreleased evidence; immutable/public release association remains absent   |
| Manual AT               | `node scripts/prepare-manual-evidence.mjs --plan`  | 178 items, 3,253 sessions, 4,124 tasks; all NOT RUN; zero claims                                                                                            | No completed session                                                             |

## Current GitHub and publication facts

- Repository: <https://github.com/AkhilTrivediX/mergora>
- Latest main checkpoint: `f5a5cc2`
- Latest main CI: repository quality fails on Prettier drift in `scripts/verify-p1-consumers.mjs`;
  the retired Pages workflow fails while probing `akhiltrivedi.me`.
- Package map: approved unscoped names in `config/public-packages.json`; availability observations
  are time-bound.
- Current npm authentication: `npm whoami` succeeds as `akhilx`; package provenance and trusted
  publishing remain separately unverified.
- Published npm packages: `mergora`, `mergora-ui`, `mergora-tokens`, `mergora-schema`,
  `mergora-registry`, `mergora-contracts`, and `mergora-mcp` are public at `1.0.0` on `latest`.
- GitHub Release: none.
- Website deployment: Vercel project `mergora` is ready at <https://mergora.vercel.app/>. The old
  GitHub Pages workflow is being retired in favor of the Vercel static-export path.
- Release/completion manifest: not generated.

## Promotion rule

No item or phase is promoted because its source renders, its Basic/Recommended stories exist, or a
focused suite passes. Promotion requires all evidence named by the item's risk class and the exact
phase gate, including manual review, immutable release association, public documentation, and clean
consumer proof where applicable. The 306-row current map is
[`TRACEABILITY.md`](TRACEABILITY.md).
