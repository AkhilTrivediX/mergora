# Mergora schema source

This directory is the versioned source of truth for Mergora's portable JSON records. Every
schema declares JSON Schema draft 2020-12, carries a stable immutable `$id`, and closes
security-critical records with `additionalProperties: false`.

## Coverage

The v1 source covers configuration, registry index and item payloads, mutable latest aliases,
catalog and component metadata, compatibility, manifests and operation plans, conflicts,
transactions and durable journals, CLI result envelopes, exact native release references,
release and offline-vendor manifests, the honest blocked release-protocol plan, themes,
evidence, Quality Passports, and accessibility acceptance contracts. `types.ts` exposes the
matching TypeScript vocabulary, while
`schema-registry.ts` provides the runtime schema catalog.

`validateSchemaDocument` negotiates `schemaVersion` before reading a record, evaluates the
draft-2020-12 keywords used by these schemas, and returns stable JSON-pointer errors. A newer
version is rejected with an explicit upgrade message rather than being interpreted as v1.
`canonicalJson` sorts object keys recursively for deterministic records and digest inputs; it
does not calculate or claim a digest. The release builder owns digest calculation and verifies
the schema-valid documents again after assembling their cross-document references.

## Security invariants

The schemas and supplemental validator reject:

- unknown fields on critical records and secret-like material in portable records;
- executable files, arbitrary scripts, hooks, codemods, or migration adapters outside the
  built-in declarative allowlist;
- dependency URLs and protocols other than registry package names with semver ranges;
- absolute, drive-qualified, UNC, device, traversal, percent-encoded, control-character,
  non-NFKC, Windows-reserved, and trailing-dot/space paths;
- credentials in URL userinfo and query strings on immutable artifact URLs; and
- case- or Unicode-normalization collisions among registry identities and managed paths.

Authentication records contain only an environment-variable name. Values from that
environment variable never belong in configuration, manifests, plans, journals, or results.

## Evidence states

Evidence vocabularies remain context-specific. `evidence.ts` is the canonical aggregate
projection:

| Context                | Source state              | Aggregate state  |
| ---------------------- | ------------------------- | ---------------- |
| measurement            | `pass`                    | `satisfied`      |
| measurement            | `fail`                    | `failed`         |
| measurement            | `warning`, `manual-check` | `conditional`    |
| measurement            | `not-measurable`          | `unknown`        |
| passport               | `pass`                    | `satisfied`      |
| passport               | `pass-with-limitation`    | `conditional`    |
| passport               | `fail`                    | `failed`         |
| passport               | `not-tested`              | `unknown`        |
| passport               | `expired`                 | `stale`          |
| passport               | `blocked-upstream`        | `blocked`        |
| contract               | `pass`                    | `satisfied`      |
| contract               | `fail`                    | `failed`         |
| contract               | `blocked-upstream`        | `blocked`        |
| release gate           | `pass`                    | `satisfied`      |
| release gate           | `fail`                    | `failed`         |
| release gate           | `blocked`                 | `blocked`        |
| any applicable context | `not-applicable`          | `not-applicable` |

The validator checks a declared aggregate against this mapping. It never upgrades missing,
expired, blocked, or untested evidence to a pass. Test fixtures are explicitly synthetic and
make no release, quality, accessibility, or interoperability claim.

## Execution-layer checks

The bundled validator is deliberately a bounded evaluator for the schema keywords used here,
not a replacement for validating the schema source itself against the complete draft-2020-12
metaschema. The execution layer must still verify bytes and cryptographic digests, enforce
download limits and immutable-cache rules, resolve real paths and symlinks inside the project
root, parse raw JSON with duplicate-key detection, and apply full semantic-version resolution.
The theme schema models the supported DTCG subset; consumers must not infer support for
unmodeled DTCG extensions.

Run the focused checks with:

```sh
pnpm exec vitest run tests/schemas
```
