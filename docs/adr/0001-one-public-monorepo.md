# ADR-0001: Use one public monorepo

- Status: Accepted
- Date: 2026-07-18
- Decider: AkhilTrivediX, through the approved blueprint

## Context

A component API, canonical implementation, registry payload, package export, documentation page, contract, migration, and Quality Passport often change atomically. Splitting them across repositories would weaken traceability and make release evidence harder to bind to one source commit.

## Decision

`AkhilTrivediX/mergora` is the single public monorepo for the site, Storybook/Quality Lab, canonical source, generated registry, CLI/update engine, packages, schemas, tests, fixtures, documentation, and release automation.

A future untrusted Community marketplace index is the only contemplated second-repository trust boundary and is post-v1.

## Consequences

- Cross-surface changes can be reviewed and tested under one commit identity.
- Generated drift and package/source parity are visible in one CI graph.
- Repository permissions and security controls cover a broad surface and must remain least-privilege.
- A broken deployment or base path is fixed in this repository, not worked around with a second repository.

## Verification

The repository topology, generators, release manifest, and public artifacts must all resolve to the same protected commit. The P12 audit must require no unpublished second repository.
