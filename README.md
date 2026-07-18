# Mergora

> Own the source. Keep the upgrades. See the proof.

Mergora is an open-source React component system being built around source ownership, deterministic upgrades, inspectable quality evidence, and production-complete workflows.

## Project status

Mergora is in Phase P0 (audit and bootstrap), with independent P1 contract work underway. The public repository and immutable blueprint baseline exist, but no npm package or Stable release has been published and the implementation is not ready for application use. Current work and blockers are recorded in [the execution state](docs/execution/STATE.md).

Public claims in this repository stay narrower than the evidence: planned capabilities are not shipped capabilities. Architecture decisions and current execution evidence live in [`docs/`](docs/).

## Intended product

Mergora will provide:

- editable source installation and conventional npm subpath imports from one canonical implementation;
- Semantic Sync for provenance-aware, deterministic base/local/remote updates;
- component-specific accessibility and quality contracts that consumers can rerun after customization;
- public Quality Passports, a Quality Lens, and an accessible token Studio;
- deep input, collection, date/time, file, data, AI/collaboration, and workflow systems;
- static, account-free documentation and registry delivery.

## Development

The workspace scaffold, frozen lockfile, local `pnpm check`, and complete workspace build pass. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for the pinned local setup. The approved unscoped npm package map is verified; P0 remains incomplete until the reviewed foundation branch has immutable clean-clone and CI evidence. Consult [`docs/execution/STATE.md`](docs/execution/STATE.md) for the exact status.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution policy, [SECURITY.md](SECURITY.md) for private vulnerability reporting, and [SUPPORT.md](SUPPORT.md) for the correct public support route.

## Governance and license

The current maintainer and decision process are documented in [GOVERNANCE.md](GOVERNANCE.md). Original project code and documentation examples are licensed under the [MIT License](LICENSE); third-party material retains the licenses recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The Mergora name and brand are covered separately by [TRADEMARKS.md](TRADEMARKS.md).
