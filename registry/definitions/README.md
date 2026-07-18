# Canonical catalog definition seed

This directory is the typed, serializable pre-implementation source for the Mergora catalog inventory. Every record deliberately says `implementationStatus: "unimplemented"`. `targetMaturity` describes the acceptance target; it is not release evidence. The seed therefore contains no release commit, digest, test result, manual session, or Quality Passport claim.

## Why the catalog count is 168

The component blueprint contains 161 named table rows. Two rows originally used the same `presence` slug for unrelated contracts:

- foundation `presence`: enter/exit lifecycle and reduced-motion behavior;
- collaboration presence: avatar/status, stale, and offline behavior.

Merging those contracts would make the ID unique by deleting a product requirement. The seed instead retains foundation `presence` and names the collaboration entry `collaboration-presence`, leaving all 161 table rows as 161 unique definitions. It then adds the six prose-defined advanced systems (`data-grid`, `tree-grid`, `query-builder`, `filter-builder`, `sortable-list`, and `kanban`) for 167, plus the explicitly required Labs `rich-text-editor` for 168 unique catalog items.

The 10 required workflow kits are separate definitions. The complete seed therefore contains:

- 168 catalog items;
- 10 kits;
- 178 total definitions.

Layer totals are 22 Foundation, 113 Component, 33 System, and 10 Kit definitions. The blueprint's apparent 167 total omits the extra Labs rich-text definition after the duplicate-presence resolution is applied consistently.

## Availability and maturity intent

- All catalog items intend both package and source availability.
- Kits intend reviewable source installation and do not currently intend a package export.
- All records are currently unimplemented.
- Target maturity is Stable except Kanban and Scheduler (Beta) and Labs Rich Text Editor (Experimental).
- Rich Text Editor is Labs trust; all other seed records are Core trust.

## Validation

Run with Node 24 or another Node version that supports erasable TypeScript syntax:

```sh
node --test registry/definitions/catalog.test.ts
```

Validation rejects exact, case-equivalent, and Unicode NFKC-equivalent IDs before enforcing lowercase ASCII kebab-case. It also checks inventory and layer totals, route/layer consistency, the two presence contracts, maturity/trust exceptions, availability intent, non-empty behavior/evidence/state declarations, and honest pre-implementation status.
