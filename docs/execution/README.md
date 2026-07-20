# Execution records

These files are the durable handoff for the Mergora build. They report repository evidence rather than aspiration.

- [`STATE.md`](STATE.md): active phase, next atomic batch, failures, blockers, and recent evidence.
- [`TRACEABILITY.md`](TRACEABILITY.md): normative requirements mapped to implementation and evidence.
- [`CATALOG_STATUS.md`](CATALOG_STATUS.md): generated catalog/maturity status once canonical metadata exists.
- [`RELEASE_READINESS.md`](RELEASE_READINESS.md): P0-P12 gate summary.
- [`BLOCKERS.md`](BLOCKERS.md): external blockers separated from ordinary implementation failures.
- [`PACKAGE_IDENTITY.md`](PACKAGE_IDENTITY.md): selected npm package map and redacted resolution evidence.

A prose update cannot make a gate pass. Status changes require code, test, review, or public-artifact evidence.
