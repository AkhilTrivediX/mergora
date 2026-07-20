# File Manager

Source-owned file workspace with folder navigation, list/grid browsing, upload state, preview, rename and move flows, and explicit offline/error handling.

## Mergora advantage

`enableRecoveryActions`, `showConflictGuidance`, `showStorageContext`, `announceOperations`, and `virtualWindow` are independent. Recommended mode replaces permanent deletion with a consumer-owned recovery receipt and undo path, explains version conflicts before resolution, and exposes storage pressure without coupling the kit to a provider. Turning any enhancement off removes its UI, behavior, callbacks, and accessibility output.

## Integration boundary

The adapter owns persistence, permissions, uploads, storage, network, retention, malware scanning, privacy, and legal policy. The deterministic adapter is fictional local test data and never performs I/O.

## Status

`source-present-unreleased`. Generated parity, lifecycle fixtures, packed consumers, supported-browser/visual gates, and the complete Risk Class 3 manual matrix remain promotion blockers.
