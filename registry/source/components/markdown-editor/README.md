# Markdown Editor

Status: source present and unreleased. No Stable, sanitization, upload-transport, package-parity, or manual Risk Class 3 claim is made.

`MarkdownEditor` keeps a labelled native textarea as the editable and successful form control. Its optional Mergora tools are deliberately separate: a roving formatting toolbar with IME-safe shortcuts, tabs or a narrow-safe split preview, a Unicode-aware word count, an abortable clipboard adapter, and an abortable pasted-file adapter. Disabling or omitting each removes its UI, behavior, callbacks, pending state, and accessibility output.

Preview content is React output from the consumer and is not automatically sanitized. Consumers own parser/sanitizer policy, safe URL handling, uploads, credentials, cancellation, validation, and persistent recovery.

The editor repeats the Mergora workbench through a literal Canvas textarea, Ink source/preview frames, decisive labels, Green selection/readiness, Violet preview context, shared two-layer focus, bounded corners, logical layout, one-column narrow reflow, forced colors, and no decorative editor motion.
