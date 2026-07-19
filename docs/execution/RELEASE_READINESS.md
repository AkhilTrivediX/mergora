# Release readiness

There is no prerelease or Stable release. This table records phase gates, not percentage complete.

| Phase                | Status      | Gate evidence                                                                                                                                                                                                                                                                                                           | Blocking IDs                       |
| -------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| P0 Audit/bootstrap   | in-progress | Plan-free public history, repository controls, pinned 22-project scaffold, governance, real CI jobs, and an approved unscoped package map exist. The active checkpoint is locally green and still needs fresh immutable Linux/required-context evidence in draft PR #2.                                                 | P0-F004                            |
| P1 Contracts/tracer  | in-progress | 330 tokens, 19 schemas, 571 deterministic artifacts, official static/browser Contract adapters, 92 source-present items, and repeated seven-tarball Next/Vite source/package consumers exist. Immutable/manual promotion evidence remains open.                                                                         | P1-F001, P1-022                    |
| P2 Core primitives   | in-progress | Every P2 source family has generated outputs and focused automation. Manual AT, final Contracts/Passports, updater parity, public dogfooding, immutable evidence, and Stable promotion remain open.                                                                                                                     | P2-F001, P2-GATE                   |
| P3 CLI/sync          | gate-failed | Semantic Sync, fixed validators, durable init/recovery, exact acquisition, branded Stable vendor, explicit moves, distribution-mode engine, official browser Audit host, and plan-only MCP exist. Canonical plan-schema enforcement, universal mode/registry routing, migrations, and the full packed lifecycle remain. | P3-F002, P3-F003, P3-GATE          |
| P4 Production inputs | in-progress | Numeric, specialist text, OTP/PIN, slider, color, phone/masked, rating/inline-edit, and Listbox/Select sources now have generated package/shadcn output and focused/browser automation. Date/time and file families plus full release evidence remain absent.                                                           | P2-GATE, P3-GATE, P4-F001          |
| P5 Full catalog      | not-started | Audit confirms all 54 listed family entries remain absent or incomplete, including the incomplete Data Grid tracer.                                                                                                                                                                                                     | P2-GATE, P3-GATE, P4-GATE, P4-F001 |
| P6 Workflow kits     | not-started | Definitions exist; production kit implementations and evidence do not.                                                                                                                                                                                                                                                  | P4-GATE, P5-GATE                   |
| P7 Site foundation   | not-started | Scaffold exists; production discovery/docs shell is not complete.                                                                                                                                                                                                                                                       | P1-GATE, P2-GATE, P3-GATE          |
| P8 Complete site     | not-started | Quality Lens, complete Passports, Studio, machine docs, and production registry delivery remain.                                                                                                                                                                                                                        | P4-GATE-P7-GATE                    |
| P9 Hardening         | not-started | Full compatibility, accessibility/manual, security, performance, and distribution campaign remains.                                                                                                                                                                                                                     | P8-GATE                            |
| P10 Prerelease       | not-started | No Alpha/Beta/RC has been published.                                                                                                                                                                                                                                                                                    | P9-GATE                            |
| P11 Stable launch    | not-started | No stable npm release, GitHub Release, production Pages deployment, or registry deployment exists.                                                                                                                                                                                                                      | P10-GATE                           |
| P12 Clean-room audit | not-started | Public-only completion audit requires the stable launch.                                                                                                                                                                                                                                                                | P11-GATE                           |

## Current verified local facts

- The active worktree passes `pnpm check`: 119 Vitest files, 1,011 tests passed with one intentional
  platform skip, all 21 package typechecks, lint, formatting, schemas, generation, and pinned
  shadcn 4.13.0 validation.
- Generation and drift verification pass for 571 deterministic artifacts and 92 canonical
  `source-present-unreleased` items; 86 catalog definitions remain unimplemented and no item is
  Stable/released.
- The 21-project production build, Storybook, and Pages-style static export pass; 27 exported text
  artifacts resolve under `/mergora`.
- Browser evidence passes 178 cases with four intentional forced-colors skips: 32 cross-engine
  passes, 145 component-browser passes, and one diagnostics pass.
- The packed-consumer record covers seven exact tarballs: `mergora`, `mergora-contracts`,
  `mergora-mcp`, `mergora-registry`, `mergora-schema`, `mergora-tokens`, and `mergora-ui`.
- One evidence refresh plus two clean comparisons pass for Next/Vite x package/source. Every path
  proves frozen offline reinstall, dependency-tree isolation, packed CLI/MCP execution, strict
  typechecking, and production build; MCP reports 20 tools, three resources, and no apply surface.
- Semantic Sync implements deterministic B/L/R adapters, immutable releases, non-destructive
  conflicts, exact resolution choices, manifest-last provenance advancement, and real registered
  staged/post-commit parse/type/token/config/Contract validators with exact rollback.
- The updated P3 review has no open S0 finding. One systemic S1 plan-schema finding and the remaining
  S2 lifecycle gaps are recorded in
  [`../quality/P3_SECURITY_DATA_LOSS_AUDIT.md`](../quality/P3_SECURITY_DATA_LOSS_AUDIT.md).

## Current release facts

- Public repository: https://github.com/AkhilTrivediX/mergora
- Default branch/commit: `main` at `8ac425ed72ac2a19e3d84ca7618137052586f79d`
- Working branch/implementation commit: `feature/foundation` at `075e214` plus the active verified
  worktree; draft PR
  [#2](https://github.com/AkhilTrivediX/mergora/pull/2) is open
- Public package map: approved unscoped tier in `config/public-packages.json`; authenticated
  read-only npm verification is available and evidence remains redacted
- npm availability: selected exact names returned time-bound E404 observations on 2026-07-18;
  availability, authority, similarity, security history, and legal/confusion checks must be repeated
  immediately before release
- npm packages: none published by this implementation run
- GitHub Release: none
- Production Pages/registry: not deployed
- Completion manifest: not generated
