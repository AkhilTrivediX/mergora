# Catalog status

- Updated: 2026-07-20
- Authority: `registry/generated/catalog.json`
- Evidence matrix: `registry/generated/implementation-matrix.v1.json`
- Publication status: `blocked-unreleased`
- Published Stable entries: 0

The generated inventory is authoritative and is not assumed to have a fixed component count. All
178 definitions now have canonical source and generated delivery surfaces. That closes the old
92-present/86-missing implementation split, but it does not promote or release any item.

## Inventory

| Dimension                      | Count |
| ------------------------------ | ----: |
| Definitions                    |   178 |
| Catalog entries excluding kits |   168 |
| Workflow kits                  |    10 |
| Foundation                     |    22 |
| Components                     |   113 |
| Systems                        |    33 |
| Kits                           |    10 |
| Core                           |   177 |
| Labs                           |     1 |
| Community                      |     0 |
| Target Stable                  |   175 |
| Target Beta                    |     2 |
| Target Experimental            |     1 |
| Source-present-unreleased      |   178 |
| Unimplemented definitions      |     0 |
| Published maturity records     |     0 |

The two Beta targets are Kanban and Scheduler Kit. Rich Text Editor is the one Experimental/Labs
target. These target values are requirements, not shipped maturity claims.

## Implementation matrix

| Required column/evidence family             | Current evidence |
| ------------------------------------------- | ---------------: |
| Mergora-specific advantage, evidence-backed |        178 / 178 |
| Shared visual signature, evidence-backed    |        178 / 178 |
| Optional enhancements, evidence-backed      |        256 / 256 |
| Basic story tested                          |        178 / 178 |
| Recommended Mergora story tested            |        178 / 178 |
| Package/source/Shadcn parity verified       |        178 / 178 |
| Interaction evidence verified               |        129 / 178 |
| Interaction evidence partial                |         49 / 178 |
| Accessibility evidence partial              |        178 / 178 |
| Overall profile complete                    |          0 / 178 |

All 178 records have `profileStatus: profiled-incomplete`. Maturity assessments are 175
`not-ready`, two `beta-candidate`, and one `experimental-candidate`. A candidate assessment is
not published maturity.

## What the current matrix proves

- Every generated inventory entry has a named family, ordinary Shadcn baseline, Mergora advantage,
  shared visual signature, independently described optional enhancement API, disabled behavior,
  Basic story, Recommended story, parity record, evidence references, remaining blockers, and an
  honest maturity assessment.
- Disabling an enhancement is documented across UI, behavior, events, and accessibility output.
- Every Basic and Recommended story has a test reference.
- Canonical source, package output, native registry output, and Shadcn output are linked and
  generation-tested for every item.

## Current automated breadth

- The generator emits 1,051 deterministic outputs including its manifest. The manifest's 1,050
  entries include the authoritative documentation-contract index for all 178 items.
- The full component Playwright aggregate on 2026-07-20 scheduled 909 Chromium, Firefox, and WebKit
  cases: 907 passed, two Firefox/WebKit instances of a Chromium-only mobile-touch-emulation case
  were intentionally skipped, and zero failed.
- The exact-tarball consumer WRITE run and immediate NO-WRITE replay match deterministically across
  seven tarballs and four Next/Vite package/source lanes. The source lane exercises the bounded
  customize/update/conflict/resolve/audit/rollback/recover/remove/vendor/migrate/adopt lifecycle.
- The documentation contract exposes 2,806 catalog State Lab rows and 178 fail-closed Passport JSON
  skeletons. Strict public API extraction covers 178 entries, 530 groups, 3,431 declared props,
  3,431 descriptions, and 807 runtime defaults with no generated review placeholders.
- The manual campaign plan covers 178 items, 3,253 exact environment sessions, and 4,124 task
  observations. Every row is `not-run` and the campaign makes zero evidence claims.

## What remains open

- No item has complete manual assistive-technology evidence.
- Forty-nine entries still have only partial interaction evidence.
- The local component-browser and bounded packed-consumer aggregates pass, but they are not bound to
  a fresh all-green exact CI commit, immutable release evidence, or public artifacts.
- Coordinated website/static/browser, visual, responsive/locale breadth, compatibility, and manual
  gates have not all passed for one exact release commit.
- The reviewed visual baseline covers only Button, Dialog, Combobox, and Data Grid; catalog-wide
  and release-eligible Linux visual evidence remains open.
- Quality Passports are unreleased skeletons, not immutable public release Passports.
- Stable promotion, GitHub Release, trusted-publishing/provenance proof, Vercel release binding, and
  public clean-room verification have not occurred. The npm package names are public at `1.0.0`, but
  component maturity remains unpublished.

The exact evidence and blocker vocabulary is maintained in
[`EVIDENCE_INDEX.md`](EVIDENCE_INDEX.md). Counts must continue to separate maturity, trust, layers,
kits, examples, parts, and internal utilities.
