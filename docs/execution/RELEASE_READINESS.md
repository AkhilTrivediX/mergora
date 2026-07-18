# Release readiness

There is no prerelease or Stable release. This table records phase gates, not percentage complete.

| Phase                | Status      | Gate evidence                                                                                                                                                                                                                                                                                                                          | Blocking IDs                       |
| -------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| P0 Audit/bootstrap   | in-progress | Plan-free public history, repository controls, pinned 22-project scaffold, governance, real CI jobs, and an approved unscoped package map exist. Branch checkpoint `12a39f1` is awaiting refreshed Linux/required-context evidence in draft PR #2.                                                                                     | P0-F004                            |
| P1 Contracts/tracer  | in-progress | 330 tokens, 19 schemas, 487 deterministic artifacts, static plus trusted runtime Contract adapters, 78 source-present items, and repeated seven-tarball Next/Vite source/package consumers exist. Combobox remains a draft tracer and immutable/manual evidence remains open.                                                          | P1-F001, P1-022                    |
| P2 Core primitives   | in-progress | Every P2 source family has generated outputs and focused automation. Manual AT, final Contracts/Passports, updater parity, public dogfooding, immutable evidence, and Stable promotion remain open.                                                                                                                                    | P2-F001, P2-GATE                   |
| P3 CLI/sync          | gate-failed | Semantic Sync, real staged/post-commit validators, durable init/recovery, strict CLI envelopes, expanded release verification, trusted runtime Contract adapters, themes, enrollment, vendor, clean, project create, and plan-only MCP exist. Acquisition routing, provenance/moves, migrations, and the full packed lifecycle remain. | P3-F002, P3-GATE                   |
| P4 Production inputs | in-progress | NumberField, CurrencyField, and PercentageField now have canonical/generated source, focused/browser evidence, and honest unreleased records. PasswordField/SearchField are in active source work; remaining specialist, collection, date/time, and file families are absent.                                                          | P2-GATE, P3-GATE, P4-F001          |
| P5 Full catalog      | not-started | Audit confirms all 54 listed family entries remain absent or incomplete, including the incomplete Data Grid tracer.                                                                                                                                                                                                                    | P2-GATE, P3-GATE, P4-GATE, P4-F001 |
| P6 Workflow kits     | not-started | Definitions exist; production kit implementations and evidence do not.                                                                                                                                                                                                                                                                 | P4-GATE, P5-GATE                   |
| P7 Site foundation   | not-started | Scaffold exists; production discovery/docs shell is not complete.                                                                                                                                                                                                                                                                      | P1-GATE, P2-GATE, P3-GATE          |
| P8 Complete site     | not-started | Quality Lens, complete Passports, Studio, machine docs, and production registry delivery remain.                                                                                                                                                                                                                                       | P4-GATE-P7-GATE                    |
| P9 Hardening         | not-started | Full compatibility, accessibility/manual, security, performance, and distribution campaign remains.                                                                                                                                                                                                                                    | P8-GATE                            |
| P10 Prerelease       | not-started | No Alpha/Beta/RC has been published.                                                                                                                                                                                                                                                                                                   | P9-GATE                            |
| P11 Stable launch    | not-started | No stable npm release, GitHub Release, production Pages deployment, or registry deployment exists.                                                                                                                                                                                                                                     | P10-GATE                           |
| P12 Clean-room audit | not-started | Public-only completion audit requires the stable launch.                                                                                                                                                                                                                                                                               | P11-GATE                           |

## Current verified local facts

- Checkpoint `12a39f1` passes 183 focused tests, five numeric browser tests, root/package typechecks,
  strict schema validation, a clean missing-`dist` CLI rebuild, and pinned shadcn 4.13.0 validation.
  Its Linux aggregate is running in draft PR #2.
- Generation and drift verification pass for 487 deterministic artifacts and 78 canonical
  `source-present-unreleased` items.
- The packed-consumer record covers seven exact tarballs: `mergora`, `mergora-contracts`,
  `mergora-mcp`, `mergora-registry`, `mergora-schema`, `mergora-tokens`, and `mergora-ui`.
- One evidence refresh plus two clean comparisons pass for Next/Vite × package/source. Every path
  proves frozen offline reinstall, dependency-tree isolation, packed CLI/MCP execution, strict
  typechecking, and production build.
- Semantic Sync implements deterministic B/L/R adapters, immutable releases, non-destructive
  conflicts, exact resolution choices, manifest-last provenance advancement, and real registered
  staged/post-commit parse/type/token/config/Contract validators with exact rollback.
- The updated P3 review has no open S0/S1 finding. Three S2 lifecycle findings and their
  dispositions are recorded in
  [`../quality/P3_SECURITY_DATA_LOSS_AUDIT.md`](../quality/P3_SECURITY_DATA_LOSS_AUDIT.md).

## Current release facts

- Public repository: https://github.com/AkhilTrivediX/mergora
- Default branch/commit: `main` at `8ac425ed72ac2a19e3d84ca7618137052586f79d`
- Working branch/implementation commit: `feature/foundation` at
  `12a39f12e6079c3c35c4ee6dc55ab1d99a4df862`; draft PR
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
