# ADR-0003: Generate public surfaces from one canonical source

- Status: Accepted
- Date: 2026-07-18
- Decider: AkhilTrivediX, through the approved blueprint

## Context

Maintaining copy-install source, npm source, registry payloads, documentation examples, tests, contracts, and Passports independently would allow behavior and evidence to drift.

## Decision

`registry/source` is the only hand-edited public component, system, kit, and theme implementation source. Deterministic one-way generators produce npm package source and exports, native and shadcn-compatible registry data, docs/API/source views, examples/stories, search, contract/Passport associations, and changelog inputs.

Generated outputs are never corrected manually. CI regenerates, compares, and fails with a reviewable diff.

## Consequences

- Generators and schemas become release-critical infrastructure.
- Canonical changes must update all derived surfaces in the same batch.
- Generation must be byte-deterministic across supported environments after declared normalization.
- Generated output must contain no timestamp, local path, secret, or unordered data.

## Verification

Repeated Windows/Linux generation must be byte-identical. Drift, path collisions, unsafe targets, undeclared imports, cycles, schema mismatch, and hand edits fail protected CI.
