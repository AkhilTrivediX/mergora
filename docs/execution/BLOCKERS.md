# Blockers

External blockers are limited to missing authority, exhausted approved names, required legal acceptance, or an out-of-repository destructive action. Ordinary unfinished implementation is not an external blocker.

## Active external blockers

None.

## Resolved external blockers

| ID               | Resolved   | Resolution evidence                                                                                                                                                                            | Remaining release gate                                                                                                                                              |
| ---------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXT-NPM-AUTH-001 | 2026-07-18 | Authenticated read-only checks selected the verified approved unscoped map without recording the account identity or credentials. See `config/public-packages.json` and `PACKAGE_IDENTITY.md`. | Recheck availability and publish authority immediately before initial publication; then verify tarballs, provenance, trusted publishing, and clean remote installs. |

## Implementation gates, not external blockers

- The public default branch contains the immutable blueprint commit; the reviewed scaffold still needs its feature-branch commit and pull request.
- The scaffold, lockfile, frozen install, build, and local root aggregate pass, but clean-clone and CI evidence do not yet reference the foundation commit.
- GitHub Discussions, environments, security settings, labels, main protection, and release-tag immutability are configured. Pages deployment and required CI contexts remain unexercised.
- The approved unscoped package map is verified from authenticated read-only checks. Availability and legal/confusion review remain time-bound pre-publication gates.
- Exact unreleased package tarballs and generated registry artifacts now exist and pass P1 consumers; no public npm package, deployed production site/registry, or release exists yet.

These items require implementation or repository configuration and must not be used to pause independent work.
