# Sidebar canonical source

Status: source present and unreleased. No Stable, package-parity, persistence-security, or manual assistive-technology claim is made.

`Sidebar` provides a collapsible desktop rail and a separate mobile disclosure with explicit close control, Escape dismissal, and focus return. Expanded desktop and mobile groups use native `details`; the collapsed rail replaces invisible disclosure triggers with named, always-available groups so keyboard focus never lands on clipped controls. Destinations remain real safe links with current-page semantics. Collapse and mobile disclosure both support controlled and uncontrolled state, while router behavior stays consumer-owned.

The optional persistence adapter keeps storage policy outside Mergora. When omitted, no read, write, error callback, storage event, UI, or accessibility output exists. When supplied, it initializes only uncontrolled collapse state and writes only requested transitions; adapter failures are contained and may be reported through `onPersistenceError`. Literal Canvas, Ink divisions, Green selected state, Violet focus geometry, restrained corners, narrow reflow, RTL logical edges, forced colors, and reduced-motion fallback define the family identity.

Promotion still requires generated parity, packed consumers, persistence-adapter failure evidence, complete cross-browser mobile checks, and current manual assistive-technology records.
