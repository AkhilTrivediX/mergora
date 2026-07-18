# Banner canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

Banner renders a persistent named page/site aside with actions and optional dismissal. Persistence is injected through an adapter rather than reading ambient storage, and narrow behavior follows the component's own inline size rather than the viewport.

## Contract

- Controlled and uncontrolled dismissal are exclusive. Controlled mode accepts `dismissed` and only proposes changes through `onDismissedChange`; it cannot accept `defaultDismissed` or `persistence`.
- Uncontrolled mode may accept `defaultDismissed` and an adapter keyed by the stable banner id. Adapter writes run only after the internal transition commits. Read/write failures fall back safely and are reported through `onPersistenceError`; a failing reporter is contained too.
- Persistence reads are synchronous but never run during server rendering. Server and initial hydration markup carry `data-persistence-pending`; CSS suppresses that unresolved banner, and an isomorphic layout effect reads the adapter and resolves visibility before the first React-controlled browser paint. A client-only adapter cannot know state before JavaScript starts, so applications requiring server-visible content should seed `defaultDismissed` from server state or provide a server-readable adapter. The no-script media policy restores the default rendering when scripting is disabled.
- The banner is non-live, non-sticky, visibly labels severity, and its native dismiss button is at least 44 CSS pixels.
- The dismiss button owns visible hover, active, and focus-visible states. Its active press offset is removed under reduced motion, and forced colors use system highlight colors.
- The aside owns `aria-labelledby`, non-live behavior, and visibility. Runtime attempts to replace its role, name, live-region properties, `aria-hidden`, or `hidden` are rejected; safe native attributes such as `aria-describedby`, event handlers, data attributes, styles, and `tabIndex` remain available.
- The root establishes an inline-size query container. Its documented `banner-layout` part reflows actions beneath content at narrow embedded widths, including 240 and 320 CSS pixels in an otherwise wide viewport.
- Stable Provider keys are banner.dismiss, banner.info, banner.success, banner.warning, and banner.error; explicit labels win.

The public ref and stable data-slot parts are recorded in banner.anatomy.json. The exact five-key source manifest, metadata, API, story-state policy, accessibility contract, and honest promotion delta live beside the implementation.

## Promotion boundary

Generation drift, strict types, unit, SSR, hydration, schema, browser, axe, announcement and preference gates, packed consumers, package/source parity, Semantic Sync fixtures, manual assistive-technology sessions, reviewed visual evidence, public-site dogfooding, and an approved digest-bound Quality Passport remain required.
