# Compatibility policy

## Status

This is the approved starting matrix from the 2026-07-18 blueprint, not release evidence. Exact supported versions must be revalidated before dependencies are pinned and before every Stable release. Declarations, fixtures, CI lanes, docs, and migration notes must change together.

| Surface           | Starting policy                                                                                                                                                                | Required evidence before support claim                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Node CLI          | Node 22.14+; Node 24 LTS primary/release                                                                                                                                       | CLI fixtures and clean installs on the supported OS matrix                                                          |
| pnpm              | pnpm 11 workspace/release baseline                                                                                                                                             | Frozen clean install and package-manager consumer fixtures                                                          |
| React             | React 19.2 primary; React 18.3 compatibility while dependencies support it                                                                                                     | Types, Strict Mode, SSR/hydration, client boundaries, and consumer builds                                           |
| Next.js           | 16.x primary with documented rolling support                                                                                                                                   | Minimum/current App Router source/package consumers and static/server builds                                        |
| Vite              | 8.x primary and the previous supported major where feasible                                                                                                                    | Minimum/current production browser-app consumers                                                                    |
| Tailwind CSS      | 4.3+ first-class                                                                                                                                                               | Source discovery, package `@source`, and precompiled-CSS paths                                                      |
| TypeScript        | TypeScript 6.0.3 is the global development baseline; 7.0.2 was evaluated on 2026-07-18 and rejected because the locked Next.js 16.2.10 build and Storybook docgen did not pass | Strict, exact optional, unchecked indexed access, bundler and Node ESM resolution, plus clean Next/Storybook builds |
| Node types        | `@types/node` 24.13.3                                                                                                                                                          | Typecheck across public Node packages and supported runtime fixtures                                                |
| Package managers  | npm and pnpm primary; Yarn 4 and Bun smoke                                                                                                                                     | Install, lifecycle policy, lockfile, and CLI filesystem behavior                                                    |
| Browsers          | Current Playwright Chromium, Firefox, WebKit; documented real-browser smoke                                                                                                    | Risk-class browser suites and exact manual records                                                                  |
| Operating systems | Windows, Linux, macOS where supported                                                                                                                                          | Paths, line endings, symlinks, transactions, install/build, and clean consumer evidence                             |

Unsupported combinations must fail early through documented diagnostics rather than partially mutate a consumer project.

## Compatibility change policy

- Runtime support reductions are public compatibility changes and require a Changeset and migration guidance.
- Patch updates to the pinned development toolchain still require frozen-install and reproducibility evidence.
- “Newest available” does not override compatibility evidence. TypeScript 7 may be reconsidered only when the locked Next.js and Storybook pipelines pass without private patches; the compiler pin, compatibility fixtures, and documentation must move together.
- Server-safe entries may not leak browser globals.
- Public source and npm modes have one compatibility claim because they derive from one canonical implementation.
