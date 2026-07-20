# FileUpload canonical source

Status: source present and unreleased. No Stable, package-parity, adapter interoperability, or manual assistive-technology claim is made.

`FileUpload` composes `Dropzone` and `UploadProgress` into an ordered, controlled-or-uncontrolled queue. Picker, paste, and drop share the primitive classifier. Selection produces immutable queued items, while upload status, progress, retry, cancellation, persistence, credentials, and network work remain entirely consumer-owned.

The lightweight default accepts files and renders their order without preview decoding, duplicate work, progress regions, live rejection recovery, or mutation actions. Type preflight is enabled only with `acceptedFileTypes`; size preflight only with `validateFileSize`; duplicate detection only with `duplicatePolicy="reject"`. Preview rendering, reordering, progress, rejection recovery, retry, cancel, and remove affordances are separately gated. A disabled enhancement renders no related UI or accessibility output and does not invoke its callback or resolver branch.

Queue reordering uses Earlier and Later buttons so keyboard, touch, speech, and switch users have the same capability without a drag gesture. The workbench structure uses literal canvas surfaces, strong ink rules, shared focus geometry, restrained corners, semantic status signals, and logical layout. Narrow layouts collapse cleanly, forced colors retain boundaries and focus, and reduced motion removes transition timing.

Optional `name`, `form`, and `required` props synchronize controlled or uncontrolled queue Files into the one native Dropzone input through the shared bounded FileList helper. Initial/default values, external controlled replacement, picker/paste/drop changes, removal, and reset therefore share the same successful control. Unsupported or incomplete assignment clears the native value, sets a blocking validity error, and exposes visible recovery; no synthetic input or change event is dispatched.

Promotion requires generated outputs, package/source/native/Shadcn parity, packed consumers, direct/mock/multipart/tus-compatible adapter fixtures, cross-browser intake and lifecycle evidence, narrow/RTL/touch/preferences evidence, and current risk-class manual assistive-technology sessions.
