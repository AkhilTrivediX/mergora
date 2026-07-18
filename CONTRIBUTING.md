# Contributing to Mergora

Mergora welcomes focused bug fixes, tests, documentation improvements, and proposals that preserve its source-safety and evidence contracts. The project is still in bootstrap; consult [`docs/execution/STATE.md`](docs/execution/STATE.md) before beginning work.

## Before opening a change

- Search existing [issues](https://github.com/AkhilTrivediX/mergora/issues).
- Use the dedicated accessibility issue form for accessibility defects; disclosing a disability is never required.
- Report vulnerabilities privately through the route in [SECURITY.md](SECURITY.md), not in an issue or pull request.
- Read the relevant blueprint document and ADR before changing a public contract.
- Keep generated files generator-owned. Fix canonical source or the generator instead of hand-patching derived output.

## Development contract

Use Node 24.12.0 and the repository's pinned pnpm 11.14.0 toolchain:

```bash
corepack pnpm@11.14.0 install --frozen-lockfile
corepack pnpm@11.14.0 check
corepack pnpm@11.14.0 build
```

Using Corepack with the explicit version avoids depending on a globally installed package manager or requiring permission to rewrite system-level shims. The frozen install, local aggregate, and build pass in the current P0 working tree. Immutable external-clone and protected-CI evidence is pending the reviewed foundation commit. The broader contributor command contract includes focused unit/story/browser/accessibility tests, generated drift checks, consumer tests, packaging, and `pnpm release:verify`; a command is not considered implemented if it only exits successfully without exercising its gate.

A contribution should:

1. state the user-visible problem and affected requirement IDs;
2. include tests for behavior and regression risk;
3. update contracts, stories, docs, and evidence metadata when public behavior changes;
4. add a Changeset when a published public API or behavior would change;
5. run the documented local gates that exist for the affected area;
6. include screenshots or evidence artifacts only when they are current, sanitized, and useful for review.

Do not commit credentials, npm configuration, authorization headers, private paths, personal assistive-technology data, or unredacted hostile payloads.

## Architecture and API changes

Consequential architecture or public API changes require a numbered RFC under `docs/rfcs/` and, when accepted, an ADR. Deviating from required v1 scope, dual distribution, the native-plus-React-Aria boundary, source-preserving updates, accessibility evidence policy, repository strategy, or privacy policy requires explicit approval; a pull request alone does not authorize the deviation.

## Accessibility review

Accessibility behavior is public API. Changes must preserve applicable semantics, accessible names, keyboard behavior, focus movement/restoration, announcements, pointer/touch alternatives, RTL/localization, forced colors, reduced motion, zoom, and reflow. Automated checks are necessary but never stand in for required manual assistive-technology evidence.

## Maturity promotion

Popularity or visual completeness does not promote an item. Promotion requires its metadata, implementation, tests, documentation, update fixtures, clean-consumer evidence, accessibility contract, current evidence, and approved limitations to satisfy the applicable maturity gate.

## Developer Certificate of Origin

This project uses the [Developer Certificate of Origin 1.1](https://developercertificate.org/). Sign off each commit with:

```text
Signed-off-by: Your Name <your-address@example.com>
```

Use `git commit -s` to add the sign-off. The sign-off certifies that you have the right to submit the contribution under the project's license. Mergora does not require a contributor license agreement at launch.

## Review and conduct

All contributions follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Reviews may request evidence from the relevant API, accessibility, updater, registry, visual, package, or security lens. The current single-maintainer model is documented in [GOVERNANCE.md](GOVERNANCE.md); required checks remain mandatory even when a second qualified code reviewer is unavailable.
