# Security policy

## Supported versions

Mergora has not published a public release. During bootstrap, security fixes apply to the current development branch and no package version is represented as supported. A version support table will be added before the first prerelease and must match published packages and release policy.

## Report a vulnerability privately

Use [GitHub's private vulnerability reporting form](https://github.com/AkhilTrivediX/mergora/security/advisories/new). Do not open a public issue for a suspected vulnerability, include exploit details in a public pull request, or disclose a proof of concept before coordination.

Include, when safe:

- the affected commit, package, registry/source mode, and command or route;
- prerequisites and impact;
- minimal reproduction steps or sanitized artifacts;
- whether credentials, source files, publication identity, or user content may be at risk;
- a preferred credit name, or a request for anonymity.

The project targets acknowledgement within three business days. Triage will classify affected versions and modes, restrict access to the minimum response group, preserve relevant evidence, and coordinate remediation and disclosure. GitHub's private advisory channel is the available confidential route; the project does not currently publish a separate encryption key.

## Security scope

High-priority reports include path or symlink escape, destructive source updates, arbitrary registry execution, digest/provenance bypass, compromised GitHub/npm workflows, dependency/build compromise, credential exposure, unsafe generated or rendered content, documentation-site script injection, and misleading release provenance.

Severe accessibility defects that trap users or prevent completion of a critical workflow receive rapid patch handling, but use a private embargo only when confidentiality, integrity, or execution risk warrants it.

## Response and publication

Mergora uses immutable npm versions. A bad publication is deprecated and replaced with a corrected version; unpublish is reserved for a genuine security or legal emergency under npm policy. Material incidents result in regression tests, runbook/threat-model updates, and a public advisory when safe.

Do not send secrets, recovery codes, private npm configuration, complete authorization headers, or unrelated personal data with a report.
