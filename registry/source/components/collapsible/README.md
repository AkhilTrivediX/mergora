# Collapsible canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

`Collapsible` composes `Root`, `Trigger`, and `Content` around one React Aria disclosure. It intentionally does not synthesize accordion, heading, tab, or unrelated composite semantics.

Mergora pairs a literal Canvas disclosure surface with an Ink boundary, Green expanded signal, and Violet focus seam. `Trigger` may receive localized `stateText` to show an immediately useful open/closed cue without duplicating screen-reader output; `aria-expanded` stays authoritative. Omit `stateText`, or use null, false, or empty content for the active state, to remove the extra text and presentation node completely while preserving controlled/uncontrolled disclosure behavior.

## Contract

- `open`/`defaultOpen` and `onOpenChange` support controlled or uncontrolled ownership through the same native trigger path.
- The trigger is a native button with React Aria-owned expanded/control relationships; `disabled` prevents activation.
- Content and long labels reflow at 320 CSS pixels, focus stays visible, and the indicator does not animate under reduced motion.

The Root ref resolves to `HTMLDivElement`; other ref targets and stable `data-slot` parts are recorded in `collapsible.anatomy.json`.

## Promotion boundary

Generation drift, strict types, unit/SSR/schema/browser/axe/preference gates, packed consumers, Semantic Sync, manual assistive-technology sessions, reviewed visual evidence, and an approved digest-bound Quality Passport remain required.
