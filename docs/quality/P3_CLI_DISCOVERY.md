# P3.2 CLI initialization and discovery evidence

## Scope

This document records the P3.2 read and initialization surface at its original freeze. The later
P3.3/P3.4 transaction and provenance evidence is recorded in
`docs/quality/P3_TRANSACTION_PROVENANCE.md`; this historical evidence does not describe the current
`add`, `remove`, `adopt`, or `recover` implementation:

- `init`, including exact read-only plans, `--dry-run`, `--plan`, narrow `--yes` consent, and
  `--non-interactive` failure;
- local `search`, `view`, `docs`, `info`, `status`, and `doctor` commands;
- stable JSON envelopes and exit codes for implemented command paths;
- Next App/Pages, Vite React, and React detection; named source-root, tsconfig alias, global CSS,
  Tailwind CSS v4, and npm/pnpm/Yarn/Bun detection;
- deterministic item aliases and explicit source viewing;
- build-time discovery of every generated native source payload used by the transactional source
  operation path.

The initial validation bundle contained 26 generated source items. The build and tests compare
against directory discovery, so adding a canonical generated payload does not require a hand-edited
CLI implementation table.

## P3.2 freeze write boundary

`init` creates or updates only these exact project-relative targets:

- `mergora.json`;
- `.mergora/manifest.json` when absent;
- the four narrow local-only `.gitignore` rules for cache, transactions, temporary state, and the
  lock.

The plan carries before/after digests and exposes the exact finalized OperationPlan digest that is
committed to the transaction's `plan.json`. Public apply requires that reviewed digest even for a
no-op. A write plan also carries an `init-project-writes` consent requirement, and the accepted
consent recorded by the transaction is bound to the same digest. Missing or stale digests fail
before files or transaction state are created. Existing `package.json`, `tsconfig.json`, and global
CSS bytes are not rewritten.

At the P3.2 freeze, the compatibility `add` path required a reviewed plan plus interactive consent
or explicit `--yes`; automation also had to pass `--non-interactive`. That implementation wrote
`.mergora/p1-manifest.json` and was replaced by the P3.3/P3.4 v1 transaction and immutable-base
provenance path.

The non-transactional P1 installer is no longer compiled or exported. Read-only discovery still
recognizes an existing `.mergora/p1-manifest.json` as `p1-legacy`, so projects can inspect their
old state before migrating without restoring the unsafe writer.

## Security and privacy checks

The covered failure cases include:

- absolute, parent-traversal, encoded, backslash, control-character, reserved-device, trailing-dot,
  Unicode-normalization, and portable case-collision path handling;
- invalid project roots, framework/CSS/alias ambiguity, conflicting lockfiles, and dirty configs;
- symlink or non-regular bundled-registry entries, executable source declarations, unsafe targets,
  missing/cyclic registry dependencies, and unpinned runtime dependencies;
- local-source collisions and stale plan preconditions before any write;
- fail-closed no-follow checks for config, manifests, transaction directories and metadata,
  immutable bases, owned targets, tsconfig, global CSS, and package-manager lockfiles, with focused
  directory-junction fixtures;
- preservation of CRLF and non-default JSON indentation;
- JSONC alias discovery with comments, trailing commas, and punctuation inside strings, while
  preserving tsconfig bytes;
- paths containing spaces;
- preservation of unrelated files matching the former predictable temporary-file pattern;
- JSON output free of absolute project paths and ANSI formatting;
- non-interactive docs operation without launching a browser.

No implemented command sends telemetry, source, project paths, package lists, or audit results to a
remote service. Registry discovery is from the packed, build-validated static catalog and payloads.

## Verification

The focused validation run passed:

```text
pnpm --filter mergora typecheck
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint packages/cli tests/cli-discovery tests/cli-fixtures
pnpm exec vitest run tests/cli-discovery/initialization.test.ts \
  tests/cli-discovery/init-transaction.test.ts \
  tests/cli-discovery/status.test.ts \
  tests/cli-fixtures/p1-installer.test.ts
  4 files, 25 tests passed

pnpm --filter mergora build
pnpm --filter mergora pack --pack-destination packages/cli/.pack-probe --dry-run
  packed manifest included the CLI modules, catalog, all 26 payloads, and their source templates
```

The command integration suite builds the packed CLI entry and verifies help/version, parser
placement and `--flag=value`, deterministic search JSON, explicit-source gating, docs
non-interactive behavior, init plan/consent/apply/no-op, info/status/doctor, and safe usage errors.
The compatibility-boundary test asserts that the legacy P1 mutator is absent while legacy manifest
status remains readable.

## Historical boundary and current handoff

At this historical freeze, P3.3 transaction/provenance work had not landed. P3.3/P3.4 subsequently
replaced compatibility `add` with reviewed multi-file transactions, immutable bases, v1 manifest
ownership, fixed package-manager invocation, conservative recovery, exact adoption, and
ownership-safe removal. The current worktree additionally implements three-way Semantic Update,
conflict resolution, exact upstream refresh, Shadcn and source/package migrations, completed-
transaction rollback, enrolled-current Stable routing, and verified offline Stable vendor routing.
The historical counts above remain freeze evidence rather than a description of current breadth;
the full current CLI gate passes 474 tests with one intentional cleanup-policy skip.

The config-v1 schema and CLI now use the exact `"."` sentinel for React applications whose sources
live directly at the package root. Other current-directory spellings and embedded `.` or `..`
segments remain invalid, and generated target and global-CSS paths stay canonical without a `./`
prefix.
