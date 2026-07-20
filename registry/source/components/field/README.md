# Field canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`Field` composes a visible native label, optional description, control slot, and persistent error. It generates deterministic hydration-safe IDs and shares them with Mergora form controls through context. Consumers using a third-party control must pass the same `controlId` to that control themselves.

Each Field supports one direct primary control and a non-empty visible label. Development builds warn when that composition is invalid. For integrated Mergora controls, Field owns the control ID: a conflicting child `id` is ignored with a development diagnostic so `label[for]` can never silently point at the wrong element. An explicit `controlId` must be non-blank. Empty or otherwise inaccessible description and error values are treated as absent instead of creating empty ARIA references.

Required state is carried by the native control; the visual asterisk is hidden from assistive technology. `optionalLabel`, validation text, and every other user-facing string remain consumer-localizable. Errors are persistent rather than assertive; use `ValidationSummary` for submit-time focus and announcements.

The Mergora field signature is a precise ink hierarchy on a literal Canvas surface with logical spacing and the shared violet two-layer focus seam. `contextualAction` is an optional label-adjacent recovery surface for actions such as restoring a suggested value. Omit it to remove its node, event path, focus target, and accessibility output completely.

Promotion still requires generated output checks, packed consumers, package/source parity, narrow/RTL/forced-colors evidence, Semantic Sync fixtures, and current manual keyboard and screen-reader records bound to the candidate digest.
