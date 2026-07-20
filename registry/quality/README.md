# Quality policy registry

These versioned JSON files are policy inputs, not evidence. They contain no inferred pass/fail
results and no mutable timestamps.

- `story-state-policy.v1.json` defines the canonical state matrix.
- `environment-policy.v1.json` defines locale, direction, visual, viewport, zoom, and text controls.
- `evidence-vocabulary.v1.json` maps context-specific states to aggregate states.
- `risk-class-policy.v1.json` defines inherited risk and manual coverage.
- `maturity-policy.v1.json` defines the non-negotiable Stable gate.
- `package-source-parity-policy.v1.json` defines normalized package/source equivalence probes.
- `mergora-signature-policy.v1.json` defines the shared visual-signature vocabulary and semantic-token/radius constraints.
- `implementation-profile-shard.v1.schema.json` defines category-owned component audit inputs.
- `implementation-matrix.v1.schema.json` defines the generated, catalog-authoritative implementation matrix.
- `implementation-profiles/*.v1.json` partition the catalog by category. An ID is either explicitly audit-pending or represented by one complete profile; it can never be omitted from both.

Runtime implementations live in `packages/test-utils`; deterministic tests prevent the TypeScript
contracts and these registry policies from drifting apart.

## Implementation profile workflow

`registry/generated/catalog.json` is the inventory authority. Every catalog category owns exactly
one shard, and every catalog ID must occur exactly once in that shard: either in `auditPendingIds`
or as a complete `profiles` record. Move an ID between those collections in one change; never copy
it into both.

An audited profile records the ordinary Shadcn comparison, the useful Mergora advantage, shared
signature patterns and semantic tokens, and at least one component-specific optional enhancement.
Each enhancement must name its public API and separately explain what disabling it removes from the
UI, behavior, events, and accessibility output. Basic and enhanced Storybook evidence use the
`basic-enhancements-disabled` and `recommended-enhancements-enabled` modes respectively, with
selective controls for every enhancement. `storybookControlNames` maps an enhancement to the real
aggregate or component Storybook controls without pretending those control names are public API.
Profile loading verifies the named story export and each claimed control in the referenced module.

`evidence-backed`, `tested`, and `verified` are rejected without evidence references. Profile
maturity is an assessment for promotion review, never a published maturity claim. The generated
matrix keeps target maturity separate from `published: null` until the release evidence pipeline
performs a real promotion.
