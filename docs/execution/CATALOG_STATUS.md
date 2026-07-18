# Catalog status

- Updated: 2026-07-18T08:28:49Z
- Source of truth: `registry/definitions/`
- Current validation result: 168 catalog items plus 10 workflow kits; 7 catalog tests pass in the working tree

Twenty-six canonical entries now have the separate generated status `source-present-unreleased`:
the four P1 tracers, ten P2.A context/infrastructure items, and twelve P2.B intrinsic-layout items.
That status proves canonical source and derived surfaces exist; it does not count an entry as
completed, Stable, or publicly released. Data Grid is additionally visible as Experimental. The
planned definition records retain their target maturity, which is a requirement rather than
shipped evidence.

| Trust/target-maturity class      |    Planned definitions | Implemented | Publicly released | Evidence status        |
| -------------------------------- | ---------------------: | ----------: | ----------------: | ---------------------- |
| Core Stable catalog items        |                    166 |           0 |                 0 | definition seed only   |
| Core Beta catalog items          |           1 (`kanban`) |           0 |                 0 | definition seed only   |
| Labs Experimental catalog items  | 1 (`rich-text-editor`) |           0 |                 0 | definition seed only   |
| Community Verified catalog items |                      0 |           0 |                 0 | out of v1 launch scope |
| Stable workflow kits             |                      9 |           0 |                 0 | definition seed only   |
| Beta workflow kits               |    1 (`scheduler-kit`) |           0 |                 0 | definition seed only   |

Source-present-unreleased entries: **26**. Completed/Stable/released entries: **0**.

ADR-0008 records why the collision-free inventory is 168 + 10. This file must become generated from
the canonical definitions before completed or maturity counts change. Counts keep
components/systems, kits, examples, parts, variants, and internal utilities separate.
