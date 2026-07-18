# Fieldset canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`Fieldset` preserves the native `fieldset` and `legend` relationship, native disabled propagation, and native form behavior. Description and persistent error IDs are merged with consumer-provided `aria-describedby` values; empty or otherwise inaccessible descriptions and errors are treated as absent. Native `aria-invalid` tokens such as `grammar` and `spelling` remain exact while visual invalid styling is derived separately. Development builds warn when the visible legend is empty. Responsive layouts change visual flow without changing reading order.

Promotion still requires generation, packed-consumer and package/source parity, reset/submission, narrow/RTL/forced-colors, Semantic Sync, and current manual keyboard and screen-reader evidence.
