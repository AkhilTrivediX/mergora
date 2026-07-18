# Spinner canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

Spinner is always decorative and accessibility-hidden. BusyRegion owns the actual busy relationship and name.

## Contract

- Spinner accepts no accessible name, role, focus target, or child content. It remains decorative and independent from both BusyRegion ownership and Skeleton layout geometry.
- BusyRegion renders a named region, requires exactly one of label or labelledBy, owns aria-busy, and rejects role/ARIA overrides at type and runtime boundaries. It never places a status or any other live node inside the aria-busy subtree.
- Announcements are opt-in with announce and require the nearest ScreenReaderAnnouncer.Provider. An initially active announcing region or a false-to-true announcing transition enqueues one polite summary through the provider-owned live root outside the region; the stable spinner.busy Provider key supplies default text.
- Re-renders while the same busy period remains active stay quiet. Identical restarts use the provider dedupe window; a changed localized message receives its own dedupe identity.
- Reduced motion removes rotation and leaves a visually distinct static glyph.

The public ref and stable data-slot parts are recorded in spinner.anatomy.json. The exact five-key source manifest, metadata, API, story-state policy, accessibility contract, and honest promotion delta live beside the implementation.

## Promotion boundary

Generation drift, strict types, unit, SSR, hydration, schema, browser, axe, announcement and preference gates, packed consumers, package/source parity, Semantic Sync fixtures, manual assistive-technology sessions, reviewed visual evidence, public-site dogfooding, and an approved digest-bound Quality Passport remain required.
