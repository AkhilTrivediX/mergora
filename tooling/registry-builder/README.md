# Deterministic registry generation backbone

This package orchestrates one-way planning-data generation from the canonical catalog,
draft-2020-12 schema registry, and `config/public-packages.json`. It delegates source,
package, documentation, and Passport projections to their dedicated internal builders.

Current catalog definitions are intentionally pre-implementation. Generated files therefore
contain planning metadata only: no registry release, source payload, package export, API,
contract, digest, release commit, timestamp, passing test, manual evidence, or published
Stable maturity is emitted. Quality Passport skeletons are non-publishable blocked records,
not Quality Passports.

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
collisions, absolute/traversal/device/reserved paths, timestamps, machine paths, secrets,
release identity, digest fields, passing evidence, or Stable claims fail closed.

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

Button, Dialog, Combobox, and Data Grid have explicit missing-source extension points in the
source-transform plan. A future vertical slice supplies validated canonical source descriptors
to `buildSourceTransformPlan`; until the catalog model itself records real implementation and
evidence state, those descriptors remain blocked and emit no files.
