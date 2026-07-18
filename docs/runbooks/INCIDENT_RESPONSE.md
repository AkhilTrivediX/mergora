# Incident response

## Intake

Private reports enter through the repository's GitHub Security Advisory form. Acknowledge within the service window published in `SECURITY.md`, restrict access to the minimum response group, and avoid copying sensitive material into public issues or ordinary CI logs.

## Triage

1. Record the affected versions, commit/artifact digests, source/package/registry modes, exploit prerequisites, and potential impact.
2. Classify whether credentials, source files, publication identity, confidentiality, integrity, or user completion are at risk.
3. Preserve relevant sanitized logs and provenance without collecting unrelated user data.
4. Identify the last known good commit and public artifact.
5. Freeze publication or Pages only when their integrity is uncertain.

## Remediation

Develop fixes and regression tests privately when embargo is warranted. Coordinate package, registry, docs, dist-tag, and disclosure timing. npm versions are immutable: publish a corrected version rather than attempting to overwrite a bad version.

## Disclosure and follow-up

When safe, publish affected/fixed versions, impact, remediation, and credit. Add permanent regression tests, update threat models and relevant runbooks, and complete a blameless post-incident report for material events.
