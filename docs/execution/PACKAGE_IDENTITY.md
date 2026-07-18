# Public package identity

- Decision date: 2026-07-18
- Selection status: verified
- Selection tier: approved unscoped names
- Registry checked: `https://registry.npmjs.org/`

## Selected map

| Role              | npm package         | Executable |
| ----------------- | ------------------- | ---------- |
| CLI               | `mergora`           | `mergora`  |
| React UI          | `mergora-ui`        | -          |
| Tokens            | `mergora-tokens`    | -          |
| Schemas           | `mergora-schema`    | -          |
| Registry SDK      | `mergora-registry`  | -          |
| Quality contracts | `mergora-contracts` | -          |
| MCP integration   | `mergora-mcp`       | -          |

`config/public-packages.json` is the canonical machine-readable map. Package manifests, imports, schemas, generators, examples, and consumer checks must derive from it.

The verified file's SHA-256 at selection time is `58568791d3078cee2e4a1dd9ccffdb7aaa6194e746e23e936e1ccd19349997fb`. Release evidence must bind this digest to the immutable commit used for publication.

## Redacted resolution evidence

Authenticated read-only checks completed on 2026-07-18. The authenticated account identity is intentionally redacted, and no token, npm configuration, credential file, request header, or environment dump was recorded.

- npm organization and team control of `@mergora` was not established.
- Package-level write access to the existing `@mergora/gora` package was observed. Access to one package does not establish organization or team control of the scope.
- The `@akhiltrivedix` scope lookup returned npm `E404`; authenticated control of that scope was not established.
- Each selected unscoped package name returned npm registry `E404`: `mergora`, `mergora-ui`, `mergora-tokens`, `mergora-schema`, `mergora-registry`, `mergora-contracts`, and `mergora-mcp`.
- The approved CLI fallback `mergora-cli` also returned npm registry `E404` and was not selected because `mergora` is the higher-priority candidate.

The fixed selection algorithm therefore chose the approved unscoped tier. `EXT-NPM-AUTH-001` is resolved for package-map selection and is not an active blocker.

## Evidence boundary

Registry availability is mutable. An `E404` observation is time-bound and is not a reservation or a guarantee that publication will succeed later. The existing `@mergora/gora` package is recorded as a similarity observation only. This report does not claim trademark, legal, or confusion clearance, and no empty package will be published merely to reserve a name.

Immediately before the first release, recheck exact-name availability, authenticated publish authority, confusingly similar active packages, security history, and legal conflicts. Publication, trusted-publisher configuration, provenance verification, tarball verification, and remote clean installs remain separate release gates.
