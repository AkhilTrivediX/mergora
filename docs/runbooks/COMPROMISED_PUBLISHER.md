# Compromised publisher recovery

This runbook covers suspected compromise of a GitHub maintainer/session, GitHub App, workflow identity, npm account/team, trusted-publisher binding, or release environment.

## Immediate containment

1. Freeze npm publication environments and Pages deployment if artifact integrity is uncertain.
2. Revoke or rotate affected sessions, tokens, recovery credentials, SSH/GPG keys, and application grants.
3. Inspect GitHub and npm audit logs and preserve immutable evidence.
4. Remove or suspend untrusted maintainers/apps/runners and review both GitHub and npm permission planes.
5. Protect known-good tags and identify the last verified commit/artifact through digests and provenance.

## Scope analysis

Review repository settings, branch/tag rules, workflow and Action changes, environments, OIDC claims, package owners, dist tags, package contents, provenance, GitHub Releases, Pages artifacts, registry mirrors, issues/advisories, and recently rotated secrets.

## Recovery

1. Restore least-privilege identities and required 2FA/recovery ownership.
2. Revalidate workflow Action SHAs and protected environment bindings from a known-good commit.
3. Deprecate unsafe immutable package versions and publish corrected versions through restored trusted publishing.
4. Restore known-good dist tags and Pages/registry artifacts where safe.
5. Verify exact remote contents, provenance, consumers, and source/update flows before unfreezing publication.

## Communication and follow-up

Publish a coordinated advisory identifying affected/fixed versions, impact, required consumer action, and evidence when safe. Add regression controls and complete a post-incident review.

## Tabletop status

Not yet rehearsed. P11 cannot pass until a dated compromised-publisher exercise is reviewed and its blocking actions are closed.
