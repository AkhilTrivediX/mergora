# Deterministic registry generation backbone

This package orchestrates one-way planning-data generation from the canonical catalog,
draft-2020-12 schema registry, and `config/public-packages.json`. It delegates source,
package, documentation, and Passport projections to their dedicated internal builders.

The checked-in generation graph remains an unreleased planning surface. It emits canonical
source/package projections plus `registry/generated/release-protocol/plan.json`, which records
the exact release-protocol endpoints and current blockers while emitting zero publishable
release artifacts. It does not invent a registry identity, version, commit, passing evidence,
manual evidence, or published Stable maturity. Quality Passport skeletons are non-publishable
blocked records, not Quality Passports.

`buildStableReleaseProtocolBundle` is the separate fail-closed publication boundary. It accepts
only an explicitly passing release gate and packed-consumer record, a digest-bound official
identity, stable version and commit, complete stable-item quality evidence, public schemas, an
SBOM, Contracts, Passports, and embedded source bytes whose lengths and digests verify. It then
schema-validates and deterministically emits the native catalog and search index, immutable item
payloads and release manifest, mutable latest aliases, the exact evidence bytes, an immutable
mirror inventory, a portable static release bundle, response cache/security metadata, and a
complete `SHA256SUMS`. Verification reconstructs the bundle and rechecks every digest,
cross-document reference, item/evidence binding, manifest inventory, and mirror byte. Supplying a
precomputed item payload digest, unverified source URL, inconsistent identity, missing dependency,
cycle, alias collision, incomplete Stable evidence, or coherently rehashed omission fails before
output.

## Commands

```sh
pnpm --filter @mergora-internal/registry-builder generate
pnpm --filter @mergora-internal/registry-builder generated:check
pnpm exec vitest run tests/generation
```

Write mode owns only `registry/generated/**` and `content/generated/**`. It updates changed
artifacts and removes obsolete files from those two resolved directories. Check mode performs
no writes and fails on missing, changed, or unexpected output.

Output is canonical compact JSON with recursively sorted keys, NFKC-normalized strings, UTF-8
text, LF endings, and a final newline. Inputs or outputs containing case/Unicode path
collisions, absolute/traversal/device/reserved paths, timestamps, machine paths, secrets, or
unsupported release claims fail closed. Cryptographic fields are permitted only across the
explicit release-bundle boundary; the ordinary planning graph rejects them.

## Root integration required

The root package should run token generation first and this graph second:

```json
{
  "scripts": {
    "generate": "pnpm --filter @mergora-internal/token-compiler generate && pnpm --filter @mergora-internal/registry-builder generate && node scripts/verify-workspace.mjs --gate generate",
    "generated:check": "pnpm --filter @mergora-internal/token-compiler check && pnpm --filter @mergora-internal/registry-builder generated:check"
  }
}
```

Insert `pnpm generated:check` near the start of the root `check` script, after workspace policy
verification and before formatting/type/test gates. Add `registry/generated/` and
`content/generated/` to `.prettierignore`: canonical generated JSON is byte-owned by this
builder and must not be reformatted independently. No lockfile change or new runtime package
is required for this graph.

The source-transform plan discovers every validated canonical source descriptor and the blocked
release-protocol plan inventories that source coverage dynamically. Source presence is still
reported as `source-present-unreleased`: it does not become a release, published maturity, or
quality claim until the complete catalog, immutable release identity, evidence, and public-origin
gates are supplied to the separate release boundary.
