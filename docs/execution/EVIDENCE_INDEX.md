# Current evidence index

- Updated: 2026-07-20T18:20:13Z
- Merged checkpoint: `4a1ef67` (PR #7)
- Candidate checkpoint: `28a2eb6` (PR #9)
- Evidence scope: merged `main` plus the exact in-flight PR #9 candidate; it is not release evidence
- Publication state: `blocked-unreleased`

This index gives the execution records a compact vocabulary for current repository evidence. It is
not a release evidence manifest. A bundle marked local or provisional cannot satisfy a requirement
that calls for a protected release commit, public URL, npm provenance, manual assistive-technology
record, or independent clean-room run.

## Status vocabulary

- `complete`: every condition in the requirement has current evidence at the required public or
  immutable scope.
- `partial`: relevant implementation or test evidence exists, but one or more required conditions
  remain unproved.
- `not-run`: the required review or execution has not been performed.
- `blocked`: the assertion cannot be executed or approved until a named prerequisite exists. This
  does not make ordinary unfinished work an external blocker.

No Definition of Done assertion is currently `complete` under the exact-release evidence protocol.

## Evidence bundles

### E-REPOSITORY

- Public repository: <https://github.com/AkhilTrivediX/mergora>
- Current candidate: `feature/data-grid-large-data`,
  [PR #9](https://github.com/AkhilTrivediX/mergora/pull/9)
- Package identity: [`../../config/public-packages.json`](../../config/public-packages.json) and
  [`PACKAGE_IDENTITY.md`](PACKAGE_IDENTITY.md)
- Architecture decisions: [`../adr/`](../adr/)
- Governance and policy sources: repository-root governance files and [`.github/`](../../.github/)
- Privacy boundaries: [`.gitignore`](../../.gitignore) excludes private plan/run material; the
  private plan directory is absent from public history.

PR #9 refreshes the changed packed-consumer evidence with a full WRITE and immediate NO-WRITE
replay. Its repository quality, packed consumers, site, CodeQL, dependency-audit, and
dependency-review checks are green; the browser/accessibility/visual lane remains the only
in-progress required check. This is candidate evidence only and does not satisfy release gates.

### E-TOKENS

- Generated token documentation: [`../../packages/tokens/src/generated/docs.json`](../../packages/tokens/src/generated/docs.json)
- Token compiler and tests: [`../../tooling/token-compiler/`](../../tooling/token-compiler/) and
  [`../../tests/tokens/`](../../tests/tokens/)
- Current generated facts: 405 tokens, 12 theme/density contexts, 12 resolved token artifacts, and
  144 recorded contrast pairs.
- Shared Mergora signature policy:
  [`../../registry/quality/mergora-signature-policy.v1.json`](../../registry/quality/mergora-signature-policy.v1.json)

These are deterministic local artifacts. They do not replace visual review, forced-colors review,
or release-bound evidence.

### E-GENERATION

- Generated catalog: [`../../registry/generated/catalog.json`](../../registry/generated/catalog.json)
- Artifact manifest:
  [`../../registry/generated/artifact-manifest.json`](../../registry/generated/artifact-manifest.json)
- Source transform plan:
  [`../../registry/generated/source-transform-plan.json`](../../registry/generated/source-transform-plan.json)
- Package export plan:
  [`../../registry/generated/package-export-plan.json`](../../registry/generated/package-export-plan.json)
- Generation tests: [`../../tests/generation/`](../../tests/generation/)

The current generator reports 1,051 deterministic outputs including the artifact manifest itself;
the manifest contains 1,050 entries for the other generated outputs, including
[`../../registry/generated/documentation-contract-index.v1.json`](../../registry/generated/documentation-contract-index.v1.json).
All 178 definitions have canonical source and generated package, native-registry, and Shadcn
surfaces. The release protocol still emits no Stable release bytes.

### E-CATALOG

- Implementation matrix:
  [`../../registry/generated/implementation-matrix.v1.json`](../../registry/generated/implementation-matrix.v1.json)
- Profile shards:
  [`../../registry/quality/implementation-profiles/`](../../registry/quality/implementation-profiles/)
- Matrix tests:
  [`../../tests/generation/implementation-matrix.test.ts`](../../tests/generation/implementation-matrix.test.ts)

Current inventory and evidence counts:

| Measure                                                                 |      Current value |
| ----------------------------------------------------------------------- | -----------------: |
| Definitions                                                             |                178 |
| Catalog entries excluding kits                                          |                168 |
| Workflow kits                                                           |                 10 |
| Foundation / component / system / kit                                   | 22 / 113 / 33 / 10 |
| Core / Labs                                                             |            177 / 1 |
| Target Stable / Beta / Experimental                                     |        175 / 2 / 1 |
| Source-present-unreleased                                               |                178 |
| Published maturity records                                              |                  0 |
| Evidence-backed Mergora advantages                                      |                178 |
| Evidence-backed visual signatures                                       |                178 |
| Evidence-backed optional enhancements                                   |                256 |
| Tested Basic / Recommended stories                                      |          178 / 178 |
| Verified package/source/Shadcn parity                                   |                178 |
| Verified / partial interaction evidence                                 |           129 / 49 |
| Partial accessibility evidence                                          |                178 |
| Profiled-incomplete                                                     |                178 |
| Maturity assessment not-ready / beta-candidate / experimental-candidate |        175 / 2 / 1 |

The target maturity field is a requirement, not a release claim. The generated catalog has
`publicationStatus: blocked-unreleased` and every `publishedMaturity` is null.

### E-LOCAL-QUALITY

- Aggregate command: `pnpm check`
- Browser command: `pnpm test:browser`

The current local aggregate passes 200 test files and 1,540 tests, with one intentional skip. Its
serial official-browser audit passes 5/5. The independent full browser command is also green: the
root tracer records 34 passes and two intentional forced-colors skips from 36 scheduled cases; the
component catalog records 907 passes and two intentional skips from 909; diagnostics pass 1/1; and
the website records 46 passes and two intentional forced-colors skips from 48. These remain
active-worktree results until repeated for the exact pushed commit.

### E-STORYBOOK

- Storybook source: [`../../apps/storybook/`](../../apps/storybook/)
- Global viewport, direction, theme, contrast, density, and motion controls:
  [`../../apps/storybook/.storybook/preview.ts`](../../apps/storybook/.storybook/preview.ts)
- Static global-control tests: [`../../tests/storybook/`](../../tests/storybook/)
- Browser stories and component tests: [`../../tests/components/`](../../tests/components/)

All 178 matrix records point to a tested Basic story and a tested Recommended Mergora story. This
does not mean every required state, locale, browser, or manual path is complete.

### E-BROWSER

- Component browser configuration:
  [`../../tests/components/playwright.config.ts`](../../tests/components/playwright.config.ts)
- Root accessibility browser test: [`../../tests/browser/accessibility.spec.ts`](../../tests/browser/accessibility.spec.ts)
- Data Grid browser proof:
  [`../../tests/components/data-grid/data-grid.browser.spec.ts`](../../tests/components/data-grid/data-grid.browser.spec.ts)
- Browser evidence interpretation:
  [`../quality/BROWSER_EVIDENCE.md`](../quality/BROWSER_EVIDENCE.md)

The complete component aggregate run on 2026-07-20 scheduled 909 cases across Chromium, Firefox,
and WebKit: 907 passed, two were intentionally skipped, and zero failed. Both skips are the
Firefox/WebKit instances of the one mobile-touch-emulation case that explicitly requires Chromium's
Playwright device emulation. The root tracer separately schedules 36 cases, with 34 passes and only
the two intentional non-Chromium forced-colors skips; diagnostics pass 1/1. This is active-worktree
automated evidence, not an immutable exact-release CI artifact or manual real-device/
assistive-technology evidence. The coordinated website static-export suite also passes locally: 46
of 48 cases pass, the Firefox/WebKit forced-colors cases are the only two explicit platform-policy
skips, and no runtime-error filter or waiver is present.

### E-PACKED-CONSUMERS

- Tracked evidence: [`../../tests/packed-consumers/evidence.json`](../../tests/packed-consumers/evidence.json)
- Matrix: [`../../tests/packed-consumers/matrix.json`](../../tests/packed-consumers/matrix.json)
- Driver: [`../../scripts/verify-p1-consumers.mjs`](../../scripts/verify-p1-consumers.mjs)

The tracked record covers seven exact `0.0.0` tarballs and four Next.js/Vite package/source lanes.
All four report frozen offline reinstall, no workspace resolution, strict types, production build,
hydration, Dialog interaction, and Data Grid sorting. The source lifecycle records disjoint and
overlapping updates, a complete local-only conflict packet, explicit take-local resolution, static
Contract Audit, ownership-aware removal and rollback, injected commit-file recovery, offline local
vendor verification, built-in shadcn migration, and exact shadcn-v1 adoption. A final WRITE run and
its immediate NO-WRITE replay matched deterministically in the current gate refresh. Public npm
provenance, non-Chromium packed runtime, and manual assistive-technology proof remain open.

### E-CLI

- CLI source: [`../../packages/cli/src/`](../../packages/cli/src/)
- Registry SDK: [`../../packages/registry/src/`](../../packages/registry/src/)
- Transaction and provenance evidence:
  [`../quality/P3_TRANSACTION_PROVENANCE.md`](../quality/P3_TRANSACTION_PROVENANCE.md)
- CLI and transaction tests: [`../../tests/cli-transactions/`](../../tests/cli-transactions/),
  [`../../tests/cli-security/`](../../tests/cli-security/), and
  [`../../tests/cli-package-modes/`](../../tests/cli-package-modes/)

Semantic Sync, durable transactions, manifest-last commits, conservative merge adapters,
conflict bundles, exact resolution choices, rollback/recovery, registered validators,
enrolled-current Stable identity-bound routing, offline verified Stable vendor routing, Shadcn
protocol/adoption paths, read/plan-only MCP, and the bounded full packed lifecycle are implemented.
The local CLI gate passes 474 tests with one intentional cleanup-policy skip. Exact-commit CI and
official-mirror verification against a real immutable release payload remain open.

### E-SECURITY

- Current review: [`../quality/P3_SECURITY_DATA_LOSS_AUDIT.md`](../quality/P3_SECURITY_DATA_LOSS_AUDIT.md)
- Security workflow: [`../../.github/workflows/security.yml`](../../.github/workflows/security.yml)
- Production dependency audit command: `pnpm audit:production`
- Full high-threshold audit command: `pnpm audit:high`

The production dependency audit currently reports no known vulnerability. The high-threshold full
development graph gate records one moderate OpenTelemetry advisory through development-only
Lighthouse/Sentry; Lighthouse error reporting is disabled. The license gate passes. No S0 or S1 P3
finding is open. Exact-commit review, real release-payload mirror provenance, and release-bound
evidence keep P3 unapproved.

### E-COMPATIBILITY

- Scheduled matrix: [`../../tests/compatibility/matrix.v1.json`](../../tests/compatibility/matrix.v1.json)
- Matrix test: [`../../tests/compatibility/compatibility-matrix.test.ts`](../../tests/compatibility/compatibility-matrix.test.ts)
- Nightly workflow: [`../../.github/workflows/nightly.yml`](../../.github/workflows/nightly.yml)

The matrix schedules nine framework profiles, five package-manager profiles, Node 22.14/24.12,
and Linux/Windows/macOS smoke lanes. Its own `verificationStatus` is `scheduled`; exact-commit CI
results are not yet evidence.

### E-VISUAL

- Baseline policy and record: [`../../tests/visual/baseline.v1.json`](../../tests/visual/baseline.v1.json)
  and [`../../tests/visual/README.md`](../../tests/visual/README.md)

The canonical four-story cross-commit baseline is approved at `5c2fb93` with a named agent review,
timestamp, explanation, affected-story list, and SHA-256 review-bundle digest. Its 16 eligible
comparisons across Chromium, Firefox, and WebKit replayed unchanged locally; the two non-Chromium
forced-colors skips are expected under policy. Exact-commit Linux comparison and catalog-wide visual
coverage remain incomplete.

### E-SITE

- Next.js site: [`../../apps/web/`](../../apps/web/)
- Static-export verifier: [`../../scripts/verify-static-export.mjs`](../../scripts/verify-static-export.mjs)
- Performance verifier: [`../../scripts/verify-site-performance.mjs`](../../scripts/verify-site-performance.mjs)
- Generated docs/search/API data: [`../../content/generated/`](../../content/generated/)
- Authoritative documentation contract:
  [`../../registry/generated/documentation-contract-index.v1.json`](../../registry/generated/documentation-contract-index.v1.json)

The authoritative contract covers 178 items and 2,806 State Lab rows: 1,717 applicable state/story
pointers and 1,089 explicit not-applicable rationales. The site implements those catalog-wide State
Lab records, 178 digest-bearing fail-closed Passport JSON documents, real Button/Dialog/Combobox/
Data Grid homepage specimens, checked Studio share and five-format export/import round trips, and
human plus machine item/docs/navigation routes. Public API extraction covers 178 entries, 530
groups, 3,431 declared props, 3,431 descriptions, and 807 runtime defaults with no generated review
placeholders. Site tests, API validation, and 1,929 documentation links across 243 Markdown files
pass locally. The forced 21-workspace build at `/mergora` produces the production Storybook and all
956 static pages; Quality Lab assembly succeeds, and the static-export verifier validates 4,259
text artifacts. The sitemap verifier now handles the XML declaration correctly and has six passing
regression tests. The coordinated website suite passes 46 of 48 cases with two documented
platform-policy skips, and all six Lighthouse routes score 95-96 for performance and 100 for
accessibility, best practices, and SEO. Exact-commit CI, manual review, and deployment remain open.
None of this local implementation is immutable release or public deployment evidence.

### E-MANUAL

- Manual evidence policy and template: [`../quality/manual/`](../quality/manual/)
- Preparation command: `pnpm test:manual:prepare`

The read-only preparation plan covers 178 items, 3,253 exact environment sessions, and 4,124 task
observations. Every item, session, and task is `not-run`, reviewers and artifacts are blank, and the
plan declares `evidenceClaim: none`. No completed manual assistive-technology session is recorded.
NVDA, JAWS, VoiceOver, TalkBack, Voice Access/Control, Switch Control/Access, physical touch/mobile,
zoom/reflow, forced-colors, and independent Risk Class 3 review therefore remain open at their
required depth.

### E-RELEASE

- Release protocol plan:
  [`../../registry/generated/release-protocol/plan.json`](../../registry/generated/release-protocol/plan.json)
- Release workflows: [`../../.github/workflows/`](../../.github/workflows/)
- Release evidence directory policy: [`../quality/releases/`](../quality/releases/)

The plan is `blocked-unreleased`, `publishable: false`, and has no release identity, version,
commit, artifacts, Passports, manual evidence, public origin, or emitted release artifact. No Alpha,
Beta, RC, Stable GitHub Release, completion manifest, or protected publication run exists.

### E-PUBLIC

- npm package map: [`../../config/public-packages.json`](../../config/public-packages.json)
- Intended production origin: <https://akhiltrivedix.github.io/mergora/>

No Mergora package has been published by this run and npm `latest` does not identify a coherent
Mergora release. The Pages API reports an Actions workflow source, but the intended
`github.io/mergora/` URL currently redirects via the `CNAME` in the separate
`AkhilTrivediX.github.io` repository to `akhiltrivedi.me`, and that domain does not resolve. A
validated current-worktree Pages deployment and public registry probe are also absent. The current
npm session passes `npm whoami`. That identity check does not establish ownership of the
planned package names, trusted-publishing authority, provenance, or release readiness. Authenticated
read-only `npm view` refreshes on 2026-07-20 returned exact `E404` for all seven selected names:
`mergora`, `mergora-ui`, `mergora-tokens`, `mergora-schema`, `mergora-registry`,
`mergora-contracts`, and `mergora-mcp`. That result is time-bound availability evidence only, not an
ownership, trusted-publishing, legal-clearance, or publication claim. The release checks remain
required immediately before any first publish, and no publication was attempted.

## Blocking IDs

| ID                     | Meaning                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BLK-CI-001`           | The current worktree has no fresh pushed all-green CI run; PR #2 is stale red on older packed evidence drift.                                                            |
| `BLK-MATURITY-001`     | All 178 entries are unpublished and profile-incomplete; Stable/manual promotion evidence is absent.                                                                      |
| `BLK-A11Y-001`         | The 3,253-session/4,124-task manual campaign and independent Risk Class 3 review remain wholly not run.                                                                  |
| `BLK-CLI-001`          | Local routing/lifecycle passes; exact-commit CI and real release-time official-mirror verification remain.                                                               |
| `BLK-COMPAT-001`       | Compatibility lanes are scheduled but lack exact-commit CI evidence.                                                                                                     |
| `BLK-VISUAL-001`       | The approved visual baseline is limited to four representative stories and lacks strict exact-commit Linux and catalog-wide evidence.                                    |
| `BLK-SITE-001`         | Integrated site, complete API descriptions, website browser, and performance gates pass locally; exact-commit CI, manual review, deployment, and release binding remain. |
| `BLK-PAGES-001`        | Pages Actions source is enabled; exact deployment and post-deploy probes remain absent.                                                                                  |
| `EXT-PAGES-DOMAIN-001` | The configured Pages URL redirects to an unresolved domain controlled outside this repository.                                                                           |
| `BLK-NPM-001`          | npm identity succeeds; package ownership, trusted publishing, provenance, and release authority remain unproved.                                                         |
| `BLK-RELEASE-001`      | No exact release candidate, release evidence bundle, completion manifest, or sign-off exists.                                                                            |
| `BLK-PUBLIC-001`       | No public Alpha/Beta/RC/Stable npm, registry, Pages, or GitHub Release artifacts exist.                                                                                  |
| `BLK-SIGN-001`         | Required evidence reviews and independent clean-room sign-offs have not occurred.                                                                                        |
