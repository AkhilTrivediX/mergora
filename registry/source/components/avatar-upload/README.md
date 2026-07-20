# AvatarUpload canonical source

Status: source present and unreleased. No Stable, package-parity, image-safety, server-lifecycle, or manual assistive-technology claim is made.

`AvatarUpload` keeps one real `FileTrigger` for browser picker security, required validation, native FormData, disabled omission, and reset. The selected image can be controlled with `value` or initialized with `defaultValue`; both paths synchronize through the bounded shared FileList helper and share reasoned selection, removal, and reset callbacks. Unsupported assignment clears and blocks the successful control instead of claiming parity. Server upload, replacement, removal, credentials, and storage remain consumer responsibilities.

The default stays lightweight: it provides an image-constrained native picker and concise ready state without creating an object URL, reading metadata, announcing custom recovery, showing mutation actions, or rendering upload lifecycle. Preview, metadata, edit, remove, rejection recovery, progress, and retry are independently enabled. `previewTransform` is invoked only while preview is enabled; it receives an `AbortSignal`, returns a Blob, and remains compatible with a consumer crop adapter.

When preview is enabled, AvatarUpload creates one object URL from the selected or transformed Blob, aborts stale asynchronous work, and revokes the owned URL on replacement, preview disablement, or unmount. Metadata intentionally stays to name, locale-aware size, and MIME type so core does not decode untrusted content. Type and optional size failures clear the native selection, set native custom validity, and can expose persistent polite recovery.

The component repeats the Mergora workbench signature: literal canvas, strong ink rules, restrained image boundary, decisive label hierarchy, two-layer focus geometry, semantic lifecycle status, logical layout, narrow reflow, forced-color mappings, and reduced-motion fallback.

Promotion requires generated outputs, package/source/native/Shadcn parity, packed consumers, cross-engine native form and preview-lifecycle evidence, a tested crop adapter, server lifecycle documentation, narrow/RTL/touch/preferences evidence, and current risk-class manual assistive-technology sessions.
