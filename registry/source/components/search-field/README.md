# SearchField canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, search-result-quality, or manual assistive-technology claim is made.

`SearchField` forwards its ref to one real `input type="search"`. Native editing, paste, undo, IME composition, validation, `name` and `form` ownership, Enter submission, and reset remain available. Add `role="search"` and an accessible name to the containing form when the form is a search landmark.

The clear action is a real non-submit button. It is unavailable while the input is empty, read-only, disabled, or composing; clearing restores focus to the input. Supplying `submitLabel` adds a real submit button, while Enter continues to use the browser's native form behavior. Use `value` and `onChange` for URL- or server-coordinated controlled search, or `defaultValue` for uncontrolled native ownership.

`resultsId` is merged into `aria-controls` so the query can reference consumer-rendered results. The discriminated `status` contract requires explicit localized text for `loading`, `results`, `empty`, and `error`; those messages are included in the input's description. Loading sets busy state, and errors use an alert plus `aria-errormessage`. The component intentionally does not fetch, rank, virtualize, or render results.

## Known limitations

- Consumers must prevent stale remote responses from replacing or announcing the current query's result state.
- Recorded mobile keyboard, IME, speech, switch, and manual screen-reader evidence is still required before promotion.
- Browser-native search affordances vary; Mergora suppresses the WebKit cancel glyph to avoid a duplicate unlabeled clear action.
