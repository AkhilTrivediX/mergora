# Inline Edit canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`InlineEdit` separates a saved value from an editable draft. View mode always renders the saved value and a visible edit button. Edit mode uses a native `input` or `textarea`, plus visible Save and Cancel buttons. Enter saves a single-line input; Control+Enter or Command+Enter saves a textarea; Escape cancels either editor. None of those commands fires while IME composition is active.

When the visible `label` is plain text and `editLabel` is not customized, the Edit button receives a contextual accessible name such as “Edit Feature name” while retaining the visible “Edit” text in the same order. Rich labels or repeated instances should provide `editAccessibleLabel` or an already-contextual `editLabel`.

The safe default `blurBehavior="keep-editing"` leaves the draft open when focus moves away. The explicit `save` policy validates and attempts the same protected save path on an outside blur. Validation and rejected async saves keep the draft in the native editor, expose one persistent associated error, and return focus to that editor. Cancel restores the saved value and then restores focus to Edit.

Only one save can run at a time. Every save receives an `AbortSignal`, has an operation identity, and is ignored after reset or unmount. A controlled value that changes independently during an edit blocks a stale submission and leaves the draft available for review. Pending editors become read-only, Save exposes busy state, and Cancel waits until the in-flight operation settles so a consumer callback cannot commit after the interface claims cancellation.

When `name` is supplied, one hidden control serializes the saved value, not the draft. `disabled` omits that control; `readOnly` keeps it successful. Native form reset restores the uncontrolled default and exits editing. The hidden input does not participate in browser constraint validation, so `required` is enforced when Inline Edit saves; an owning form remains responsible for its validation summary and server validation.

Promotion requires generated outputs, package/source parity, packed-consumer form/reset fixtures, async cancellation/stale/double-submit evidence, validation and recovery across browsers, IME and multiline keyboard coverage, focus restoration, disabled/read-only semantics, 320 CSS-pixel/RTL/forced-colors review, and current risk-class manual assistive-technology sessions.
