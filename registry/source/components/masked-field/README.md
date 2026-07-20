# MaskedField canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, adapter-safety, or manual assistive-technology claim is made.

`MaskedField` keeps one real native text input as the editable control and forwards its ref. Selection, undo, paste, autocomplete, mobile input modes, validation, focus, and IME events remain browser behavior. No browser, screen-reader, editor, or platform key is intercepted. Composition text remains exact until `compositionend`.

A `DeterministicMaskAdapter` is required. It is synchronous trusted application code that returns formatted text, raw text, validity, and caret mapping. Mergora checks bounded input/output, result shape, selection bounds, and recovery behavior. Invalid results must preserve the exact visible input rather than silently dropping characters.

The adapter is a code-only trust boundary, not a declarative language. The component does not accept serialized mask definitions, regular-expression strings, remote modules, runtime compilation, dynamic expressions, or `eval`. Do not turn registry metadata, URL state, pasted text, or other untrusted data into executable adapters. The adapter itself remains consumer-reviewed code and must do bounded deterministic work.

The editable formatted input does not carry `name`. When `name` is supplied, a hidden same-form control serializes the explicit `serialization` choice: `raw` by default or `formatted`. `onValueChange` always reports both values and the chosen serialized value. Server validation remains required.

Use `value` with `onValueChange` for controlled visible input, or `defaultValue` for uncontrolled ownership. Native form reset restores an uncontrolled default; controlled values remain consumer-owned. Supply visible localized format instructions through `Field` description rather than relying on a placeholder.

## Known limitations

The Mergora mask surface repeats the literal Canvas, strong ink, green valid boundary, and violet focus signature while leaving correction text visible. Providing `name` opts into explicit raw or formatted native serialization; omitting it removes the hidden control and successful form value without changing adapter formatting, validation, events, or the accessibility tree.

- Mergora does not provide a universal mask grammar; consumers must supply and review an adapter appropriate to the field purpose, locale, character set, and server contract.
- Bounded input/output cannot preempt blocking code inside a defective trusted adapter module.
- Current mobile, paste, IME, speech, switch, screen-reader, packed-consumer, and package/source-parity evidence is still required.
