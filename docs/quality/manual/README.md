# Manual evidence

Manual records cover user tasks and environments that automation cannot prove. A generated campaign workspace is only a plan: it is **NOT RUN** and is never a pass, conformance, maturity, or release claim.

The generated catalog supplies each item's Risk Class. The typed policy then expands that risk into exact lane–coverage claims. A claim is valid only when its record uses the named lane and exactly matches the lane's OS, browser, assistive technology, input, locale, direction, viewport, zoom, theme, and motion settings. Numeric OS, browser, and assistive-technology versions must be recorded at execution time; `latest`, `current`, omitted versions, and version ranges are invalid.

## Prepare a campaign

Use `pnpm test:manual:prepare` to create a Git-ignored workspace under `artifacts/manual-evidence-preparation/<commit>/`. Use `node scripts/prepare-manual-evidence.mjs --plan` for a no-write summary.

Preparation workspaces contain:

- every item from the generated implementation matrix, reconciled with its generated-catalog Risk Class;
- every required exact environment lane and coverage claim for that risk;
- domain-neutral task instructions and expected outcomes;
- blank version, digest, observation, outcome, tester, reviewer, and artifact fields;
- an explicit `not-run` status at item, session, and task level.

The workspace must stay `NOT RUN` until a person actually executes each task. Do not fill results from automated tests, another component, another lane, an APG example, or another library's claim.

## Record integrity rules

- Use the policy `laneId`; do not relabel a substituted environment as an allowed lane.
- Semantic-engine A and B require their separate NVDA/Firefox and VoiceOver/Safari records. One environment cannot satisfy both.
- Current and previous support slots require different exact OS or assistive-technology versions where policy declares a pair.
- Bind every record to the candidate `sourceDigest`, `behaviorDependencyDigest`, `browserPolicyDigest`, and exact `contractVersion`.
- Attach at least one sanitized artifact with an immutable location and SHA-256 digest. A missing, mutable, duplicate, or invalid artifact invalidates the record.
- A passing record with any validation or candidate-binding error contributes no maturity coverage.
- Risk Class 3 records require a reviewer whose identity differs from the tester. Self-review never satisfies the gate.
- `not-applicable` requires a rationale and is accepted only for policy coverage that explicitly permits it.
- Carried-forward evidence is valid only when exact digest, release-candidate, and dependency blast-radius rules permit it. Initial Stable and affected Risk Class 3 release candidates require fresh evidence.
- Never request or retain personal disability information. Remove credentials, private machine paths, account data, and unrelated personal content from artifacts.

Use [`RECORD_TEMPLATE.md`](RECORD_TEMPLATE.md) for a completed record and [`CAMPAIGN.md`](CAMPAIGN.md) for campaign status and execution sequencing.
