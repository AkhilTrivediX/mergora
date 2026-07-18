# Maturity gates

Stable validation is fail closed. A missing index, missing context, expired record, unbound digest,
absent reference, incomplete manual matrix, or open A0/A1/A2 defect makes the candidate ineligible.

Stable requires digested declarations for metadata, canonical source, package export, native and
compatible registries, stories, unit/browser/contract/accessibility/visual fixtures, documentation,
the component contract, Quality Passport, updater fixtures, and package-source parity. Each artifact
declaration must be present, digested, and report a passed validator. Stable also requires current
positive contract, measurement, Passport, and release-gate evidence.

Conditional evidence is allowed only with a current, owned, tracked A3 limitation. Failed, blocked,
stale, and unknown evidence are never Stable. Applicable evidence must carry the exact candidate
source digest, performed and expiry instants, and at least one immutable reference.

Manual coverage is selected by the highest behavioral or child risk class:

- Class 1: keyboard/manual visual review and desktop screen-reader verification in both primary
  semantic engines.
- Class 2: Class 1 plus the complete desktop AT set, applicable touch screen reader, forced colors,
  zoom/reflow, RTL, and focus restoration.
- Class 3: Class 2 plus the complete mobile AT set, voice, switch, workflow, interruption/recovery,
  and scale performance.

Initial Stable promotion cannot carry evidence forward. Class 3 release candidates affecting
behavior require freshly performed evidence. Class 1 and 2 carry-forward records disclose the origin
release and are accepted only when source, behavior-dependency, browser-policy, and contract digests
are unchanged.
