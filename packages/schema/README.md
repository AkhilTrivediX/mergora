# `mergora-schema`

Versioned JSON Schemas, TypeScript contracts, and bounded side-effect-free validators for Mergora registry, CLI, transaction, evidence, latest-alias, and release documents.

The canonical files live in `registry/schemas`. This package compiles that directory directly so npm, registry, CLI, and documentation consumers share one source. JSON schemas are available through subpaths such as `mergora-schema/schemas/config-v1.schema.json`.

The built-in validator intentionally implements the bounded subset needed for local defensive checks. It does not replace byte-digest verification, realpath and symlink containment, duplicate-key rejection during JSON parsing, full SemVer evaluation, or independent Draft 2020-12 metaschema validation at release time. Those checks belong to the CLI and release verification layers.
