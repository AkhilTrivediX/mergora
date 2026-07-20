# PhoneField canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, numbering-accuracy, adapter-compatibility, or manual assistive-technology claim is made.

`PhoneField` keeps one real `type="tel"` input as the editable control and forwards its ref. Native selection, undo, paste, autocomplete, mobile keyboard behavior, validation, focus, and IME events remain available. The component does not intercept browser or editor keys. During composition, visible text is preserved and canonical output is withheld until `compositionend`.

A `PhoneFormatAdapter` is required. It is synchronous trusted application code that owns supported-country parsing, formatting, exact validity, canonical E.164 output, and caret mapping. Mergora checks bounded result shape and generic E.164 syntax, but deliberately ships no fake global numbering database. Do not create an adapter from registry metadata, URL state, remote script, or other untrusted executable input.

`country.label` must be localized visible text containing a letter or number; a flag or symbol alone is rejected. The calling code is displayed beside it in an isolated bidirectional span. Applications that need country selection should compose a separately labelled select and update the typed `country` value.

The editable formatted input does not carry `name`. When `name` is supplied, a hidden same-form control submits only a valid E.164 value such as `+14155552671`. Enable `extension` with an explicit localized `extensionLabel`; `extensionName` serializes its bounded decimal value separately because an extension is not part of E.164. Server validation remains required.

Use `value` with `onValueChange` for controlled visible text, or `defaultValue` for uncontrolled ownership. Extension ownership is independently controlled by `extensionValue` or `defaultExtensionValue`. Native form reset restores uncontrolled defaults; controlled values remain consumer-owned.

## Known limitations

The Mergora phone surface repeats the literal Canvas, strong ink, green valid boundary, isolated calling-code hierarchy, and violet focus seam. Canonical E.164 serialization (`name`) and separately labelled extension capture (`extension`) are independent enhancements. Omitting either removes its hidden successful control or visible input, callbacks, form value, and accessibility output without changing the native telephone editor.

- Production accuracy and supported regions are entirely adapter-owned and require compatibility and numbering-data review before promotion.
- The built-in extension control accepts decimal extensions. Pauses, waits, and service-code syntaxes require a separately reviewed composed control.
- Current production-adapter, mobile, autofill, speech, switch, screen-reader, packed-consumer, and package/source-parity evidence is still required.
