# P3.3/P3.4 transaction and provenance evidence

## Scope

This freeze covers the transactional source commands and portable provenance model required by
P3.3 and P3.4:

- exact read-only plans, narrow consent, and plan-to-apply preconditions;
- all-or-nothing authoritative file mutation with conservative recovery;
- immutable raw-byte bases and deterministic v1 manifest ownership;
- complete source dependency closure, exact adoption, and ownership-safe removal;
- fixed npm, pnpm, Yarn 4, and Bun dependency operations.

It does not claim P3.5 Semantic Sync, Stable release status, registry publication, three-way update,
conflict resolution, migrations, upstream refresh, or completed-transaction rollback.

## Transaction protocol

Each conflict-free mutating plan lists the complete source closure and every live or metadata target
whose digest will change. Apply recomputes the plan, verifies its digest and config/manifest/target
preconditions, and refuses any mutation not bound to the reviewed plan.

Transactions use a sortable UTC identifier followed by 16 cryptographically random bytes. The
engine opens `.mergora/.lock` exclusively, never breaks it during an ordinary apply, and permits
recovery to remove only a structurally valid lock for the selected transaction after proving its
owner is no longer active. A crash between lock acquisition and the first durable transaction
record is handled as a separately classified pre-mutation orphan; any orphan with stage, backup,
post-state, or journal data is refused as ambiguous.

Stage, backup, and post-state paths live below `.mergora/transactions/<id>` on the project
filesystem. Before mutation, the engine verifies that every target's nearest existing parent is on
the same device as the staging root. Project reads use no-follow descriptor checks and inode/device
revalidation; portable path, reserved path, symlink ancestor, non-regular file, and case/Unicode
collision checks fail closed.

The durable journal is written before each stage write, backup write, live commit, manifest commit,
package-manager invocation, package-manager post-state retention, and rollback write. Staged and
backup bytes are read back and digest-verified. Commits use deterministic target order with
`.mergora/manifest.json` last. Post-validation verifies every staged digest plus the manifest,
immutable base, registry-dependency, transform-context, ownership, and dependency-owner closure.

Ordinary failures roll back from verified backups. Interrupted operations keep their lock and
durable evidence for an explicit `recover` plan. Recovery rejects corrupt records, corrupt journal
entry digests, ambiguous live bytes, unsafe paths, stale recovery plans, and active/different lock
owners before writing. Auto recovery rolls back unless the recorded evidence proves a complete
post-state; explicit resume reuses only verified stage bytes and the fixed package-manager policy.

## Provenance and command rules

The human-facing manifest is deterministic pretty JSON. Semantic plan, manifest, transform, and
journal digests use separate compact RFC 8785-compatible canonical JSON bytes, including strict
finite-number, array-hole, cycle, and Unicode scalar validation.

Each source file records registry identity, provisional exact version, immutable payload URL and
digest, transform context and digest, logical and destination paths, media type, installed digest,
base digest, registry dependencies, runtime dependency ranges, structured patch ownership, and
direct/transitive state. Content-addressed base blobs preserve the source bytes exactly, including
CRLF line endings.

Command behavior is intentionally narrow:

- `add` resolves the complete registry dependency closure, refuses local collisions, records every
  source/base/manifest/package mutation, and is idempotent for an already exact install.
- `remove` deletes only a live file whose bytes equal its verified immutable base. An already
  locally deleted owned target prunes provenance; customized or missing/corrupt-base targets cause
  a no-write conflict. `--keep-files` explicitly detaches ownership and retains source.
- bundled `adopt` writes provenance and bases only when every expected local file exactly matches
  the selected payload and transform mapping. Missing or divergent source is a conflict, including
  the all-missing zero-mutation case.
- `adopt --from shadcn` binds one enrolled `shadcn-v1` identity and exact catalog digest to the
  compiled `components.json` target/import mapping. Exact files become clean ownership; the narrow
  `--allow-local-divergence` path records distinct Base and Local digests while leaving source and
  `components.json` unchanged. Contracts, Passports, license, risk, and quality remain explicitly
  not supplied.
- dependency removal occurs only for the last Mergora owner and only while the declaration still
  equals the recorded owned value.

Package-manager execution is a non-shell fixed command; user input cannot add arguments or enable
scripts. With `--offline`, the executable contracts verify:

