# Quality policy registry

These versioned JSON files are policy inputs, not evidence. They contain no inferred pass/fail
results and no mutable timestamps.

- `story-state-policy.v1.json` defines the canonical state matrix.
- `environment-policy.v1.json` defines locale, direction, visual, viewport, zoom, and text controls.
- `evidence-vocabulary.v1.json` maps context-specific states to aggregate states.
- `risk-class-policy.v1.json` defines inherited risk and manual coverage.
- `maturity-policy.v1.json` defines the non-negotiable Stable gate.
- `package-source-parity-policy.v1.json` defines normalized package/source equivalence probes.

Runtime implementations live in `packages/test-utils`; deterministic tests prevent the TypeScript
contracts and these registry policies from drifting apart.
