# Quality evidence

This directory stores auditable quality records. A component or release is not Stable because a file exists here; evidence must be current, schema-valid, traceable to exact source and artifact digests, and reviewed at the required risk depth.

- [`automated/`](automated/): CI and local automated evidence indexes.
- [`manual/`](manual/): reviewed manual accessibility, responsive, browser, and interaction records.
- [`passports/`](passports/): generated safe public Quality Passport outputs.
- [`releases/`](releases/): versioned completion manifests, reports, inventories, limitations, and release evidence.
- [`HARNESS.md`](HARNESS.md): reusable state, environment, semantic, accessibility, geometry, and capture contracts.
- [`EVIDENCE_VOCABULARY.md`](EVIDENCE_VOCABULARY.md): lossless mapping between Lens, Passport, contract, and release-gate states.
- [`MATURITY_GATES.md`](MATURITY_GATES.md): the evidence and artifact conditions for Stable.
- [`ADAPTER_WIRING.md`](ADAPTER_WIRING.md): exact optional dependency wiring for concrete runtimes.
- [`P3_CLI_DISCOVERY.md`](P3_CLI_DISCOVERY.md): historical P3.2 CLI initialization and discovery
  freeze.
- [`P3_TRANSACTION_PROVENANCE.md`](P3_TRANSACTION_PROVENANCE.md): P3.3/P3.4 transaction,
  recovery, and immutable provenance evidence.

Evidence must not contain credentials, private paths, personal disability information, authorization headers, or unredacted hostile payloads. Transient logs and screenshots without source/run identity are not completion evidence.

The executable, dependency-free contracts live in `packages/test-utils`; the deterministic runner
lives in `tooling/contract-runner`. Registry policy files under `registry/quality` are policy, never
evidence.
