# Architecture decision records

ADRs record consequential implementation decisions and approved deviations. They do not override the normative blueprint; a proposed deviation remains unapproved until explicit approval is recorded.

| ADR                                          | Decision                                               | Status                                   |
| -------------------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| [0001](0001-one-public-monorepo.md)          | One public monorepo                                    | Accepted                                 |
| [0002](0002-native-html-and-react-aria.md)   | Native HTML plus React Aria behavior boundary          | Accepted                                 |
| [0003](0003-canonical-source-generation.md)  | Canonical source with deterministic generation         | Accepted                                 |
| [0004](0004-dual-distribution.md)            | Source, package, and mixed distribution                | Accepted                                 |
| [0005](0005-static-github-pages.md)          | Static Next.js site on GitHub Pages                    | Accepted                                 |
| [0006](0006-public-package-resolution.md)    | Deterministic public package resolution                | Accepted; approved unscoped map selected |
| [0007](0007-strictest-quality-thresholds.md) | Apply the strictest compatible quality threshold       | Accepted                                 |
| [0008](0008-canonical-catalog-identity.md)   | Preserve every catalog contract with unique identities | Accepted                                 |

New ADRs should include status, date, context, decision, consequences, and verification. Superseded ADRs remain in history and link to their replacement.