| Manager | Fixed arguments                                           |
| ------- | --------------------------------------------------------- |
| pnpm    | `install --ignore-scripts --no-frozen-lockfile --offline` |
| npm     | `install --ignore-scripts --offline`                      |
| Yarn 4  | `install --mode=skip-builds --immutable-cache`            |
| Bun     | `install --ignore-scripts --offline`                      |

Without `--offline`, only the final offline/cache flag is omitted. pnpm must permit the reviewed
package-manifest change to update its lockfile; the clean consumer then deletes `node_modules` and
proves that resulting lock with a separate frozen offline install. On Windows, npm, pnpm, and Yarn
are dispatched through the trusted Corepack JavaScript entry with the current Node executable so
the implementation still uses an explicit executable, an argument array, and `shell: false`
instead of a mutable `.cmd` shell shim. `--no-install` applies reviewed dependency metadata without
invoking the manager. A dependency-changing operation whose
authoritative lockfile is above the selected workspace package is refused unless `--no-install` is
explicit; the user must run the workspace-root install separately.

## Security and privacy evidence

The focused cases cover traversal and encoded paths, Windows device names, portable collisions,
reserved `.mergora`/`node_modules` destinations, registry URL credentials/query/fragment rejection,
registry index symlinks, a source-parent junction introduced between plan and apply, strict lock
classification, transaction-record path constraints, journal digest tampering, and raw-byte base
closure.

Manifest/provenance data contains no absolute project root, PID, wall-clock timestamp, environment
value, credential, URL query, or fragment. Transaction records retain only harmless boolean flag
names from a small allowlist; all values, positionals, and arbitrary flag names are placeholders.
Runtime timestamps and PID remain only in private transaction/lock coordination data where they are
needed for recovery classification.

## Fault and recovery matrix

The tests inject interruption at every top-level transaction fault point. For a fresh four-file
Button install they additionally interrupt all 9 stage-file occurrences, all 9 backup-file
occurrences, and all 8 non-manifest commit-file occurrences. The manifest-specific commit,
post-validation, finalization, package-manager start, and package-manager completion boundaries are
covered separately. Every classified case converges deterministically to either the exact recorded
pre-state or a fully validated committed post-state, releases the lock, and leaves no incomplete
transaction.

Additional fixtures prove explicit resume order with manifest last, byte-identical lock/package/
manifest restoration after package-manager failure, finalization of a recorded successful
package-manager post-state, safe abandonment of a valid pre-mutation orphan, and no-write refusal of
a journal whose RFC 8785 entry digest was changed.

## Verification

The pre-generation freeze passed:

```text
corepack pnpm@11.14.0 --filter mergora typecheck
  passed

corepack pnpm@11.14.0 exec eslint packages/cli/src tests/cli-transactions \
  tests/cli-discovery/packed-commands.test.ts scripts/verify-p1-consumers.mjs
  passed

corepack pnpm@11.14.0 exec prettier --check packages/cli/src tests/cli-transactions \
  tests/cli-discovery/packed-commands.test.ts scripts/verify-p1-consumers.mjs
  passed

corepack pnpm@11.14.0 --filter mergora build
  passed

corepack pnpm@11.14.0 exec vitest run tests/cli-transactions
  4 files, 39 tests passed

corepack pnpm@11.14.0 exec vitest run tests/cli-discovery tests/cli-fixtures \
  tests/cli-transactions
  11 files, 115 tests passed
```

The 115-test run includes the built executable command contract for help/version, deterministic JSON,
plan/consent/apply/no-op behavior, transactional add, divergent/all-missing adopt refusal, reserved
target refusal, and local-only status/doctor output.

The coordinated post-generation integration completed the exact packed CLI/UI/tokens/schema matrix
for Next and Vite in package and source modes. One complete run refreshed the digest evidence, and
an immediate second complete run matched it. Both source consumers installed the current seven-item
dependency closure, performed a frozen offline reinstall, passed their installed dependency-tree
audit and strict typecheck, and produced a production build. This closes the bounded packed proof;
the current worktree additionally implements Semantic Sync, Contract Audit, enrolled-current Stable
routing, verified offline vendor routing, and Shadcn protocol/adoption paths. Exact-commit CI, a real
released official-mirror payload, and the full public release scenario remain separate evidence.
