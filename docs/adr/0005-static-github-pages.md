# ADR-0005: Deploy a static Next.js site through GitHub Pages

- Status: Accepted
- Date: 2026-07-18
- Decider: AkhilTrivediX, through the approved blueprint

## Context

The documentation, registry, Studio sharing, search, and machine surfaces should be reproducible, inexpensive, account-free, and independent of a proprietary application backend.

## Decision

Use Next.js App Router with static export and deploy the validated artifact through GitHub Pages. The canonical launch URL is `https://akhiltrivedix.github.io/mergora/`; `/mergora/` base-path behavior is a release gate. Search, registry, machine docs, and Studio sharing use generated static or client-side data.

A custom domain may be added only after ownership is verified and cannot be a launch dependency. GitHub Pages redirects remain available if a domain is added.

## Consequences

- Unsupported dynamic server features cannot be required by public product flows.
- Root and repository-base-path builds must both be validated.
- Direct nested navigation, JSON MIME types, assets, 404s, and no-script output require explicit tests.
- npm and GitHub Release registry mirrors prevent Pages from being a single availability boundary.

## Verification

The exact static artifact must pass local base-path smoke tests and post-deploy probes for root, nested docs, search, registry index/item, assets, 404, and machine outputs.
