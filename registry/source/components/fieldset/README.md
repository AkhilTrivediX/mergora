# Fieldset canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`Fieldset` preserves the native `fieldset` and `legend` relationship, native disabled propagation, and native form behavior. Description and persistent error IDs are merged with consumer-provided `aria-describedby` values; empty or otherwise inaccessible descriptions and errors are treated as absent. Native `aria-invalid` tokens such as `grammar` and `spelling` remain exact while visual invalid styling is derived separately. Development builds warn when the visible legend is empty. Responsive layouts change visual flow without changing reading order.

The Mergora field-family hierarchy uses strong legend type, ink structure, logical layouts, and restrained green status signals. `selectionSummary` optionally adds persistent group context and its own `aria-describedby` ID. Omitting it removes both the rail and the programmatic relationship while native group behavior remains unchanged.

Promotion still requires generation, packed-consumer and package/source parity, reset/submission, narrow/RTL/forced-colors, Semantic Sync, and current manual keyboard and screen-reader evidence.
