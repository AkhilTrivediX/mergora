# Partial release recovery

## Safety rule

Do not move `latest` until the complete coherent package set has published and passed remote verification. Record every release-state transition in the protected workflow summary.

## Detection and containment

1. Stop subsequent publication and canonical website/registry promotion.
2. Capture the verified candidate manifest, packages successfully published, current dist tags, provenance state, workflow IDs, and failure.
3. Determine whether any package is unsafe or merely incomplete.
4. Keep newly published safe versions under no Stable tag or under `next` while repairing.

## Recovery cases

- **Failure before `latest` moves:** repair the release defect and publish a coherent corrected version when required. Do not overwrite npm versions.
- **Partial `latest` movement:** restore prior known-good tags where safe, publish an incident notice, and release a coherent patch.
- **Unsafe artifact:** deprecate it with actionable remediation and publish a corrected patch. Use unpublish only for a genuine security/legal emergency under npm policy.
- **Missing provenance:** do not promote the version. Correct the trusted-publishing path and publish a newly attested version.
- **Incorrect website/registry data with sound packages:** restore the last known-good website
  artifact or deploy a corrected site. Keep immutable npm/GitHub Release mirrors available.
- **GitHub Release assembly failure:** leave package state unchanged, rebuild the release record from verified artifacts, and do not claim a complete release until all required assets agree.

## Verification

Re-run remote package metadata/content/provenance checks, clean Next/Vite consumers, registry and site probes, digest reconciliation, and release notes/limitations. Link the incident record from release readiness.

## Tabletop status

Not yet rehearsed. P11 cannot pass until a dated tabletop produces retained observations and closes any release-blocking action.
