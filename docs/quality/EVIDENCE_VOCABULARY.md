# Evidence vocabulary

Lens measurements, Quality Passports, contract runs, and release gates retain their own state
vocabularies. They share only an explicit aggregate state. This avoids treating `not-measurable`,
`not-tested`, `blocked-upstream`, and `not-applicable` as synonyms.

| Context            | Source state         | Aggregate state |
| ------------------ | -------------------- | --------------- |
| Measurement / Lens | Pass                 | Satisfied       |
| Measurement / Lens | Fail                 | Failed          |
| Measurement / Lens | Warning              | Conditional     |
| Measurement / Lens | Manual check         | Conditional     |
| Measurement / Lens | Not measurable       | Unknown         |
| Passport           | Pass                 | Satisfied       |
| Passport           | Pass with limitation | Conditional     |
| Passport           | Fail                 | Failed          |
| Passport           | Not tested           | Unknown         |
| Passport           | Not applicable       | Not applicable  |
| Passport           | Expired              | Stale           |
| Passport           | Blocked upstream     | Blocked         |
| Contract           | Pass                 | Satisfied       |
| Contract           | Fail                 | Failed          |
| Contract           | Blocked upstream     | Blocked         |
| Contract           | Not applicable       | Not applicable  |
| Release gate       | Pass                 | Satisfied       |
| Release gate       | Fail                 | Failed          |
| Release gate       | Blocked              | Blocked         |
| Release gate       | Not applicable       | Not applicable  |

For mixed applicable evidence, aggregate precedence is Failed, Blocked, Stale, Unknown,
Conditional, then Satisfied. An entirely not-applicable set aggregates to Not applicable. An empty
set is Unknown. No converter creates evidence or upgrades an unknown, stale, or blocked state.

An evidence index is valid only when identity, exact source digest, contract version, timestamps,
references, contextual state mapping, uniqueness, and canonical ordering validate. Canonical JSON is
available for callers to hash; the caller still supplies and records the digest.
