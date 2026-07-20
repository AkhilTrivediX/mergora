# ADR-0004: Support source, package, and mixed distribution

- Status: Accepted
- Date: 2026-07-18
- Decider: AkhilTrivediX, through the approved blueprint

## Context

Source ownership enables deep customization but creates lifecycle/update costs. Conventional packages simplify managed upgrades but do not give application teams direct source ownership. The product promise requires both without separate implementations.

## Decision

Mergora supports:

- source mode through the Mergora registry and provenance-aware CLI;
- package mode through tree-shakeable npm subpath imports;
- mixed mode for package foundations plus source-owned application systems.

All modes derive from the canonical source in ADR-0003 and share public APIs, behavior, tokens, accessibility contracts, examples, and version identity.

## Consequences

- Release verification must test source/package parity and mixed-mode duplication.
- Package consumers do not depend on CLI code.
- Tailwind v4 source discovery and a precompiled CSS route must be explicit.
- Clean external consumers, not workspace links, are the proof boundary.

## Verification

Exact packed/public artifacts must pass source, package, and mixed consumer fixtures. Differences in public API, semantics, state, tokens, accessibility behavior, or docs block release.
