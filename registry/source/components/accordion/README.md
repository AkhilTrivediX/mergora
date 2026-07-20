# Accordion canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

`Accordion` composes `Root`, `Item`, `Header`, `Trigger`, and `Panel` around React Aria disclosure primitives. Root supports controlled or uncontrolled single/multiple expansion. Each trigger remains a native button inside an explicit semantic heading level.

Mergora uses literal Canvas panels, precise Ink separators, a Green expanded signal, and the shared Violet focus seam. `renderExpansionSummary` is an optional useful overview for long or multi-open sets; it receives the current controlled or uncontrolled keys and renders a polite status rail. Omit the prop to remove the formatter call, or return null, false, or empty content to suppress the rail and live-region output while retaining the ordinary accordion behavior.

## Contract

- `value` and `defaultValue` contain non-empty unique string keys; single mode accepts at most one.
- Enter and Space retain native disclosure activation. ArrowUp, ArrowDown, Home, and End move focus among enabled triggers without changing expansion.
- `disabled` works at root and item scope. Labels and panels reflow at 320 CSS pixels, and indicator motion disappears under reduced motion.

The Root ref resolves to `HTMLDivElement`; other ref targets and stable `data-slot` parts are recorded in `accordion.anatomy.json`.

## Promotion boundary

Generation drift, strict types, unit/SSR/schema/browser/axe/preference gates, packed consumers, Semantic Sync, manual assistive-technology sessions, reviewed visual evidence, and an approved digest-bound Quality Passport remain required.
