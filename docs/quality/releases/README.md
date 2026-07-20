# Release evidence

Each candidate and Stable version receives a versioned directory. A Stable directory must contain schema-valid:

- `completion-manifest.json`
- `completion-report.md`
- `evidence-index.json`
- `artifact-inventory.json`
- `known-limitations.json`

Release evidence binds the protected commit, npm tarballs, registry release bundle, site artifact, contracts, Passports, SBOMs, checksums, compatibility results, manual evidence, and public probes into one graph. Inventory verification runs before publication and again against fetched public artifacts.

Do not create a version directory with example, dummy, unknown, temporary, or synthetic release values. There is currently no release evidence because Mergora has no public release.

Before creating this directory, run the maturity validator described in
[`../MATURITY_GATES.md`](../MATURITY_GATES.md). A directory or manifest cannot substitute for missing
evidence.
