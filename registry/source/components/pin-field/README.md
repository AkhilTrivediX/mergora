# PinField canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, password-manager-compatibility, authentication, security, or manual assistive-technology claim is made.

Strong Ink structure, literal Canvas segments, Green completeness, Violet focus, tabular entry, and a bounded warning rail align PinField with Mergora. Visibility, paste policy, and consumer-owned completion integration stay independently configurable; the default keeps native password and paste behavior.

`PinField` is deliberately a reusable-secret control, not an OTP control. The required `purpose="reusable-secret"` prop makes that choice explicit, and a localized programmatic description reinforces it. Use `OtpField` for codes that expire or are valid once.

One real native input owns focus, editing, selection, caret, composition, password-manager discovery, paste, validation, form submission, and reset. Decorative segment guides are `aria-hidden`; there is one label and one tab stop. `displayMode="secure"` uses native `type="password"`, while `displayMode="visible"` uses native `type="text"`. Visible mode deliberately exposes the PIN on screen.

Paste defaults to `allow`, preserving the browser and password manager. In allow mode, the current paste event text is read only to normalize the bounded insertion; it is never logged, persisted, or transmitted. An application with a reviewed policy can select `pastePolicy="block"`; the component then cancels the paste without reading clipboard contents and announces `pasteBlockedMessage`. Blocking paste can reduce accessibility and password-manager utility and should not be selected casually.

Values are NFKC-normalized to ASCII digits and bounded to `length`, which defaults to four and supports four through twelve. Completion calls `onComplete` once for each newly complete value and does not repeat for an unchanged complete value; it never submits, authenticates, increments an attempt counter, or contacts a server. Use `value` with `onChange` for controlled ownership, or `defaultValue` for uncontrolled ownership. Native form reset restores an uncontrolled default and clears paste status.

The owning workflow remains responsible for attempt limits, lockout recovery, transport, storage, server verification, and auditing without logging the secret.

## Known limitations

- The component does not authenticate, encrypt, transport, store, rate-limit, or lock a PIN.
- Native password masking and password-manager behavior vary by browser and platform and still require current evidence.
- Blocking paste is an explicit compatibility and accessibility tradeoff, not a security claim.
