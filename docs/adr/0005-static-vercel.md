# ADR-0005: Deploy a static Next.js site through Vercel

- Status: Accepted
- Date: 2026-07-18
- Updated: 2026-07-22
- Decider: AkhilTrivediX, through the approved blueprint

## Context

The documentation, registry, Studio sharing, search, and machine surfaces should be reproducible,
inexpensive, account-free, and independent of a proprietary application backend. The original static
host was GitHub Pages, but the repository-level Pages URL redirects through a separately owned custom
domain that does not resolve. The product owner has now directed the demo website to be hosted on
Vercel instead of GitHub Pages.

## Decision

Use Next.js App Router with static export and deploy the validated artifact through Vercel. The
canonical demo URL is `https://mergora.vercel.app/`. Search, registry, machine docs, Quality Lab,
and Studio sharing use generated static or client-side data.

The app remains static-exportable and can still be built with a repository base path for compatibility
testing, but Pages is no longer the canonical launch channel. A custom domain may be added only after
ownership is verified and cannot be a launch dependency.

## Consequences

- Unsupported dynamic server features cannot be required by public product flows.
- Root Vercel builds are the public deployment path; repository-base-path builds remain a portability
  check, not the launch target.
- Direct nested navigation, JSON MIME types, assets, 404s, and no-script output require explicit tests.
- npm and GitHub Release registry mirrors prevent the website host from being a single availability
  boundary.

## Verification

The exact static artifact must pass local static-export checks and post-deploy Vercel probes for
root, nested docs, search, registry index/item, assets, Quality Lab, 404, and machine outputs.
