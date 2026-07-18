# Input canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`Input` forwards its ref and native input attributes to the real control. It preserves `name`, `value`, `form`, `autocomplete`, `inputmode`, native validation, autofill, paste, browser credential assistance, password-manager discovery, submission, and reset behavior. It never transforms credentials or observes input values. Field is the ID authority for integrated usage; a conflicting child `id` is ignored with a development diagnostic so the visible label remains associated. Native `aria-invalid` values (`true`, `grammar`, and `spelling`) remain intact while visual invalid state and Field error linkage are derived separately.

Adornments are visual and hidden from the accessibility tree. Detectable interactive, focusable, interactive-role, or pointer/key-handler content is rejected; custom adornment components remain responsible for rendering decoration only. The visible `Field` label remains outside the hidden wrapper and supplies the accessible name.

Native `className` and `style` target the real input. Use `rootClassName` and `rootStyle` only for the visual wrapper.

Use purpose-specific autocomplete tokens (`name`, `email`, `username`, `current-password`, or `new-password`) and an appropriate mobile `inputMode`. Do not disable paste or require memory/transcription puzzles for authentication. Promotion requires real autofill/password-manager/manual authentication review in addition to generated, browser, consumer, and parity evidence.
