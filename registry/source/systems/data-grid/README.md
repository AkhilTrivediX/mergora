# Data Grid Experimental tracer

Status: implemented narrow P1 source; Experimental, unreleased, and intentionally incomplete.

This tracer proves that Mergora can wrap TanStack Table's data model without exposing TanStack types or surrendering rendered semantics. It implements semantic-table sorting, explicit single-row selection, stable row identity, empty state, and a labelled focusable scrolling region. It does not claim the full Data Grid contract.

```tsx
<DataGrid
  caption="Open incidents"
  rows={incidents}
  getRowId={(incident) => incident.id}
  columns={columns}
  selectionMode="single"
  getRowLabel={(incident) => `Select ${incident.title}`}
/>
```

`caption`, stable row IDs, and meaningful cell rendering are required. When selection is enabled, provide `getRowLabel` for localized, task-specific radio names. The region label defaults to a caption-derived English string only as a development convenience; production localized surfaces should supply `regionLabel`.

The local [P1 browser evidence](../../../../docs/quality/BROWSER_EVIDENCE.md) covers only this
tracer's semantic-table sort, single-row selection, labelled narrow scroll region, preferences,
and fixture axe gate. It is not the Risk Class 3 evidence required for the production system.

The draft contract is the authoritative completion delta. Generated catalog, package, and Passport
surfaces must keep this item Experimental and must not imply manual assistive-technology evidence
or full production-grid capability.
