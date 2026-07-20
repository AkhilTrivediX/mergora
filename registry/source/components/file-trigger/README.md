# File Trigger canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, real-device picker, or manual assistive-technology claim is made.

`FileTrigger` keeps one real `input type="file"` as the focus, activation, form, reset, and selection authority. The input fills the visible label rather than being replaced by a synthetic button, so keyboard, pointer, touch, speech, and switch users reach the same browser picker. A required visible label names the input and optional visible guidance is connected with `aria-describedby`.

Accepted types are normalized into a bounded set of MIME or extension tokens. This only guides the browser picker; applications must still validate name, type, size, content, and policy before preview or transport. `multiple`, `capture`, directory selection, `name`, and external `form` association remain native attributes. The selection callback receives an immutable array snapshot without clearing or serializing the browser-owned `FileList`.

Mergora composites share one internal FileList synchronizer rather than reimplementing DataTransfer assignment. It accepts at most 100 real File objects, enforces single-versus-multiple input policy, verifies the assigned list, clears before every failure, and never dispatches synthetic input or change events. It is not re-exported from this item index as a consumer API.

Directory and camera capture vary by browser and device. Products that request capture must retain an ordinary file alternative, explain privacy before selection, and never begin upload merely because the picker returned files.

Promotion requires generated outputs, packed package/source parity, real browser and device picker coverage, native form/reset/disabled verification, 44 CSS pixel and zoom evidence, forced-colors/RTL review, and current risk-class manual assistive-technology sessions.
