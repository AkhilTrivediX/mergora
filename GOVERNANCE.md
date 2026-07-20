# Mergora governance

## Current authority

Mergora is currently maintained by [AkhilTrivediX](https://github.com/AkhilTrivediX). There is no foundation, steering council, or multi-person maintainer body. This document will be amended when the actual maintainer structure changes.

The maintainer currently owns repository administration, release authority, npm bootstrap coordination, security intake, roadmap integration, and final maturity decisions. Automated gates and evidence requirements remain binding; sole maintenance does not permit a failed release gate to be waived informally.

## Decisions

- Approved product direction and required v1 outcomes are defined by the blueprint and accepted ADRs.
- Reversible implementation details may be decided in pull requests.
- Consequential architecture and public API changes use an RFC with a decision deadline, followed by an ADR when accepted.
- A deviation from required scope, distribution, behavior foundation, accessibility policy, repository strategy, or data-preservation guarantee requires explicit approval and a `Proposed deviation` ADR.
- Security fixes may be developed privately through GitHub Security Advisories when embargo is appropriate.

## Contributions and review

Contributors certify submissions using DCO sign-off. A CLA is not required at launch. CODEOWNERS identifies the review lens required for sensitive areas. While there is only one qualified maintainer, protected automated checks remain mandatory and review records identify the lens applied.

Risk Class 3 manual accessibility evidence cannot be satisfied by self-review alone. Promotion waits for the independent evidence required by the quality contract.

## Maturity

The maintainer assigns Experimental, Labs, Beta, and Stable maturity based on recorded acceptance evidence, not popularity. Stable requires current implementation, contract, tests, documentation, package/source parity, updater fixtures, accessibility evidence, and non-blocking limitations.

## Releases and deprecation

Only protected release automation or an explicitly authorized maintainer may create protected release tags. Stable publication must follow the verified Changesets and OIDC transaction. Deprecations state the replacement, first deprecated version, migration path when feasible, and earliest removal major.

## Becoming a reviewer or maintainer

Review authority is earned through sustained, accurate contributions and demonstrated judgment in the relevant lens. Broader repository or release access additionally requires least-privilege GitHub/npm configuration, 2FA, and participation in security/recovery practice. Adding a maintainer is recorded publicly; private security details remain private.

## Appeals and governance changes

Open a governance issue for a non-sensitive appeal or proposed process change. Sensitive concerns use the private route in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Governance changes require a pull request explaining the actual authority change; this file must never describe a structure that does not exist.
