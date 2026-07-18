# Breadcrumb canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

`Breadcrumb` renders a named nav landmark and ordered hierarchy. Ancestors are real links, the final item is the current page, and a container-query compact view keeps every hidden ancestor available through native `details`.

## Contract

- Item ids are non-empty and unique; labels expose content; every ancestor has a non-empty safe href; current state is unique and final.
- When `current` is omitted, the final item becomes current. A supplied current item anywhere else is rejected.
- Narrow collapse preserves the first item, visible tail, final current page, and the complete hidden path; duplicate full/compact views are mutually removed from layout and the accessibility tree by CSS display state.
- `breadcrumb.label` and plural-aware `breadcrumb.showHidden` are stable Provider keys. An explicit non-empty `label` wins.

The public ref resolves to the `HTMLElement` nav and stable `data-slot` parts are recorded in `breadcrumb.anatomy.json`.

## Promotion boundary

Generation drift, strict types, unit/SSR/schema/browser/axe/preference gates, packed consumers, Semantic Sync, manual assistive-technology sessions, reviewed visual evidence, and an approved digest-bound Quality Passport remain required.
