# Mergora CLI

This unreleased package contains local catalog discovery, project initialization, and the P3.3/P3.4
transactional source/provenance surface. The implemented commands use the generated catalog and
canonical source payloads bundled at build time; they do not require telemetry or a network request.

```sh
mergora search button
mergora view dialog --files
mergora docs dialog --format url
mergora info --cwd .
mergora status --cwd .
mergora doctor --cwd .
```

`init` detects the supported React framework, named source root, TypeScript alias, global CSS,
Tailwind CSS v4, and authoritative npm, pnpm, Yarn, or Bun selection. Review the exact
project-relative plan before applying it:

```sh
mergora init --cwd . --plan --json
mergora init --cwd . --yes --non-interactive
```

Initialization creates only `mergora.json`, the empty portable v1 manifest, and narrow local-state
`.gitignore` rules. It preserves existing `package.json`, `tsconfig.json`, and CSS bytes, and uses the
same staged, journaled, manifest-last transaction/recovery protocol as source mutations.

## Transactional source ownership

`add`, `remove`, and `adopt` all expose a deterministic plan before mutation. Non-interactive apply
requires explicit consent:

```sh
mergora add button dialog --cwd . --plan --json
mergora add button dialog --cwd . --yes --non-interactive
mergora remove dialog --cwd . --plan --json
mergora adopt button --cwd . --plan --json
mergora recover --cwd . --plan --json
```

An apply acquires an exclusive project lock, creates a UTC transaction ID with 128 random bits,
stages and verifies raw bytes on the target filesystem, durably journals each operation before it
runs, backs up every authoritative pre-state, commits the provenance manifest last, and performs
post-state digest and ownership validation. Interrupted operations remain recoverable; ordinary
failures restore recorded authoritative file bytes.

The portable manifest records exact registry payload, version, transform-context, file, immutable
base, registry-dependency, runtime-dependency, and ownership data. Base blobs preserve the source
bytes exactly, including line endings. Semantic digests use compact RFC 8785-compatible canonical
JSON while the human-facing manifest remains deterministic pretty JSON.

Removal deletes only files whose live digest equals their immutable owned base. Customized or
unprovable files cause a conflict; `--keep-files` explicitly detaches ownership without deleting
source. Adoption succeeds only when every local file exactly matches the selected bundled payload
and transform mapping. It never invents ancestry for divergent bytes.

Dependency edits use fixed, non-shell npm, pnpm, Yarn 4, or Bun install commands with lifecycle
scripts disabled. `--no-install` records dependency metadata without running the package manager.
When the authoritative lockfile is outside the selected workspace package, dependency-changing
operations require `--no-install`; run the workspace-root install separately.

## Semantic Sync and current boundary

`update` reconstructs immutable Base/Local/Remote inputs, classifies local and upstream changes,
uses conservative structured or text/binary adapters, preserves non-overlapping customization, and
leaves the live tree unchanged when a semantic conflict is produced. `resolve` accepts only an exact
reviewed conflict target and local/upstream/manual/reset choice. `rollback` and `recover` use recorded
digests and backups rather than a generic overwrite path.

Registered staged-overlay and post-commit validators execute media parsing, isolated TypeScript
import/type checks, token integrity, Contract provenance, project configuration, and transform
context checks. Pre-commit failure writes nothing; post-commit failure restores the exact pre-state.

Contract Audit supports deterministic static checks and programmatic trusted runtime harness
adapters. The CLI registers no browser harness by default, so requested runtime modes remain
incomplete instead of receiving fabricated passes. Theme, migration-plan, registry-management,
offline vendor, project-create, and bounded clean surfaces exist; immutable acquisition is not yet
routed through every discovery/add/update/audit consumer. Package/hybrid moves, remaining executable
migrations, several documented flags, the complete packed lifecycle, and Stable release claims are
still open. Bundled source payloads remain explicitly unreleased.

The CLI has no generic force-overwrite option, no executable registry hooks, and no postinstall
script. Machine output is one stable JSON envelope with project-relative paths and no ANSI
formatting. Transaction command arguments retain only an allowlist of harmless boolean flag names;
values and arbitrary flags are redacted.
