# ADR-0006: Resolve public package identity deterministically

- Status: Accepted; approved unscoped mapping selected
- Date: 2026-07-18
- Decider: AkhilTrivediX, through the approved blueprint

## Context

Package availability and scope ownership are mutable. An npm `E404` alone is not proof of publish authority, and hard-coded preferred names would create drift if a fallback is required.

## Decision

During P0, authenticate the intended npm publisher and execute the fixed selection order from the release plan:

1. preferred `mergora` CLI plus controlled `@mergora/*` scope;
2. controlled `@akhiltrivedix/mergora-*` package map;
3. the approved unscoped fallback names;
4. `mergora-cli` only if the CLI package name is unavailable, retaining the `mergora` binary when valid.

Stop rather than invent another product name if every approved candidate conflicts. Commit the chosen mapping to `config/public-packages.json`; all imports, commands, schemas, payloads, docs, tarball tests, and site content derive from it.

The authenticated read-only resolution on 2026-07-18 did not establish organization control of `@mergora` or control of the `@akhiltrivedix` scope. Package-level write access to the existing `@mergora/gora` package did not establish organization or team control. Every exact name in the approved unscoped tier, including the CLI fallback, returned npm registry `E404`, so the selected map is:

- `mergora` with the `mergora` executable;
- `mergora-ui`;
- `mergora-tokens`;
- `mergora-schema`;
- `mergora-registry`;
- `mergora-contracts`;
- `mergora-mcp`.

This selection is recorded as `verified` in `config/public-packages.json`. The human-readable evidence boundary is in [`docs/execution/PACKAGE_IDENTITY.md`](../execution/PACKAGE_IDENTITY.md).

## Consequences

- The product name, repository, and CLI binary remain locked.
- npm authentication is no longer an external blocker for selecting the concrete mapping.
- No package is published merely to reserve a name.
- A repository-wide/generated search must prove alternate maps are absent before public release.
- Availability and similarity observations are time-bound and do not constitute trademark, legal, or confusion clearance.

## Verification

The authenticated checks were recorded without a username, token, npm configuration, or request headers. The selected map, read-only lookup outcomes, and evidence limitations are public; credential material is not. Recheck availability and authority immediately before the first publish, then record the committed map digest, generated-string validation, exact tarball metadata, and successful remote installs.
