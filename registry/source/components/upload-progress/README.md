# Upload Progress canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, live-transport, or manual assistive-technology claim is made.

`UploadProgress` composes the native Mergora `Progress` primitive with explicit file or aggregate lifecycle text. Queued, uploading, paused, retrying, complete, error, and cancelled states are visible words plus stable data attributes; none depends on fill color or motion. Optional uploaded and total bytes use locale-formatted IEC units alongside percentage.

The progress element itself is not a live region. By default, a separate polite atomic region announces only when status changes or the percentage crosses the configured bucket, so frequent byte updates do not flood assistive technology. `announceProgress={false}` independently removes that live region and its update behavior while retaining the visible labelled progress and status. Terminal states announce immediately, complete resolves to the exact maximum, and reduced motion removes the indeterminate animation without hiding its text.

This component does not start, pause, retry, cancel, or remove uploads. Those actions belong to clearly named adjacent controls owned by `FileUpload`, and transport truth remains consumer state. Error and paused recovery stays persistently visible rather than existing only in a toast.

Promotion requires generated outputs, package/source parity, packed consumers, rapid-update announcement tests, native progress and all lifecycle-state browser coverage, locale/RTL/320 CSS pixel/zoom/forced-colors/reduced-motion evidence, and current risk-class manual assistive-technology sessions.
