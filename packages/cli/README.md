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
mergora adopt --from shadcn button --registry partner --cwd . --plan --json
mergora adopt --from shadcn button --registry partner --allow-local-divergence --yes
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

Removal deletes only files whose live digest equals their immutable owned base. This includes
selected Contract and example artifacts in either distribution mode. Customized or unprovable
files cause a conflict; `--keep-files` explicitly detaches ownership without deleting the project
bytes. Bundled adoption succeeds only when every local file exactly matches the selected payload
and transform mapping. `adopt --from shadcn` instead retrieves one exact already-enrolled
`shadcn-v1` catalog, validates the closed pinned schema, resolves `components.json` aliases and
style paths through the compiled adapter, and records the external origin, catalog digest,
adapter version, transformed bases, and reduced evidence. It preserves `components.json` and live
source byte-for-byte. A divergent local file is refused by default; the narrow
`--allow-local-divergence` consent records `installed != base` without replacing the file. Missing,
ambiguous, overlapping, executable, or dependency-unproven ancestry always fails closed.

Dependency edits use fixed, non-shell npm, pnpm, Yarn 4, or Bun install commands with lifecycle
scripts disabled. `--no-install` records dependency metadata without running the package manager.
When the authoritative lockfile is outside the selected workspace package, dependency-changing
operations require `--no-install`; run the workspace-root install separately.

## Source and package distribution modes

Initialization persists a `source`, `package`, or `hybrid` default. A hybrid default keeps ordinary
adds lightweight by selecting source mode; `add` can override that decision per operation:

```sh
mergora add button --mode source --release-file .mergora/release-1.0.0.json --plan --json
mergora add button --mode package --release-file .mergora/release-1.0.0.json --plan --json
mergora add button --mode package --with-examples --release-file .mergora/release-1.0.0.json --plan
mergora remove button --mode package --plan --json
```

Package mode requires an exact native release whose fixed npm inventory includes `mergora-ui` at
the same release. The archive is acquired through the bounded verified network path or a verified
Stable vendor, then its digest, integrity, package identity, version, license, size, and install
scripts are validated. Its transaction edits only the exact package dependency, portable
manifest/config/import provenance, and explicitly selected project-side Contracts/examples; it
creates no component source files or immutable component-source bases. Selected artifacts receive
their own exact immutable bases, so update and removal refresh/delete only unmodified owned bytes
and preserve local customization as a conflict. An offline package add/update therefore requires
the exact archive in the Stable vendor and fails before mutation when it is unavailable.

Stable Contracts are selected by default; `--with-contracts` also selects available non-Stable
Contracts, while `--with-examples` selects only examples explicitly declared by the exact item
payload. Re-running `add` at the same release can augment an existing install with those artifacts.
Package removal is local-only: it prunes the package dependency only when its exact retained
ownership allows removal and never needs registry or archive acquisition.

`update` routes by each installed item's persisted mode. A single update cannot combine source and
package owners, and `--mode` cannot silently change an installed owner; use the separately reviewed
mode-migration engine first. Package updates replace only the exact dependency value owned by the
previous package release and require the complete fixed release group. Source updates retain the
existing Base/Local/Remote transaction and advance their exact distribution release provenance.

`--no-format` is independently available on `add` and `update`. It skips the configured formatting
step and records formatter provenance as `none`; media parsing, semantic validation, schema,
ownership, archive-integrity, staged-overlay, and post-commit checks still run.

## Stable offline vendors and npm archives

An exact native Stable release can be captured from verified acquisition evidence without claiming
that bundled development data is released:

```sh
mergora vendor --all --release-file .mergora/release-1.0.0.json --plan --json
mergora vendor --all --release-file .mergora/release-1.0.0.json --yes --non-interactive
```

Package archives are excluded by default. `--include-npm-tarballs` opts into the exact digest-bound
inventory declared by that Stable release. The CLI fetches included archives directly with HTTPS,
manual redirect rejection, omitted credentials, a timeout, and per-archive and aggregate byte
limits; it does not invoke npm or another package manager. A legacy release that omits the inventory
fails closed, while a verified empty inventory succeeds without a fetch. `--offline` can include an
empty or omission-only inventory, but refuses an inventory that still requires network acquisition.
`mergora vendor verify` subsequently checks every bundled archive, digest, integrity value, license,
package identity, and install-script prohibition without network access.

## Semantic Sync and current boundary

`update` reconstructs immutable Base/Local/Remote inputs, classifies local and upstream changes,
uses conservative structured or text/binary adapters, preserves non-overlapping customization, and
leaves the live tree unchanged when a semantic conflict is produced. `resolve` accepts only an exact
reviewed conflict target and local/upstream/manual/reset choice. `rollback` and `recover` use recorded
digests and backups rather than a generic overwrite path.

Registered staged-overlay and post-commit validators execute media parsing, isolated TypeScript
import/type checks, token integrity, Contract provenance, project configuration, and transform
context checks. Pre-commit failure writes nothing; post-commit failure restores the exact pre-state.

Contract Audit supports deterministic static checks and an opt-in official browser-host protocol.
The host must register exact immutable Contract/assertion routes compiled into trusted host code;
registry data cannot provide commands, browser locations, or executable code. The CLI registers no
browser harness by default, so requested runtime modes remain incomplete instead of receiving
fabricated passes. Browser-aware consumers can inject the concrete Playwright host from
`@mergora/test-utils` through the public `auditProject` options without adding Playwright to the CLI
fast path. Theme, migration-plan, registry-management, offline vendor, project-create, and bounded
clean surfaces exist; immutable acquisition is not yet routed through every discovery/audit
consumer. Exact operation-level source/package add and update routing is implemented. `migrate
mode` now requires one exact native release reference and package archive, observes the live
ownership state, rewrites only parsed TypeScript module literals, and commits source, dependency,
base, import, and manifest changes through one recoverable reviewed plan. Relative or non-TypeScript
imports without an exact mapping fail closed. Remaining executable framework migrations, several
documented flags, the complete packed lifecycle, and Stable release claims are still open. Bundled
source payloads remain explicitly unreleased.

The CLI has no generic force-overwrite option, no executable registry hooks, and no postinstall
script. Machine output is one stable JSON envelope with project-relative paths and no ANSI
formatting. Transaction command arguments retain only an allowlist of harmless boolean flag names;
values and arbitrary flags are redacted.
