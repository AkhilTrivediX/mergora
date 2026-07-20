# Dropzone canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, cross-application drag/drop, or manual assistive-technology claim is made.

`Dropzone` uses React Aria's accessible drop-target model and always includes the native `FileTrigger` alternative. Desktop drag/drop, platform file selection, and clipboard file paste enter one bounded classifier; no path begins an upload. The visible label names the target, persistent guidance describes the policy, and a polite status reports accepted and rejected counts.

At most 100 dropped entries are inspected. Directory, text, unreadable, oversized, excess-count, and disallowed-type inputs become explicit rejections. MIME and extension checks are usability filters rather than security boundaries; products must verify content and server policy again before preview or transport. Asynchronous `FileDropItem` reads carry a sequence, so a slow earlier drop cannot replace a later user's result.

Type preflight is enabled only by supplying `acceptedFileTypes`. Size preflight preserves the existing 100 MiB default and can be independently removed with `validateFileSize={false}`; when removed, it produces no size rejection, UI, event, or accessibility output. Count and the 100-entry inspection ceiling remain bounded safety behavior rather than an upload policy.

Optional `name`, `form`, and `required` props make the one internal FileTrigger a native successful form control. Every picker, paste, or drop result synchronizes only accepted File objects through the shared bounded DataTransfer path; rejected files never remain in FormData. Unsupported or incomplete assignment clears the control, exposes recovery, and returns `formDataSynchronized: false`. Native reset restores the idle status and calls `onReset` without dispatching synthetic input or change events.

The surface changes dashed boundary to solid plus an outline while targeted, retains a native choose-files path at narrow/mobile sizes, and uses semantic tokens with forced-color fallbacks. Paste is intercepted only when clipboard files exist, preserving ordinary text behavior elsewhere.

Promotion requires generated outputs, package/source parity, packed consumers, picker/paste/drop/nested-drag browser coverage, bounded rejection and concurrency tests, mobile fallback, 320 CSS pixel/zoom/RTL/forced-colors evidence, and current risk-class manual assistive-technology sessions.
