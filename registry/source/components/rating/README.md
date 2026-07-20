# Rating canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

Precise Ink choices, literal Canvas surfaces, Green selected geometry, Violet two-layer focus, strong numeric hierarchy, and restrained motion make Rating part of the Mergora family. `allowClear` independently adds an explicit native no-rating choice; disabling it removes that control, empty-value event path, and accessible option.

`Rating` uses one native radio input for every editable choice. Arrow keys, Home, End, Space, pointer activation, touch activation, native required validation, submission, external form association, and reset all operate on the same controls. The optional `allowClear` choice is an explicit “No rating” radio with an empty submitted value. It cannot be combined with `required`, because a selected empty radio would otherwise satisfy the browser's required radio-group constraint.

The visible label is rendered as the editable fieldset legend. Each numeric choice receives a locale-formatted accessible label through the provider message `rating.option`; applications can replace that message or `formatOptionLabel` for grammatical reordering. Provider and callback labels fail clearly when blank or longer than 256 Unicode code points, so customization cannot silently erase or flood an accessible name. Selection is shown with star fill, a thicker boundary, a check mark, and native checked state rather than color alone.

`readOnly` does not expose disabled radios or a fabricated interactive role. It renders plain labelled text, an exact locale-formatted value, and decorative fractional star fill. When `name` and a value are present, a hidden successful control preserves the same form behavior as a read-only text field; `disabled` omits it. Fractional values are accepted only in this non-interactive display path. Editable values are whole numbers from one through `maximum`.

Promotion requires generated outputs, package/source parity, packed-consumer form/reset coverage, required/invalid browser behavior, LTR/RTL keyboard review, touch and 320 CSS-pixel geometry, forced-colors and zoom evidence, localized labels, and current risk-class manual assistive-technology sessions.
