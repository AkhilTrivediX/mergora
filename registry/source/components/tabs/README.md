# Tabs canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

`Tabs` composes `Root`, `List`, `Tab`, `Panels`, and `Panel` around React Aria. It supports controlled/uncontrolled selection, automatic/manual activation, horizontal/vertical layout, disabled values, explicit direction, long labels, and scrollable overflow.

## URL-state recipe

Give each Tab a safe same-origin `href` such as `?section=billing`, derive Root `value` from the validated route/query value on first render, and update the router in `onValueChange`. Keep the corresponding Panel in the same response so native link navigation remains a progressive-enhancement fallback. Empty, `data:`, `javascript:`, and `vbscript:` href values are rejected.

## Contract

- React Aria owns tablist/tab/tabpanel relationships, selection, and roving focus.
- Automatic mode selects on focus; manual mode waits for Enter or Space. Orientation keys, Home, End, disabled skipping, and explicit RTL spatial order remain covered.
- Horizontal lists scroll inline and vertical lists scroll blockwise without clipping focus at narrow width or zoom.

Root direction inherits from `DirectionProvider` unless an explicit `direction` wins. The List scopes React Aria's keyboard direction without coupling it to the surrounding content locale. Public refs and stable `data-slot` parts are recorded in `tabs.anatomy.json`.

## Promotion boundary

Generation drift, strict types, unit/SSR/schema/browser/axe/preference gates, packed consumers, Semantic Sync, manual assistive-technology sessions, reviewed visual evidence, and an approved digest-bound Quality Passport remain required.
