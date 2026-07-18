# ADR-0008: Preserve every catalog contract with unique identities

- Status: Accepted
- Date: 2026-07-18
- Decider: Blueprint reconciliation during P0 audit

## Context

The catalog table contains 161 rows, but two unrelated rows use the slug `presence`: a Foundation lifecycle utility and an AI/collaboration status surface. The prose also requires six advanced systems and a Labs Rich Text Editor outside that table. Treating the duplicate slug as one component would erase one normative behavior contract; omitting the Labs item would erase another explicit requirement.

## Decision

Keep the Foundation lifecycle utility as `presence` and assign the collaboration surface the unambiguous ID `collaboration-presence`. Add the six prose-defined advanced systems (`data-grid`, `tree-grid`, `query-builder`, `filter-builder`, `sortable-list`, and `kanban`) and the Labs `rich-text-editor` as distinct definitions.

The canonical inventory is therefore:

- 168 component/system catalog items: 22 Foundation, 113 Component, and 33 System definitions;
- 10 workflow kits;
- 178 total definitions.

The apparent blueprint total of 167 is not used as a destructive cap. Named normative requirements outrank the inconsistent summary count. Every surface must derive counts and IDs from the validated canonical catalog rather than embedding a number independently.

## Consequences

- Both presence contracts remain discoverable and testable.
- Routes, package subpaths, registry payloads, search, documentation, MCP, and evidence records can use collision-free stable IDs.
- The Labs Rich Text Editor remains Experimental and cannot inflate Stable counts.
- Any future rename requires a migration/alias decision rather than silent identity reuse.

## Verification

`registry/definitions/catalog.test.ts` rejects exact, case-folded, and Unicode NFKC-equivalent collisions and asserts the 168 + 10 inventory and layer totals. Generated surfaces must consume that validated definition set and fail on drift.
