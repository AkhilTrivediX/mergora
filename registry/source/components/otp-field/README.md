# OtpField canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, autofill-compatibility, authentication, security, or manual assistive-technology claim is made.

One strong Ink control, literal Canvas cells, Green completion state, Violet focus seam, tabular characters, and purposeful grouping establish the Mergora signature. Grouping and consumer-owned `onComplete` integration are independently selectable; omitting the callback emits no completion event or accessibility output.

`OtpField` keeps one real native text input as the focus, editing, autofill, paste, validation, form, and reset control. The visible grouping guides are `aria-hidden` decoration, not separate inputs, so a six-character code has one label and one tab stop. The forwarded ref targets that input.

The default `autocomplete="one-time-code"`, `inputMode="numeric"`, and `[0-9]*` pattern provide mobile and autofill hints without replacing browser behavior. `characterSet="alphanumeric"` is available for protocols that genuinely use ASCII letters and digits. Values are NFKC-normalized, filtered to the selected machine-character set, bounded to the total of `groups`, and serialized without visual separators. Paste reads only the current paste event text to insert and normalize the complete bounded value; it is never logged, persisted, transmitted, or blocked. Composition remains native until `compositionend`, then follows the same bounded normalization.

`groups` defaults to `[3, 3]`; every group must be a positive integer and the total must be from four through twelve. Supply a localized `groupingLabel` when the default English description is not appropriate. Completion only calls `onComplete`. It never submits, advances focus, contacts a server, or claims verification.

Use `value` with `onChange` for controlled ownership, or `defaultValue` for uncontrolled ownership. Native form reset restores an uncontrolled default. Controlled values remain consumer-owned.

Never use one-time-code transcription as a memory, arithmetic, puzzle, or other cognitive-function test. The owning authentication workflow must provide delivery context, expiry, resend, rate-limit, recovery, and server-error behavior.

## Known limitations

- Current platform evidence for SMS and app-delivered one-time-code autofill is still required before promotion.
- The built-in character sets are intentionally bounded to ASCII numeric or alphanumeric protocols; protocol-specific alphabets require a different reviewed contract.
- A locally complete value is not proof that a code is authentic, current, or accepted.
