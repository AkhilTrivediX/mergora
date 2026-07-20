# Pagination canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

`Pagination` supports finite page-count navigation and server/cursor navigation. Destinations are real links, the current location is named, ellipses are exposed to assistive technology, and missing previous/next destinations become noninteractive disabled text.

Mergora uses literal Canvas controls, Ink structure, a Green current-page cue, and the shared Violet focus seam. Its useful optional advantage is the explicit `mode="cursor"` path for server-owned sequences that cannot honestly claim a page total. Omit `mode` to keep finite page navigation and remove cursor-only labels, destinations, and behavior; both modes retain real-link progressive enhancement.

## Contract

- Page/count/boundary/sibling inputs are finite integers within range. `getHref` and cursor hrefs must return non-empty URLs outside prohibited executable protocols.
- Page mode renders localized numbers, `rel=prev`/`rel=next`, one current page, and named ellipses. Cursor mode keeps server-owned labels and destinations without pretending to know a total.
- `onNavigate` is advisory: consumers may prevent default for client routing, but the href remains a progressive-enhancement destination.
- Stable Provider keys are `pagination.label`, `pagination.previous`, `pagination.next`, `pagination.ellipsis`, `pagination.page`, and `pagination.currentPage`; explicit non-empty label props win.

The public ref resolves to the `HTMLElement` nav and stable `data-slot` parts are recorded in `pagination.anatomy.json`.

## Promotion boundary

Generation drift, strict types, unit/SSR/schema/browser/axe/preference gates, packed consumers, Semantic Sync, manual assistive-technology sessions, reviewed visual evidence, and an approved digest-bound Quality Passport remain required.
