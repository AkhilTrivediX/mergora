# Command Center

This source-only workflow composes the canonical Mergora Command Palette around an abort-aware consumer adapter for grouped asynchronous results and command execution. It supports controlled and uncontrolled query/open state, explicit loading, empty and retry paths, recent items, keyboard shortcuts, and a real mobile entry.

## Mergora advantage

The adapter owns ranking, so `shouldFilter={false}` avoids a destructive second filter. Recent commands, visible shortcut labels, execution preview, result-count announcements, the IME-safe global shortcut, and the mobile entry are separate opt-ins. Disabling them removes their requests, listeners, UI, events, and accessibility output while the concise embedded palette remains usable.

## Status

Current status is `source-present-unreleased`. Generated parity, dependency closure, clean-consumer lifecycle evidence, packed consumers, large-result and failure matrices, authorization/security/privacy review, current manual assistive-technology evidence, and an approved Quality Passport remain blockers.
