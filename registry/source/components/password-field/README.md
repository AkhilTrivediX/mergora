# PasswordField canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, password-manager-compatibility, security, or manual assistive-technology claim is made.

`PasswordField` keeps one real native input as the form control and forwards its ref. Native `name`, `form`, `required`, `disabled`, `readOnly`, validation, submission, paste, composition, and reset behavior remain available. Supply an intentional `autocomplete` value such as `current-password` or `new-password`; the component never cancels paste, observes clipboard data, transforms credentials, or blocks browser and password-manager assistance.

The reveal action is a real `type="button"` with localized show/hide naming and `aria-pressed`. It changes only the input's presentation type and returns focus to the input. Caps Lock is reported from the focused input's keyboard modifier state without canceling any key. Because browsers expose no global Caps Lock subscription, the status updates only when the input receives keyboard events.

Requirements are consumer-authored policy checks. Each rule exposes visible `Met` or `Not met` text in a named list, so status never relies on color or an icon alone. This is deliberately not a strength meter: Mergora makes no entropy, breach, or crack-time claim. Keep requirement functions deterministic and free of logging, telemetry, or network work.

Use `value` with `onChange` for controlled ownership, or `defaultValue` for uncontrolled native ownership. Native form reset restores an uncontrolled default and also conceals the password again. Controlled values remain consumer-owned.

## Known limitations

The Mergora credential surface uses literal Canvas, a strong ink boundary, a violet focus seam, and restrained green rule completion. Consumer-supplied `rules` provide a useful policy checklist without inventing a strength score. Passing the default empty array removes the list, rule validation calls, description ID, state labels, and accessibility output while native credential editing, reveal, paste, autofill, reset, and serialization remain intact.

- Recorded password-manager, passkey-adjacent, mobile keyboard, speech, switch, and manual screen-reader evidence is still required before promotion.
- Revealing a password necessarily displays sensitive text on screen; applications should not force revelation or retain that state across resets.
- Requirement status is only as accurate as the consumer's real authentication policy.
